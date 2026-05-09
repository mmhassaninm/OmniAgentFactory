import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";

interface Thought {
  timestamp: string;
  message: string;
  phase: string;
  model_used: string;
}

interface PreviewData {
  agent: { id: string; name: string; goal: string; status: string; version: number; score: number };
  thoughts: Thought[];
  score_history: { version: number; score: number }[];
  current_phase: string;
  evolving: boolean;
}

const phaseColors: Record<string, string> = {
  draft: "#6366f1",
  test: "#f59e0b",
  commit: "#10b981",
  error: "#ef4444",
  idle: "#6b7280",
  evolving: "#8b5cf6",
};

const phaseIcons: Record<string, string> = {
  draft: "✍️",
  test: "🧪",
  commit: "✅",
  error: "❌",
  idle: "💤",
  evolving: "⚡",
};

export default function AgentPreview() {
  const { agentId } = useParams<{ agentId: string }>();
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const thoughtsEndRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/factory/agents/${agentId}/preview-data`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError("Cannot load preview data");
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000); // refresh every 2s
    return () => clearInterval(interval);
  }, [agentId]);

  useEffect(() => {
    thoughtsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.thoughts]);

  if (error) return (
    <div style={{ padding: "2rem", color: "var(--color-text-danger)", fontFamily: "monospace" }}>
      {error} — <Link to="/" style={{ color: "var(--color-text-info)" }}>Back to Factory</Link>
    </div>
  );

  if (!data) return (
    <div style={{ padding: "2rem", color: "var(--color-text-secondary)" }}>Loading preview...</div>
  );

  const { agent, thoughts, score_history } = data;
  const phaseColor = phaseColors[data.current_phase] || "#6b7280";
  const phaseIcon = phaseIcons[data.current_phase] || "💤";
  const scorePercent = Math.round(agent.score * 100);
  const maxScore = Math.max(...score_history.map(s => s.score), 0.01);

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--color-background-tertiary)",
      color: "var(--color-text-primary)",
      fontFamily: "monospace",
      padding: "1.5rem",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <Link to="/" style={{ color: "var(--color-text-secondary)", fontSize: "13px", textDecoration: "none" }}>
            ← Factory
          </Link>
          <h1 style={{ fontSize: "20px", fontWeight: 500, margin: "4px 0 0" }}>
            {phaseIcon} {agent.name}
          </h1>
          <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: "2px 0 0" }}>
            v{agent.version} · {scorePercent}% · {agent.status.toUpperCase()}
          </p>
        </div>

        {/* Live status pulse */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            width: "10px", height: "10px", borderRadius: "50%",
            background: data.evolving ? "#10b981" : "#6b7280",
            animation: data.evolving ? "pulse 1.5s infinite" : "none",
          }} />
          <span style={{ fontSize: "12px", color: data.evolving ? "#10b981" : "#6b7280" }}>
            {data.evolving ? "LIVE EVOLVING" : "IDLE"}
          </span>
        </div>
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>

        {/* Current Phase Card */}
        <div style={{
          background: "var(--color-background-secondary)",
          border: `1px solid ${phaseColor}40`,
          borderRadius: "12px",
          padding: "1.25rem",
        }}>
          <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", margin: "0 0 8px" }}>CURRENT PHASE</p>
          <div style={{ fontSize: "28px", fontWeight: 700, color: phaseColor }}>
            {phaseIcon} {data.current_phase.toUpperCase()}
          </div>
          <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "8px" }}>
            {data.current_phase === "draft" && "Generating a new improved version..."}
            {data.current_phase === "test" && "Evaluating the new version..."}
            {data.current_phase === "commit" && "Saving successful evolution..."}
            {data.current_phase === "idle" && "Waiting for next evolution cycle..."}
            {data.current_phase === "error" && "An error occurred — retrying..."}
          </p>
        </div>

        {/* Score Ring Card */}
        <div style={{
          background: "var(--color-background-secondary)",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "12px",
          padding: "1.25rem",
          display: "flex",
          alignItems: "center",
          gap: "1.25rem",
        }}>
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--color-border-tertiary)" strokeWidth="6"/>
            <circle cx="40" cy="40" r="32" fill="none"
              stroke="#8b5cf6" strokeWidth="6"
              strokeDasharray={`${(scorePercent / 100) * 201} 201`}
              strokeLinecap="round"
              transform="rotate(-90 40 40)"
            />
            <text x="40" y="45" textAnchor="middle" fill="var(--color-text-primary)" fontSize="16" fontWeight="700">
              {scorePercent}%
            </text>
          </svg>
          <div>
            <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", margin: "0 0 4px" }}>SCORE</p>
            <p style={{ fontSize: "14px", fontWeight: 500, margin: "0 0 4px" }}>Version {agent.version}</p>
            <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", margin: 0 }}>
              Best: {Math.round(maxScore * 100)}%
            </p>
          </div>
        </div>
      </div>

      {/* Score History Bar Chart */}
      {score_history.length > 1 && (
        <div style={{
          background: "var(--color-background-secondary)",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "12px",
          padding: "1.25rem",
          marginBottom: "1rem",
        }}>
          <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", margin: "0 0 12px" }}>SCORE EVOLUTION</p>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "60px" }}>
            {score_history.map((s) => (
              <div key={s.version} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{
                  width: "100%",
                  height: `${Math.max((s.score / maxScore) * 52, 4)}px`,
                  background: s.score === agent.score ? "#8b5cf6" : "var(--color-border-secondary)",
                  borderRadius: "3px 3px 0 0",
                  transition: "height 0.3s",
                }} />
                <span style={{ fontSize: "9px", color: "var(--color-text-secondary)", marginTop: "3px" }}>v{s.version}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Thought Stream */}
      <div style={{
        background: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: "12px",
        padding: "1.25rem",
        maxHeight: "420px",
        overflowY: "auto",
      }}>
        <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", margin: "0 0 12px" }}>
          LIVE THOUGHT STREAM {data.evolving && "● LIVE"}
        </p>
        {thoughts.length === 0 && (
          <p style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>
            No thoughts yet. Start evolution to see the agent's mind.
          </p>
        )}
        {thoughts.map((t, i) => {
          const color = phaseColors[t.phase] || "#6b7280";
          return (
            <div key={i} style={{
              display: "flex", gap: "12px", marginBottom: "10px",
              paddingBottom: "10px",
              borderBottom: i < thoughts.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
            }}>
              <span style={{
                fontSize: "10px", color: "var(--color-text-secondary)",
                minWidth: "60px", paddingTop: "2px",
              }}>
                {t.timestamp.split("T")[1]?.split(".")[0] || t.timestamp}
              </span>
              <div style={{ flex: 1 }}>
                <span style={{
                  fontSize: "10px", fontWeight: 700, color,
                  background: `${color}20`, padding: "1px 6px",
                  borderRadius: "4px", marginRight: "8px",
                }}>
                  {(t.phase || "").toUpperCase()}
                </span>
                {t.model_used && (
                  <span style={{
                    fontSize: "10px", color: "var(--color-text-secondary)",
                    background: "var(--color-background-tertiary)",
                    padding: "1px 6px", borderRadius: "4px", marginRight: "8px",
                  }}>
                    {t.model_used}
                  </span>
                )}
                <span style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>
                  {t.message}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={thoughtsEndRef} />
      </div>

      {/* Goal */}
      <div style={{
        background: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: "12px",
        padding: "1.25rem",
        marginTop: "1rem",
      }}>
        <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", margin: "0 0 8px" }}>AGENT GOAL</p>
        <p style={{ fontSize: "13px", lineHeight: 1.6, margin: 0, color: "var(--color-text-primary)" }}>
          {agent.goal}
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}