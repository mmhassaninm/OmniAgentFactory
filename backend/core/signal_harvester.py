"""
SignalHarvester: Converts agent interactions into real, objective reward signals.
Every action the agent takes produces a verifiable outcome. We harvest it.

This module contains ZERO LLM calls to prevent semantic reward-hacking.
It operates purely as a data-driven parser and analyzer of execution traces.
"""

import re
import logging
import json
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from core.database import get_db

logger = logging.getLogger(__name__)


class SignalHarvester:
    """
    Harvests binary and numeric execution signals from agent runs, tool outputs,
    and test suites, compiling them into objective session reward scores.
    """

    @staticmethod
    def harvest_from_tool_result(tool_name: str, result: Any, duration_ms: int = 0) -> Dict[str, Any]:
        """
        Parses raw tool outputs to extract binary or numeric success signals.
        - Code execution (bash/execute_command): checks for exit codes or exceptions.
        - HTTP/API requests: checks HTTP status codes (2xx).
        - File writing/manipulation: verifies correct execution.
        """
        value = 1.0
        evidence = ""

        # Normalize result to dict or string
        result_dict = {}
        if isinstance(result, dict):
            result_dict = result
            evidence = json.dumps(result)[:500]
        elif isinstance(result, str):
            evidence = result[:500]
            try:
                result_dict = json.loads(result)
            except Exception:
                pass

        # Rule A: Explicit ok flag
        if "ok" in result_dict:
            value = 1.0 if result_dict["ok"] else 0.0

        # Rule B: Exit code verification
        elif "exit_code" in result_dict:
            value = 1.0 if result_dict["exit_code"] == 0 else 0.0

        # Rule C: HTTP status codes
        elif "status_code" in result_dict:
            status = result_dict["status_code"]
            value = 1.0 if 200 <= status < 300 else 0.0

        # Rule D: Raw string scanning for python tracebacks/errors
        elif isinstance(result, str):
            lower_res = result.lower()
            if any(err in lower_res for err in ["traceback", "syntaxerror", "exception:", "failed:", "error:"]):
                value = 0.0
            else:
                value = 1.0

        return {
            "signal_type": "execution",
            "value": value,
            "tool_name": tool_name,
            "raw_evidence": evidence,
            "duration_ms": duration_ms,
            "created_at": datetime.now(timezone.utc)
        }

    @staticmethod
    def harvest_from_test_run(test_output: str) -> float:
        """
        Parses stdout/stderr from pytest or unittest runs to extract passed/total ratios.
        Returns a float between 0.0 and 1.0. Never uses LLM.
        """
        if not test_output or not isinstance(test_output, str):
            return 0.0

        # Pytest formats:
        # "X passed, Y failed, Z error in 0.5s"
        # "X passed in 0.5s"
        # "no tests ran in 0.02s"
        pytest_summary_match = re.search(r"===\s*(.*?)\s*===", test_output)
        if pytest_summary_match:
            summary_text = pytest_summary_match.group(1).lower()
            passed_match = re.search(r"(\d+)\s+passed", summary_text)
            failed_match = re.search(r"(\d+)\s+failed", summary_text)
            errors_match = re.search(r"(\d+)\s+error", summary_text)

            passed = int(passed_match.group(1)) if passed_match else 0
            failed = int(failed_match.group(1)) if failed_match else 0
            errors = int(errors_match.group(1)) if errors_match else 0

            total = passed + failed + errors
            if total > 0:
                return float(passed) / float(total)

        # Unittest formats:
        # "Ran X tests in Ys\nFAILED (failures=A, errors=B)"
        # "Ran X tests in Ys\nOK"
        unittest_ran_match = re.search(r"Ran\s+(\d+)\s+tests?", test_output, re.IGNORECASE)
        if unittest_ran_match:
            total = int(unittest_ran_match.group(1))
            if "OK" in test_output:
                return 1.0
            failed_match = re.search(r"failures=(\d+)", test_output, re.IGNORECASE)
            errors_match = re.search(r"errors=(\d+)", test_output, re.IGNORECASE)

            failed = int(failed_match.group(1)) if failed_match else 0
            errors = int(errors_match.group(1)) if errors_match else 0

            passed = total - (failed + errors)
            if total > 0:
                return max(0.0, float(passed) / float(total))

        # Simple count backups
        passed_simple = len(re.findall(r"PASSED", test_output))
        failed_simple = len(re.findall(r"FAILED", test_output))
        total_simple = passed_simple + failed_simple
        if total_simple > 0:
            return float(passed_simple) / float(total_simple)

        # Fallback
        if "fail" in test_output.lower() or "error" in test_output.lower():
            return 0.0
        if "pass" in test_output.lower() or "ok" in test_output.lower():
            return 1.0

        return 0.0

    async def harvest_from_run_log(self, agent_id: str, session_id: str) -> List[Dict[str, Any]]:
        """
        Parses agent run records from the 'agent_runs' collection to identify retry penalties,
        loop penalties, and tool executions. Saves signals to the DB automatically.
        """
        db = get_db()
        run_doc = await db.agent_runs.find_one({"run_id": session_id})
        if not run_doc:
            logger.warning("[SignalHarvester] Could not find run document with run_id: %s", session_id)
            return []

        signals = []
        steps = run_doc.get("steps", [])
        tool_calls_history = []

        for idx, step in enumerate(steps):
            event = step.get("event")
            data = step.get("data") or {}

            if event == "agent_observe":
                tool_name = data.get("tool_name", "unknown")
                execution_time = data.get("execution_time_ms", 0)
                is_ok = data.get("ok", True)
                output = data.get("output") or data.get("error") or ""

                # 1. Capture tool execution signal
                tool_signal = self.harvest_from_tool_result(
                    tool_name=tool_name,
                    result=data,
                    duration_ms=execution_time
                )
                tool_signal.update({
                    "agent_id": agent_id,
                    "session_id": session_id,
                })
                signals.append(tool_signal)

                # 2. Check if it's a test execution tool call
                args_str = str(data.get("arguments", "")).lower()
                is_test_command = "pytest" in args_str or "unittest" in args_str or "test_" in args_str
                if tool_name in ["execute_command", "run_command", "bash"] and is_test_command:
                    test_ratio = self.harvest_from_test_run(output)
                    test_signal = {
                        "agent_id": agent_id,
                        "session_id": session_id,
                        "signal_type": "test",
                        "value": test_ratio,
                        "tool_name": tool_name,
                        "raw_evidence": output[:300],
                        "duration_ms": execution_time,
                        "created_at": datetime.now(timezone.utc)
                    }
                    signals.append(test_signal)

                # Track calling history for Loop/Retry logic
                tool_args = data.get("arguments", {})
                tool_calls_history.append({
                    "idx": idx,
                    "name": tool_name,
                    "args": tool_args,
                    "ok": is_ok,
                    "output": output
                })

        # 3. Detect loop pattern (same tool + identical arguments 3+ times)
        arg_counts = {}
        for call in tool_calls_history:
            key = (call["name"], json.dumps(call["args"], sort_keys=True))
            arg_counts[key] = arg_counts.get(key, 0) + 1
            if arg_counts[key] == 3:
                loop_signal = {
                    "agent_id": agent_id,
                    "session_id": session_id,
                    "signal_type": "penalty",
                    "value": -1.0,
                    "tool_name": call["name"],
                    "raw_evidence": f"Loop detected: tool {call['name']} called 3 times with same args: {call['args']}",
                    "duration_ms": 0,
                    "created_at": datetime.now(timezone.utc)
                }
                signals.append(loop_signal)

        # 4. Detect retry patterns: if action N+1 corrects/retries action N
        for i in range(len(tool_calls_history) - 1):
            curr_call = tool_calls_history[i]
            next_call = tool_calls_history[i+1]

            # If current failed (or output is empty/error) and next call retries the same target or same tool
            if not curr_call["ok"] or "error" in str(curr_call["output"]).lower():
                # Compare targets: e.g. writing/reading same file or running same command
                curr_args_str = json.dumps(curr_call["args"])
                next_args_str = json.dumps(next_call["args"])
                
                # Simple similarity: if they share the same command or target file
                file_regex = r"['\"]?([\w\-\./]+\.\w+)['\"]?"
                curr_files = set(re.findall(file_regex, curr_args_str))
                next_files = set(re.findall(file_regex, next_args_str))
                
                shared_files = curr_files.intersection(next_files)
                if (curr_call["name"] == next_call["name"] and shared_files) or (curr_call["name"] == next_call["name"] and curr_call["args"] == next_call["args"]):
                    retry_signal = {
                        "agent_id": agent_id,
                        "session_id": session_id,
                        "signal_type": "penalty",
                        "value": -0.5,
                        "tool_name": curr_call["name"],
                        "raw_evidence": f"Retry detected: corrective retry of failed tool {curr_call['name']}.",
                        "duration_ms": 0,
                        "created_at": datetime.now(timezone.utc)
                    }
                    signals.append(retry_signal)

        # Write all signals to MongoDB
        for sig in signals:
            await self.store_signal(agent_id, sig)

        return signals

    @staticmethod
    def compute_session_score(signals: List[Dict[str, Any]]) -> float:
        """
        Computes a session score based on weighted harvested signals.
        - Execution signals: 40% weight
        - Test signals: 40% weight
        - Retry/Loop penalties: 20% weight
        Score returns a float clamped between -1.0 and 1.0.
        """
        if not signals:
            return 0.0

        exec_vals = [s["value"] for s in signals if s["signal_type"] == "execution"]
        test_vals = [s["value"] for s in signals if s["signal_type"] == "test"]
        penalty_vals = [s["value"] for s in signals if s["signal_type"] == "penalty"]

        avg_exec = sum(exec_vals) / len(exec_vals) if exec_vals else 1.0
        avg_test = sum(test_vals) / len(test_vals) if test_vals else 1.0
        sum_penalties = sum(penalty_vals) if penalty_vals else 0.0

        # Weighted calculation
        score = (avg_exec * 0.4) + (avg_test * 0.4) + (sum_penalties * 0.2)

        # Clamp between -1.0 and 1.0
        return max(-1.0, min(1.0, score))

    @staticmethod
    async def store_signal(agent_id: str, signal: Dict[str, Any]):
        """Persists a signal record to the database."""
        db = get_db()
        doc = {
            "agent_id": agent_id,
            "session_id": signal.get("session_id"),
            "signal_type": signal.get("signal_type"),
            "value": float(signal.get("value", 0.0)),
            "tool_name": signal.get("tool_name"),
            "raw_evidence": signal.get("raw_evidence", ""),
            "duration_ms": int(signal.get("duration_ms", 0)),
            "created_at": signal.get("created_at") or datetime.now(timezone.utc)
        }
        await db.agent_signals.insert_one(doc)

    @staticmethod
    async def get_low_score_sessions(threshold: float = 0.4, last_n: int = 50) -> List[Dict[str, Any]]:
        """
        Queries agent_runs and aggregates harvested signals to return low-performing sessions.
        Used for Phase 2 Problem Discovery.
        """
        db = get_db()
        # Find recent finished runs
        runs = await db.agent_runs.find(
            {"status": {"$in": ["success", "failed"]}}
        ).sort("started_at", -1).limit(last_n).to_list(last_n)

        low_score_sessions = []
        harvester = SignalHarvester()

        for run in runs:
            run_id = run["run_id"]
            agent_id = run.get("agent_id") or "unspecified"
            
            # Fetch signals for this run
            signals = await db.agent_signals.find({"session_id": run_id}).to_list(100)
            if not signals:
                # Harvest on the fly if not yet recorded
                signals = await harvester.harvest_from_run_log(agent_id, run_id)

            score = harvester.compute_session_score(signals)
            if score < threshold:
                low_score_sessions.append({
                    "agent_id": agent_id,
                    "session_id": run_id,
                    "score": score,
                    "task": run.get("task", ""),
                    "finished_at": run.get("finished_at"),
                    "description": f"Session {run_id[:8]} failed with score {score:.2f}. Total steps: {len(run.get('steps', []))}."
                })

        return low_score_sessions
