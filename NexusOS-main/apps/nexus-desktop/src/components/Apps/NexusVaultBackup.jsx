import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    HardDrive, FolderSync, Clock, Play, Pause, Trash2, Plus,
    CheckCircle2, AlertTriangle, History, Zap, Shield, ArrowDownToLine,
    Settings2, RotateCcw, Timer, Database
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

// ── Utility: Format bytes ───────────────────────────────────
const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// ── Simulated Backup Engine (Browser-safe) ──────────────────
const createMockTask = (name, source, dest) => ({
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    source,
    destination: dest,
    interval: 60,
    maxBackups: 5,
    smartStreak: 3,
    excludes: 'node_modules,.git,dist',
    isRunning: false,
    lastBackup: null,
    totalBackups: 0,
    totalSize: 0,
    streak: 0,
    status: 'idle', // idle | running | paused | error
    logs: [],
});

// ── Task Card Component ─────────────────────────────────────
const TaskCard = ({ task, onToggle, onDelete, onForce, isExpanded, onExpand }) => {
    const statusColors = {
        idle: 'text-slate-400',
        running: 'text-emerald-400',
        paused: 'text-amber-400',
        error: 'text-red-400',
    };
    const statusGlows = {
        idle: '',
        running: 'shadow-[0_0_15px_rgba(16,185,129,0.2)]',
        paused: 'shadow-[0_0_15px_rgba(245,158,11,0.2)]',
        error: 'shadow-[0_0_15px_rgba(239,68,68,0.2)]',
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-shadow duration-500 ${statusGlows[task.status]}`}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                onClick={onExpand}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center ${statusColors[task.status]}`}>
                        <FolderSync className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white tracking-wide">{task.name}</h3>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-[200px]">{task.source}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Live Pulse */}
                    {task.status === 'running' && (
                        <div className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </div>
                    )}
                    <span className={`text-[9px] font-black uppercase tracking-widest ${statusColors[task.status]}`}>
                        {task.status}
                    </span>
                </div>
            </div>

            {/* Expanded Details */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                            {/* Stats Grid */}
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    { label: 'Backups', value: task.totalBackups, icon: Database },
                                    { label: 'Size', value: formatBytes(task.totalSize), icon: HardDrive },
                                    { label: 'Interval', value: `${task.interval}m`, icon: Timer },
                                    { label: 'Streak', value: `${task.streak}/${task.smartStreak}`, icon: Zap },
                                ].map(stat => (
                                    <div key={stat.label} className="bg-black/30 rounded-xl p-2 border border-white/5 text-center">
                                        <stat.icon className="w-3 h-3 text-slate-500 mx-auto mb-1" />
                                        <div className="text-[10px] text-slate-500 uppercase font-bold">{stat.label}</div>
                                        <div className="text-xs font-bold text-white mt-0.5">{stat.value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Exclude Tags */}
                            <div className="flex flex-wrap gap-1.5">
                                {task.excludes.split(',').filter(Boolean).map(ex => (
                                    <span key={ex} className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-mono">
                                        {ex.trim()}
                                    </span>
                                ))}
                            </div>

                            {/* Destination */}
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                                <ArrowDownToLine className="w-3 h-3 text-cyan-500" />
                                <span className="truncate">{task.destination}</span>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={onToggle}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${task.status === 'running'
                                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
                                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                                        }`}
                                >
                                    {task.status === 'running' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                    {task.status === 'running' ? 'Pause' : 'Start'}
                                </button>
                                <button
                                    onClick={onForce}
                                    className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all cursor-pointer"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    Force
                                </button>
                                <button
                                    onClick={onDelete}
                                    className="flex items-center justify-center p-2 rounded-xl text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all cursor-pointer"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Log Feed */}
                            {task.logs.length > 0 && (
                                <div className="bg-black/40 rounded-xl border border-white/5 p-2 max-h-24 overflow-y-auto scrollbar-thin">
                                    {task.logs.slice(-5).map((log, i) => (
                                        <div key={i} className="text-[9px] font-mono text-slate-500 py-0.5 border-b border-white/[0.02] last:border-0">
                                            {log}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// ── Main NexusVault Backup App ──────────────────────────────
export default function NexusVaultBackup() {
    const { t } = useTranslation();
    const [tasks, setTasks] = useState([]);
    const [expandedId, setExpandedId] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [newTask, setNewTask] = useState({ name: '', source: '', dest: '', interval: 60, maxBackups: 5, smartStreak: 3, excludes: 'node_modules,.git,dist' });

    // Simulate periodic backup activity
    useEffect(() => {
        const interval = setInterval(() => {
            setTasks(prev => prev.map(task => {
                if (task.status !== 'running') return task;
                const now = new Date().toLocaleTimeString();
                const newSize = Math.floor(Math.random() * 50000000) + 10000000;
                const sameSize = Math.random() > 0.7;
                const newStreak = sameSize ? task.streak + 1 : 0;

                let newStatus = 'running';
                let newLogs = [...task.logs, `[${now}] Backup cycle completed — ${formatBytes(newSize)}`];

                if (newStreak >= task.smartStreak) {
                    newStatus = 'paused';
                    newLogs.push(`[${now}] ⚡ Smart Pause triggered — no changes detected for ${task.smartStreak} cycles`);
                }

                return {
                    ...task,
                    totalBackups: task.totalBackups + 1,
                    totalSize: task.totalSize + newSize,
                    lastBackup: now,
                    streak: newStreak,
                    status: newStatus,
                    logs: newLogs.slice(-20),
                };
            }));
        }, 8000);

        return () => clearInterval(interval);
    }, []);

    const handleCreate = useCallback(() => {
        if (!newTask.name || !newTask.source || !newTask.dest) return;
        const task = createMockTask(newTask.name, newTask.source, newTask.dest);
        task.interval = newTask.interval;
        task.maxBackups = newTask.maxBackups;
        task.smartStreak = newTask.smartStreak;
        task.excludes = newTask.excludes;
        setTasks(prev => [...prev, task]);
        setNewTask({ name: '', source: '', dest: '', interval: 60, maxBackups: 5, smartStreak: 3, excludes: 'node_modules,.git,dist' });
        setShowCreate(false);
    }, [newTask]);

    const handleToggle = useCallback((id) => {
        setTasks(prev => prev.map(t => {
            if (t.id !== id) return t;
            const now = new Date().toLocaleTimeString();
            if (t.status === 'running') {
                return { ...t, status: 'paused', logs: [...t.logs, `[${now}] Monitoring paused by user`] };
            }
            return { ...t, status: 'running', streak: 0, logs: [...t.logs, `[${now}] Monitoring started`] };
        }));
    }, []);

    const handleForce = useCallback((id) => {
        setTasks(prev => prev.map(t => {
            if (t.id !== id) return t;
            const now = new Date().toLocaleTimeString();
            const size = Math.floor(Math.random() * 80000000) + 20000000;
            return {
                ...t,
                totalBackups: t.totalBackups + 1,
                totalSize: t.totalSize + size,
                lastBackup: now,
                logs: [...t.logs, `[${now}] ⚡ Force backup executed — ${formatBytes(size)}`].slice(-20),
            };
        }));
    }, []);

    const handleDelete = useCallback((id) => {
        setTasks(prev => prev.filter(t => t.id !== id));
        if (expandedId === id) setExpandedId(null);
    }, [expandedId]);

    // Stats
    const totalActive = tasks.filter(t => t.status === 'running').length;
    const totalBackups = tasks.reduce((sum, t) => sum + t.totalBackups, 0);
    const totalSize = tasks.reduce((sum, t) => sum + t.totalSize, 0);

    return (
        <div className="w-full h-full bg-gradient-to-br from-[#0a0a12] via-[#0f0f1a] to-[#0a0a12] text-white flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-white/5 flex-shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center">
                            <Shield className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-wider font-mono text-white">NEXUS VAULT</h1>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest">Smart Backup Engine</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowCreate(!showCreate)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-wider hover:bg-cyan-500/20 transition-all cursor-pointer"
                    >
                        <Plus className="w-4 h-4" />
                        New Task
                    </button>
                </div>

                {/* Global Stats */}
                <div className="flex gap-4 mt-4">
                    {[
                        { label: 'Active Tasks', value: totalActive, color: 'text-emerald-400' },
                        { label: 'Total Backups', value: totalBackups, color: 'text-cyan-400' },
                        { label: 'Total Size', value: formatBytes(totalSize), color: 'text-purple-400' },
                    ].map(stat => (
                        <div key={stat.label} className="flex items-center gap-2">
                            <span className={`text-sm font-black ${stat.color}`}>{stat.value}</span>
                            <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">{stat.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Create Form */}
            <AnimatePresence>
                {showCreate && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-b border-white/5 flex-shrink-0"
                    >
                        <div className="p-4 space-y-3 bg-white/[0.02]">
                            <div className="grid grid-cols-2 gap-3">
                                <input
                                    value={newTask.name}
                                    onChange={e => setNewTask(p => ({ ...p, name: e.target.value }))}
                                    placeholder="Task Name"
                                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                                />
                                <input
                                    value={newTask.source}
                                    onChange={e => setNewTask(p => ({ ...p, source: e.target.value }))}
                                    placeholder="Source Path (e.g. D:\Projects)"
                                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                                />
                                <input
                                    value={newTask.dest}
                                    onChange={e => setNewTask(p => ({ ...p, dest: e.target.value }))}
                                    placeholder="Destination Path"
                                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                                />
                                <input
                                    value={newTask.excludes}
                                    onChange={e => setNewTask(p => ({ ...p, excludes: e.target.value }))}
                                    placeholder="Exclude (comma-separated)"
                                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                                />
                            </div>
                            <div className="flex gap-3">
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">Interval (min)</label>
                                    <input type="number" value={newTask.interval} onChange={e => setNewTask(p => ({ ...p, interval: parseInt(e.target.value) || 60 }))} className="w-16 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">Max Keep</label>
                                    <input type="number" value={newTask.maxBackups} onChange={e => setNewTask(p => ({ ...p, maxBackups: parseInt(e.target.value) || 5 }))} className="w-16 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">Smart Streak</label>
                                    <input type="number" value={newTask.smartStreak} onChange={e => setNewTask(p => ({ ...p, smartStreak: parseInt(e.target.value) || 3 }))} className="w-16 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none" />
                                </div>
                                <button
                                    onClick={handleCreate}
                                    className="ml-auto flex items-center gap-2 px-6 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider hover:bg-emerald-500/30 transition-all cursor-pointer"
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    Create
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Task List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
                <AnimatePresence>
                    {tasks.map(task => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            isExpanded={expandedId === task.id}
                            onExpand={() => setExpandedId(expandedId === task.id ? null : task.id)}
                            onToggle={() => handleToggle(task.id)}
                            onDelete={() => handleDelete(task.id)}
                            onForce={() => handleForce(task.id)}
                        />
                    ))}
                </AnimatePresence>

                {/* Empty State */}
                {tasks.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full opacity-30">
                        <HardDrive className="w-16 h-16 text-slate-500 mb-4" />
                        <p className="text-slate-400 text-sm font-medium">No backup tasks configured</p>
                        <p className="text-slate-600 text-xs mt-1">Click "New Task" to create your first smart backup</p>
                    </div>
                )}
            </div>
        </div>
    );
}
