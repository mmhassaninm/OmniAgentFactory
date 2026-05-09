import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const BACKEND = 'http://localhost:3001/api';

export default function PersonaSelector({ selectedPersona, onSelect, disabled }) {
    const [personas, setPersonas] = useState([
        { id: 'general', name: 'General Agent', icon: '🤖', color: '#7c3aed', description: 'Versatile agent for any task' },
        { id: 'research', name: 'Research Agent', icon: '🔬', color: '#06b6d4', description: 'Deep information gathering' },
        { id: 'code', name: 'Code Agent', icon: '💻', color: '#10b981', description: 'Code generation & debugging' },
        { id: 'analyst', name: 'Data Analyst', icon: '📊', color: '#f59e0b', description: 'Data analysis & calculations' },
    ]);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        fetch(`${BACKEND}/agent/personas`)
            .then(r => r.json())
            .then(d => { if (d.personas?.length) setPersonas(d.personas); })
            .catch(() => {});
    }, []);

    const active = personas.find(p => p.id === selectedPersona) || personas[0];

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
                onClick={() => !disabled && setIsOpen(v => !v)}
                disabled={disabled}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '999px',
                    background: `${active.color}18`,
                    border: `1px solid ${active.color}40`,
                    color: active.color,
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                }}
                title={active.description}
            >
                <span>{active.icon}</span>
                <span>{active.name}</span>
                <ChevronDown size={10} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setIsOpen(false)} />
                        <motion.div
                            initial={{ opacity: 0, y: -6, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -6, scale: 0.97 }}
                            transition={{ duration: 0.12 }}
                            style={{
                                position: 'absolute',
                                top: 'calc(100% + 6px)',
                                left: 0,
                                zIndex: 50,
                                minWidth: '220px',
                                background: 'var(--bg-card, #1c2128)',
                                border: '1px solid var(--border-primary, rgba(255,255,255,0.1))',
                                borderRadius: '12px',
                                padding: '6px',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            }}
                        >
                            {personas.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => { onSelect(p.id); setIsOpen(false); }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        width: '100%',
                                        padding: '8px 10px',
                                        borderRadius: '8px',
                                        background: p.id === selectedPersona ? `${p.color}15` : 'transparent',
                                        border: p.id === selectedPersona ? `1px solid ${p.color}30` : '1px solid transparent',
                                        color: p.id === selectedPersona ? p.color : 'var(--text-primary, #e6edf3)',
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                        transition: 'all 0.12s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = `${p.color}12`; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = p.id === selectedPersona ? `${p.color}15` : 'transparent'; }}
                                >
                                    <span style={{ fontSize: '1.1rem' }}>{p.icon}</span>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>{p.name}</div>
                                        <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>{p.description}</div>
                                    </div>
                                </button>
                            ))}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
