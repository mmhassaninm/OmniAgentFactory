import asyncio
import json
import logging
from typing import AsyncGenerator, List, Optional

from tools.executor import execute_tool, ToolResult
from tools.registry import get_tools_for_provider, TOOL_ICONS
from tools.router import get_routed_tool_names
from agent.memory import ShortTermMemory
from agent.tiered_memory import auto_extract_and_store
from agent.personas import get_persona
from agent.run_logger import AgentRunLogger

logger = logging.getLogger(__name__)

FINISH_SIGNALS = ("TASK_COMPLETE", "FINAL_ANSWER", "NO_MORE_TOOLS", "DONE", "FINISHED")

AGENT_SYSTEM = """You are an autonomous AI agent. Your job is to accomplish the given task step by step using available tools.

RULES:
1. Think before every action — explain your reasoning briefly.
2. Use tools when you need information or need to compute something.
3. After getting a tool result, evaluate whether the task is complete.
4. When the task is complete, start your response with exactly: TASK_COMPLETE
   Followed by your final answer.
5. If you cannot complete the task after using all available tools, say TASK_COMPLETE and explain why.
6. Be concise in your thinking. Don't repeat yourself.
7. LANGUAGE: Match the user's language (Arabic → Arabic, English → English).
"""


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def run_agent_loop(
    task: str,
    tools: List[str],
    provider,
    model: str,
    max_iterations: int = 8,
    persona_id: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """
    Core agent loop: Think → Act → Observe → Decide.
    Yields SSE-formatted strings.
    """
    persona = get_persona(persona_id)
    system_prompt = persona["system_prompt"]

    # Boost preferred tools from persona (add to front of tool list)
    preferred = persona.get("preferred_tools", [])
    if preferred and tools:
        prioritized = preferred + [t for t in tools if t not in preferred]
        tools = prioritized

    provider_name = getattr(provider, "name", "openai")

    # Initialize run logger (Direction 8 — Agent Replay)
    run_log = AgentRunLogger(
        task=task, persona=persona_id or "general",
        tools=tools or [], provider=provider_name, model=model,
    )
    run_id = await run_log.start()

    memory = ShortTermMemory(max_entries=30)
    memory.add("system", system_prompt)
    memory.add("user", f"TASK: {task}")

    # Emit run_id so frontend can link to replay
    yield _sse("agent_run_id", {"run_id": run_id})
    yield _sse("status", {"message": f"{persona['icon']} {persona['name']} activated"})

    # Semantic routing: narrow tool set to what's relevant for this task
    if tools:
        routed_names, routing_meta = get_routed_tool_names(task, tools, max_tools=5, min_score=0.1)
        if routing_meta:
            yield _sse("tool_routing", {
                "selected": routed_names,
                "scores": {r["name"]: r["score"] for r in routing_meta},
                "reasons": {r["name"]: r["reason"] for r in routing_meta},
            })
        effective_tools = routed_names
    else:
        effective_tools = None

    tools_schema = get_tools_for_provider(provider_name, effective_tools)

    for iteration in range(1, max_iterations + 1):
        logger.info("[agent] iteration %d/%d", iteration, max_iterations)
        yield _sse("status", {"message": f"🤖 Agent step {iteration}/{max_iterations}..."})

        # ── THINK phase ────────────────────────────────────────────────────────
        thought_tokens = ""
        tool_calls: dict = {}
        token_buffer = ""

        async for event_type, data in provider.stream_chat(
            messages=memory.to_messages(),
            model=model,
            temperature=0.4,
            max_tokens=1024,
            tools=tools_schema,
        ):
            if event_type == "content":
                token_buffer += data
                if len(token_buffer) > 15 and "<" not in token_buffer:
                    thought_tokens += token_buffer
                    yield _sse("agent_think", {"iteration": iteration, "token": token_buffer})
                    token_buffer = ""

            elif event_type == "tool_call":
                tc = data
                idx = tc.get("index", 0)
                if idx not in tool_calls:
                    tool_calls[idx] = {"index": idx, "id": tc.get("id", ""), "name": "", "arguments": ""}
                if tc.get("name"):
                    tool_calls[idx]["name"] = tc["name"]
                if tc.get("arguments"):
                    tool_calls[idx]["arguments"] = tc["arguments"]
                if tc.get("id"):
                    tool_calls[idx]["id"] = tc["id"]

            elif event_type == "done":
                break

        # Flush buffer
        if token_buffer:
            thought_tokens += token_buffer
            yield _sse("agent_think", {"iteration": iteration, "token": token_buffer})

        # Record full thought into run log
        if thought_tokens:
            run_log.record("agent_think", {"iteration": iteration, "thought": thought_tokens})

        # Check for finish signal in thought
        if any(sig in thought_tokens.upper() for sig in FINISH_SIGNALS):
            final_answer = thought_tokens
            for sig in FINISH_SIGNALS:
                final_answer = final_answer.replace(sig + ":", "").replace(sig, "").strip()
            finish_data = {"iterations": iteration, "answer": final_answer, "success": True}
            run_log.record("agent_finish", finish_data)
            await run_log.finish(success=True, summary=final_answer, iterations=iteration)
            yield _sse("agent_finish", finish_data)
            return

        tc_list = [v for v in tool_calls.values() if v.get("name")]

        # No tool calls and no finish signal → treat response as final
        if not tc_list:
            finish_data = {"iterations": iteration, "answer": thought_tokens or "Task analysis complete.", "success": True}
            run_log.record("agent_finish", finish_data)
            await run_log.finish(success=True, summary=thought_tokens, iterations=iteration)
            yield _sse("agent_finish", finish_data)
            return

        # Append assistant turn with tool calls
        memory.add("assistant", thought_tokens or "", {
            "tool_calls": [
                {"id": tc.get("id") or f"call_{i}", "type": "function",
                 "function": {"name": tc["name"], "arguments": tc["arguments"]}}
                for i, tc in enumerate(tc_list)
            ]
        })

        # ── ACT + OBSERVE phases (parallel execution) ──────────────────────────
        # Parse all arguments and emit agent_act events before dispatching
        parsed_calls = []
        for tc in tc_list:
            args = {}
            try:
                args = json.loads(tc["arguments"])
            except Exception as e:
                logger.warning("Failed to parse tool arguments for %s: %s", tc.get("name", "unknown"), e)
            call_id = tc.get("id") or f"call_{iteration}"
            icon = TOOL_ICONS.get(tc["name"], "🔧")
            parsed_calls.append((tc, args, call_id, icon))

            yield _sse("agent_act", {
                "iteration": iteration,
                "tool_name": tc["name"],
                "call_id": call_id,
                "icon": icon,
                "arguments": {k: (str(v)[:150] if isinstance(v, str) else v) for k, v in args.items()},
            })

        # Execute all tool calls concurrently via asyncio.gather
        ev_loop = asyncio.get_event_loop()

        async def _run_one(tc_name: str, tc_args: dict) -> ToolResult:
            return await ev_loop.run_in_executor(None, execute_tool, tc_name, tc_args)

        results: list[ToolResult] = await asyncio.gather(
            *[_run_one(tc["name"], args) for (tc, args, _, _) in parsed_calls],
            return_exceptions=False,
        )

        parallel_info = f"parallel={len(parsed_calls)}" if len(parsed_calls) > 1 else "sequential"

        # Emit observe events and store results
        for (tc, args, call_id, icon), result in zip(parsed_calls, results):
            if result.ok:
                obs_data = {
                    "iteration": iteration, "tool_name": tc["name"], "call_id": call_id,
                    "icon": icon, "output": result.truncated(600),
                    "execution_time_ms": result.execution_time_ms, "ok": True,
                    "parallel": parallel_info,
                }
                run_log.record("agent_observe", obs_data)
                yield _sse("agent_observe", obs_data)
                auto_extract_and_store(tc["name"], result.output or "")
            else:
                obs_data = {
                    "iteration": iteration, "tool_name": tc["name"], "call_id": call_id,
                    "icon": icon, "error": result.error,
                    "execution_time_ms": result.execution_time_ms, "ok": False,
                    "parallel": parallel_info,
                }
                run_log.record("agent_observe", obs_data)
                yield _sse("agent_observe", obs_data)

            memory.add("tool", result.truncated(4000))

        # ── REFLECT phase (every 3 iterations) ─────────────────────────────────
        if iteration % 3 == 0 and iteration < max_iterations:
            reflect_prompt = (
                f"You have completed {iteration} steps toward: {task!r}. "
                "Briefly assess: (1) What have you learned so far? "
                "(2) Are you on track? (3) Should you change your approach? "
                "Keep it under 3 sentences. Start with 'REFLECTION:'"
            )
            reflect_msgs = memory.to_messages() + [{"role": "user", "content": reflect_prompt}]
            reflection_text = ""
            async for ev, dat in provider.stream_chat(
                messages=reflect_msgs,
                model=model,
                temperature=0.3,
                max_tokens=200,
                tools=None,  # no tools during reflection
            ):
                if ev == "content":
                    reflection_text += dat
                elif ev == "done":
                    break

            reflection_text = reflection_text.strip()
            if reflection_text:
                yield _sse("agent_reflect", {
                    "iteration": iteration,
                    "reflection": reflection_text,
                })
                memory.add("system", f"[Self-reflection at step {iteration}]: {reflection_text}")

    # Max iterations reached — emit final with accumulated thought
    max_finish_data = {
        "iterations": max_iterations,
        "answer": "Maximum iterations reached. Here is the partial result from the last step.",
        "success": False,
    }
    run_log.record("agent_finish", max_finish_data)
    await run_log.finish(success=False, summary=None, iterations=max_iterations)
    yield _sse("agent_finish", max_finish_data)
