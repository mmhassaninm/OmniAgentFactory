/**
 * AgentReplayer — Direction 8 (Wildcard): Step-by-step replay of past agent runs.
 *
 * Features:
 *  - Lists all past runs with task preview, persona, status, date
 *  - On selection: loads all steps and plays them back at configurable speed
 *  - Shows agent_think, agent_act, agent_observe, agent_reflect, agent_finish events
 *  - Play/Pause/Step controls + speed slider (0.5x – 10x)
 *
 * No equivalent exists in OpenHands, AutoGen, CrewAI, or LangGraph as of 2026-05.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SkipForward, Trash2, Clock, CheckCircle, XCircle, Loader2, ChevronLeft } from 'lucide-react';

const BACKEND = 'http://localhost:3001/api';

const PERSONA_ICONS = { research: '🔬', code: '💻', analyst: '📊', general: '🤖' };
const EVENT_COLORS = {
    agent_think: '#7c3aed',
    agent_act: '#f59e0b',
    agent_observe: '#10b981',
    agent_reflect: '#06b6d4',
    agent_finish: '#00d4ff',
};

function RunCard({ run, onSelect, onDelete }) {
    const statusIcon = run.status === 'success'
        ? <CheckCircle size={12} style={{ color: '#10b981' }} />
        : run.status === 'failed'
            ? <XCircle size={12} style={{ color: '#f87171' }} />
            : <Loader2 size={12} style={{ color: '#f59e0b' }} className="animate-spin" />;

    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            style={{
                padding: '10px 12px',
                borderRadius: '10px',
                background: 'var(--bg-card, #1c2128)',
                border: '1px solid var(--border-primary, rgba(255,255,255,0.08))',
                cursor: 'pointer',
                marginBottom: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
            }}
            onClick={() => onSelect(run.run_id)}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,212,255,0.3)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-primary, rgba(255,255,255,0.08))'}
        >
            <span style={{ fontSize: '1.2rem' }}>{PERSONA_ICONS[run.persona] || '🤖'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary, #e6edf3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {run.task}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    {statusIcon}
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted, #8b949e)' }}>
                        {run.iterations} steps · {new Date(run.started_at).toLocaleDateString()}
                    </span>
                </div>
            </div>
            <button
                onClick={e => { e.stopPropagation(); onDelete(run.run_id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', opacity: 0.5, padding: '2px' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
            >
                <Trash2 size={12} />
            </button>
        </motion.div>
    );
}

function StepDisplay({ step, active }) {
    if (!step) return null;
    const color = EVENT_COLORS[step.event] || '#8b949e';
    return (
        <motion.div
            key={step.seq}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                padding: '8px 12px',
                borderRadius: '8px',
                background: active ? `${color}10` : 'var(--bg-secondary, #161b22)',
                border: `1px solid ${active ? color + '40' : 'transparent'}`,
                marginBottom: '6px',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: color, fontWeight: 700 }}>
                    {step.event}
                </span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted, #8b949e)' }}>
                    +{step.delta_ms}ms
                </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #c9d1d9)', whiteSpace: 'pre-wrap', maxHeight: '120px', overflow: 'auto' }}>
                {step.event === 'agent_think' && (step.data.thought || step.data.token || '')}
                {step.event === 'agent_act' && `🔧 ${step.data.tool_name}(${JSON.stringify(step.data.arguments || {})})`}
                {step.event === 'agent_observe' && (step.data.ok ? `✅ ${(step.data.output || '').substring(0, 300)}` : `❌ ${step.data.error}`)}
                {step.event === 'agent_reflect' && `💭 ${step.data.reflection}`}
                {step.event === 'agent_finish' && `🏁 ${(step.data.answer || '').substring(0, 400)}`}
                {!['agent_think', 'agent_act', 'agent_observe', 'agent_reflect', 'agent_finish'].includes(step.event) && JSON.stringify(step.data).substring(0, 200)}
            </div>
        </motion.div>
    );
}

export default function AgentReplayer({ onClose }) {
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRun, setSelectedRun] = useState(null);
    const [steps, setSteps] = useState([]);
    const [currentStep, setCurrentStep] = useState(-1);
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState(2);
    const intervalRef = useRef(null);

    const fetchRuns = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`${BACKEND}/agent/runs`);
            const d = await r.json();
            setRuns(d.runs || []);
        } catch { }
        setLoading(false);
    }, []);

    useEffect(() => { fetchRuns(); }, [fetchRuns]);

    const loadRun = async (runId) => {
        try {
            const r = await fetch(`${BACKEND}/agent/runs/${runId}`);
            const d = await r.json();
            setSelectedRun(d);
            setSteps(d.steps || []);
            setCurrentStep(-1);
            setIsPlaying(false);
        } catch { }
    };

    const deleteRun = async (runId) => {
        await fetch(`${BACKEND}/agent/runs/${runId}`, { method: 'DELETE' });
        setRuns(prev => prev.filter(r => r.run_id !== runId));
        if (selectedRun?.run_id === runId) { setSelectedRun(null); setSteps([]); }
    };

    // Playback
    useEffect(() => {
        if (isPlaying) {
            const baseDelay = 1000 / speed;
            intervalRef.current = setInterval(() => {
                setCurrentStep(prev => {
                    if (prev + 1 >= steps.length) {
                        setIsPlaying(false);
                        return prev;
                    }
                    const next = prev + 1;
                    const deltaMs = steps[next]?.delta_ms || 200;
                    // vary interval by real delta (capped at 3s)
                    const delay = Math.min(deltaMs / speed, 3000);
                    clearInterval(intervalRef.current);
                    intervalRef.current = setInterval(() => setCurrentStep(p => {
                        if (p + 1 >= steps.length) { setIsPlaying(false); return p; }
                        return p + 1;
                    }), delay);
                    return next;
                });
            }, baseDelay);
        } else {
            clearInterval(intervalRef.current);
        }
        return () => clearInterval(intervalRef.current);
    }, [isPlaying, speed, steps]);

    const stepForward = () => setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                style={{
                    width: '820px', maxWidth: '95vw', maxHeight: '85vh',
                    background: 'var(--bg-base, #080c10)',
                    border: '1px solid var(--border-primary, rgba(0,212,255,0.15))',
                    borderRadius: '16px', display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {selectedRun && (
                        <button onClick={() => { setSelectedRun(null); setSteps([]); setCurrentStep(-1); setIsPlaying(false); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #8b949e)' }}>
                            <ChevronLeft size={16} />
                        </button>
                    )}
                    <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-primary, #00d4ff)' }}>
                            🎬 Agent Replay
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted, #8b949e)' }}>
                            {selectedRun ? selectedRun.task : `${runs.length} recorded runs`}
                        </div>
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #8b949e)', fontSize: '1.2rem' }}>✕</button>
                    </div>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', gap: '16px' }}>
                    {!selectedRun ? (
                        <div style={{ flex: 1 }}>
                            {loading ? (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '40px' }}>
                                    <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                                    Loading runs...
                                </div>
                            ) : runs.length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '40px' }}>
                                    No agent runs recorded yet.<br />
                                    <span style={{ opacity: 0.6 }}>Start an agent task to begin recording.</span>
                                </div>
                            ) : runs.map(run => (
                                <RunCard key={run.run_id} run={run} onSelect={loadRun} onDelete={deleteRun} />
                            ))}
                        </div>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {/* Playback controls */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--bg-secondary, #161b22)', borderRadius: '10px' }}>
                                <button
                                    onClick={() => setIsPlaying(v => !v)}
                                    style={{ background: isPlaying ? 'rgba(0,212,255,0.15)' : 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: '#00d4ff', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem' }}
                                >
                                    {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                                    {isPlaying ? 'Pause' : 'Play'}
                                </button>
                                <button
                                    onClick={stepForward}
                                    disabled={currentStep >= steps.length - 1}
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem' }}
                                >
                                    <SkipForward size={12} /> Step
                                </button>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                                    <Clock size={11} style={{ color: 'var(--text-muted)' }} />
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{speed}x</span>
                                    <input type="range" min={0.5} max={10} step={0.5} value={speed} onChange={e => setSpeed(Number(e.target.value))} style={{ width: '80px', accentColor: '#00d4ff' }} />
                                </div>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                    {currentStep + 1}/{steps.length}
                                </span>
                            </div>

                            {/* Steps */}
                            <div style={{ flex: 1, overflow: 'auto' }}>
                                <AnimatePresence initial={false}>
                                    {steps.slice(0, currentStep + 1).map((step, i) => (
                                        <StepDisplay key={step.seq} step={step} active={i === currentStep} />
                                    ))}
                                </AnimatePresence>
                                {currentStep === -1 && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '40px' }}>
                                        Press Play to replay this agent run step-by-step.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
