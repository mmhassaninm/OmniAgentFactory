import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Database, Upload, Trash2, Zap, FileText, Tag, BarChart3, Sparkles, Clock, Filter, GitBranch, Download, Dna, MessageSquare, Network } from 'lucide-react';
import nexusBridge from '../../services/bridge.js';

/**
 * Neural Forge App V2 — Merged with Vibelab Intelligence
 * ─────────────────────────────────────────────────────────
 * Features:
 * - Memory Ingestion (text + file drag-and-drop)
 * - Dataset Vault (training pairs table)
 * - Knowledge Graph Visualization
 * - LoRA Evolution Controls
 * - Analytics with JSONL + Graph stats
 * - Passive Harvest Notifications
 */

export default function NeuralForgeApp() {
    const [tab, setTab] = useState('ingest');
    const [dataset, setDataset] = useState([]);
    const [stats, setStats] = useState({ total: 0, manual: 0, harvested: 0, chat: 0, avgQuality: 0, jsonlEntries: 0, graphNodes: 0, graphEdges: 0 });
    const [loading, setLoading] = useState(false);
    const [toastMsg, setToastMsg] = useState('');
    const [graphData, setGraphData] = useState({ nodes: [], edges: [] });

    // Ingestion form
    const [instruction, setInstruction] = useState('');
    const [response, setResponse] = useState('');
    const [context, setContext] = useState('');
    const [selectedTags, setSelectedTags] = useState([]);
    const [filterSource, setFilterSource] = useState('all');

    const AVAILABLE_TAGS = ['personality', 'code-style', 'rules', 'knowledge', 'fix', 'pattern', 'security', 'conversation'];

    const TABS = [
        { id: 'ingest', label: 'Ingest', icon: Upload },
        { id: 'vault', label: 'Dataset', icon: Database },
        { id: 'graph', label: 'Graph', icon: GitBranch },
        { id: 'evolution', label: 'Evolution', icon: Dna },
        { id: 'stats', label: 'Analytics', icon: BarChart3 }
    ];

    const loadDataset = async () => {
        setLoading(true);
        try {
            const sourceFilter = filterSource === 'all' ? undefined : filterSource;
            const result = await nexusBridge.invoke('forge:get-dataset', { source: sourceFilter, limit: 200 });
            if (result?.success) setDataset(result.data || []);
        } catch (err) { console.warn('[NeuralForge] Dataset fetch:', err); }
        finally { setLoading(false); }
    };

    const loadStats = async () => {
        try {
            const result = await nexusBridge.invoke('forge:get-stats');
            if (result?.success) setStats(result);
        } catch (err) { console.warn('[NeuralForge] Stats fetch:', err); }
    };

    const loadGraph = async () => {
        try {
            const result = await nexusBridge.invoke('forge:graph-data');
            if (result?.success) setGraphData({ nodes: result.nodes || [], edges: result.edges || [] });
        } catch (err) { console.warn('[NeuralForge] Graph fetch:', err); }
    };

    useEffect(() => {
        loadDataset();
        loadStats();
        loadGraph();

        if (window.nexusAPI?.receive) {
            window.nexusAPI.receive('forge:harvest-complete', (data) => {
                setToastMsg(`🧠 Absorbed ${data.count} new concept${data.count > 1 ? 's' : ''} from system logs.`);
                loadDataset(); loadStats(); loadGraph();
                setTimeout(() => setToastMsg(''), 5000);
            });
            window.nexusAPI.receive('forge:evolution-started', (data) => {
                setToastMsg(`🧬 LoRA Evolution started with ${data.entries} entries!`);
                setTimeout(() => setToastMsg(''), 6000);
            });
        }
    }, [filterSource]);

    const handleIngest = async () => {
        if (!instruction.trim() || !response.trim()) return;
        setLoading(true);
        try {
            const result = await nexusBridge.invoke('forge:ingest-memory', {
                instruction: instruction.trim(), response: response.trim(),
                context: context.trim(), source: 'manual', tags: selectedTags
            });
            if (result?.success) {
                setInstruction(''); setResponse(''); setContext(''); setSelectedTags([]);
                setToastMsg('✅ Memory forged.'); setTimeout(() => setToastMsg(''), 3000);
                loadDataset(); loadStats();
            }
        } catch (err) { setToastMsg('❌ Ingestion failed.'); setTimeout(() => setToastMsg(''), 3000); }
        finally { setLoading(false); }
    };

    const handleDelete = async (id) => {
        try { await nexusBridge.invoke('forge:delete-pair', { id }); loadDataset(); loadStats(); } catch (e) { }
    };

    const handleExport = async () => {
        try {
            const result = await nexusBridge.invoke('forge:export-dataset');
            if (result?.success) {
                const blob = new Blob([result.data], { type: 'application/jsonl' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'nexus_training_dataset.jsonl';
                document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                setToastMsg(`📦 Exported ${result.count} entries (Alpaca JSONL).`); setTimeout(() => setToastMsg(''), 4000);
            }
        } catch (e) { setToastMsg('❌ Export failed.'); setTimeout(() => setToastMsg(''), 3000); }
    };

    const handleEvolution = async () => {
        setLoading(true);
        try {
            const result = await nexusBridge.invoke('forge:trigger-evolution');
            if (result?.success) {
                setToastMsg(`🧬 ${result.message}`);
            } else {
                setToastMsg(`⚠️ ${result.error}`);
            }
            setTimeout(() => setToastMsg(''), 5000);
        } catch (e) { setToastMsg('❌ Evolution trigger failed.'); setTimeout(() => setToastMsg(''), 3000); }
        finally { setLoading(false); }
    };

    const handleFileDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            setInstruction(`Knowledge from: ${file.name}`);
            setResponse(ev.target.result.substring(0, 2000));
        };
        reader.readAsText(file);
    };

    return (
        <div className="flex flex-col h-full bg-[#050510] text-white overflow-hidden rounded-b-xl font-sans relative">

            {/* Toast */}
            <AnimatePresence>
                {toastMsg && (
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                        className="absolute top-3 left-1/2 -translate-x-1/2 z-[100] px-5 py-2.5 bg-cyan-500/20 backdrop-blur-xl border border-cyan-500/30 rounded-full text-cyan-300 text-[11px] font-bold tracking-wider shadow-[0_0_30px_rgba(6,182,212,0.3)]">
                        {toastMsg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-white/5 border-b border-white/10 backdrop-blur-3xl shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.2)]">
                        <Brain className="text-purple-400" size={20} />
                    </div>
                    <div>
                        <h2 className="text-sm font-black tracking-tighter text-white uppercase italic">Neural Forge</h2>
                        <span className="text-[9px] text-purple-400 font-mono tracking-widest">AI MEMORY SHAPING ENGINE V2</span>
                    </div>
                </div>

                <div className="flex items-center gap-1 bg-white/5 rounded-full p-1 border border-white/5">
                    {TABS.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all ${tab === t.id ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-slate-500 hover:text-white'
                                }`}>
                            <t.icon size={11} /> {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5">

                {/* ── INGEST TAB ──────────── */}
                {tab === 'ingest' && (
                    <div className="max-w-3xl mx-auto space-y-5">
                        <div className="text-center mb-6">
                            <h3 className="text-lg font-black uppercase tracking-wider">Memory Ingestion Zone</h3>
                            <p className="text-[11px] text-slate-500 mt-1">Feed the AI facts, code patterns, personality traits, or rules.</p>
                        </div>

                        <div onDrop={handleFileDrop} onDragOver={(e) => e.preventDefault()}
                            className="border-2 border-dashed border-white/10 hover:border-purple-500/40 rounded-2xl p-6 text-center transition-all cursor-pointer group">
                            <FileText size={28} className="mx-auto text-slate-600 group-hover:text-purple-400 transition-colors mb-2" />
                            <p className="text-[10px] text-slate-500 group-hover:text-slate-300 font-bold">Drop .txt, .md, or .json files to auto-populate</p>
                        </div>

                        <div>
                            <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block">Instruction / Question</label>
                            <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)}
                                placeholder="e.g., How should the AI format error responses?"
                                className="w-full h-16 bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:border-purple-500/40 focus:outline-none resize-none font-mono" />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block">Response / Completion</label>
                            <textarea value={response} onChange={(e) => setResponse(e.target.value)}
                                placeholder="e.g., Always wrap errors in { success: false, error: '...' }..."
                                className="w-full h-24 bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:border-purple-500/40 focus:outline-none resize-none font-mono" />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block">Context <span className="text-slate-600">(Optional)</span></label>
                            <input value={context} onChange={(e) => setContext(e.target.value)} placeholder="e.g., NexusOS IPC Layer"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-purple-500/40 focus:outline-none font-mono" />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block flex items-center gap-1"><Tag size={10} /> Tags</label>
                            <div className="flex flex-wrap gap-1.5">
                                {AVAILABLE_TAGS.map(tag => (
                                    <button key={tag} onClick={() => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                                        className={`px-2.5 py-1 rounded-full text-[8px] font-bold uppercase tracking-wider border transition-all ${selectedTags.includes(tag) ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' : 'bg-white/5 border-white/5 text-slate-500 hover:border-white/10'
                                            }`}>{tag}</button>
                                ))}
                            </div>
                        </div>
                        <button onClick={handleIngest} disabled={!instruction.trim() || !response.trim() || loading}
                            className={`w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 font-black uppercase tracking-widest text-[11px] transition-all ${loading ? 'bg-slate-800 text-slate-500' : 'bg-white text-black hover:scale-[1.02] active:scale-95 shadow-[0_10px_30px_rgba(255,255,255,0.15)]'
                                }`}>
                            <Zap size={14} /> {loading ? 'Ingesting...' : 'Forge Memory'}
                        </button>
                    </div>
                )}

                {/* ── DATASET VAULT TAB ────── */}
                {tab === 'vault' && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                                <Database size={14} className="text-purple-400" /> Training Dataset ({dataset.length})
                            </h3>
                            <div className="flex items-center gap-2">
                                <button onClick={handleExport} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[9px] text-emerald-400 font-bold uppercase tracking-wider hover:bg-emerald-500/20 transition-all">
                                    <Download size={10} /> Export JSONL
                                </button>
                                <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}
                                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[9px] text-white font-bold uppercase tracking-wider focus:outline-none">
                                    <option value="all">All Sources</option>
                                    <option value="manual">Manual</option>
                                    <option value="harvest">Harvested</option>
                                    <option value="chat">Chat</option>
                                </select>
                            </div>
                        </div>

                        {dataset.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-slate-600">
                                <Brain size={36} className="mb-3 opacity-30" />
                                <p className="text-xs font-bold">No training data yet.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {dataset.map((pair, idx) => (
                                    <motion.div key={pair._id || idx} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }}
                                        className="bg-white/[0.03] border border-white/5 rounded-xl p-3 hover:border-purple-500/20 transition-all group">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className={`px-1.5 py-0.5 rounded-full text-[7px] font-black uppercase tracking-wider ${pair.source === 'harvest' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                            : pair.source === 'chat' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                                                : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                                        }`}>{pair.source}</span>
                                                    {pair.tags?.slice(0, 3).map(t => <span key={t} className="text-[7px] text-slate-600 font-mono">#{t}</span>)}
                                                </div>
                                                <p className="text-[11px] font-bold text-slate-200 mb-0.5 truncate">{pair.instruction}</p>
                                                <p className="text-[10px] text-slate-500 line-clamp-2">{pair.response}</p>
                                            </div>
                                            <button onClick={() => handleDelete(pair._id)}
                                                className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-all shrink-0">
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-3 mt-2 text-[8px] text-slate-600 font-mono">
                                            <span className="flex items-center gap-1"><Clock size={8} /> {new Date(pair.createdAt).toLocaleDateString()}</span>
                                            <span>Q: {((pair.quality || 0) * 100).toFixed(0)}%</span>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── KNOWLEDGE GRAPH TAB ───── */}
                {tab === 'graph' && (
                    <div className="space-y-5">
                        <div className="text-center mb-6">
                            <h3 className="text-lg font-black uppercase tracking-wider flex items-center justify-center gap-2">
                                <GitBranch size={18} className="text-cyan-400" /> Knowledge Graph
                            </h3>
                            <p className="text-[11px] text-slate-500 mt-1">Relationships extracted from system activity and conversations.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-cyan-500/10 rounded-xl p-4 border border-cyan-500/20 text-center">
                                <span className="text-2xl font-mono font-black text-cyan-400">{graphData.nodes.length}</span>
                                <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">Nodes</span>
                            </div>
                            <div className="bg-purple-500/10 rounded-xl p-4 border border-purple-500/20 text-center">
                                <span className="text-2xl font-mono font-black text-purple-400">{graphData.edges.length}</span>
                                <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">Edges</span>
                            </div>
                        </div>

                        {/* Graph Nodes List */}
                        {graphData.nodes.length === 0 ? (
                            <div className="text-center py-12 text-slate-600">
                                <Network size={36} className="mx-auto mb-3 opacity-30" />
                                <p className="text-xs font-bold">Knowledge Graph is empty. It populates as the system learns.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <h4 className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Entity Relationships</h4>
                                {graphData.edges.slice(0, 50).map((edge, idx) => {
                                    const fromNode = graphData.nodes.find(n => n.id === edge.from);
                                    const toNode = graphData.nodes.find(n => n.id === edge.to);
                                    return (
                                        <div key={idx} className="flex items-center gap-2 bg-white/[0.03] border border-white/5 rounded-lg p-2.5 text-[10px]">
                                            <span className="px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold truncate max-w-[140px]">
                                                {fromNode?.label || edge.from}
                                            </span>
                                            <span className="text-amber-400 font-mono text-[8px] font-bold shrink-0">
                                                {edge.relationship}
                                            </span>
                                            <span className="px-2 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 font-bold truncate max-w-[140px]">
                                                {toNode?.label || edge.to}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ── EVOLUTION TAB ─────────── */}
                {tab === 'evolution' && (
                    <div className="max-w-2xl mx-auto space-y-5">
                        <div className="text-center mb-6">
                            <h3 className="text-lg font-black uppercase tracking-wider flex items-center justify-center gap-2">
                                <Dna size={18} className="text-rose-400" /> LoRA Evolution Engine
                            </h3>
                            <p className="text-[11px] text-slate-500 mt-1">
                                Fine-tune your local AI using collected training data. Based on Vibelab's Unsloth/PEFT pipeline.
                            </p>
                        </div>

                        {/* Status Cards */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5 text-center">
                                <span className="text-xl font-mono font-black text-white">{stats.jsonlEntries || 0}</span>
                                <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-1">JSONL Entries</span>
                            </div>
                            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5 text-center">
                                <span className="text-xl font-mono font-black text-white">{stats.total || 0}</span>
                                <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-1">Training Pairs</span>
                            </div>
                            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5 text-center">
                                <span className="text-xl font-mono font-black text-amber-400">{(stats.avgQuality * 100).toFixed(0)}%</span>
                                <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-1">Avg Quality</span>
                            </div>
                        </div>

                        {/* Pipeline Visualization */}
                        <div className="bg-white/[0.03] rounded-2xl p-5 border border-white/5">
                            <h4 className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-4">Training Pipeline</h4>
                            <div className="flex items-center justify-between gap-2">
                                {[
                                    { label: 'Chat Capture', icon: MessageSquare, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
                                    { label: 'Harvest', icon: Sparkles, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                                    { label: 'JSONL Export', icon: Download, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                                    { label: 'LoRA Train', icon: Dna, color: 'text-rose-400', bg: 'bg-rose-500/10' },
                                ].map((step, i) => (
                                    <React.Fragment key={step.label}>
                                        <div className="flex flex-col items-center gap-1.5">
                                            <div className={`w-10 h-10 rounded-xl ${step.bg} flex items-center justify-center border border-white/5`}>
                                                <step.icon size={16} className={step.color} />
                                            </div>
                                            <span className="text-[7px] text-slate-500 font-bold uppercase tracking-wider text-center">{step.label}</span>
                                        </div>
                                        {i < 3 && <div className="flex-1 h-px bg-gradient-to-r from-white/5 to-white/10 mt-[-10px]" />}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={handleExport}
                                className="py-3 rounded-xl flex items-center justify-center gap-2 font-black uppercase tracking-widest text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all">
                                <Download size={14} /> Export Dataset (JSONL)
                            </button>
                            <button onClick={handleEvolution} disabled={loading}
                                className="py-3 rounded-xl flex items-center justify-center gap-2 font-black uppercase tracking-widest text-[10px] bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all disabled:opacity-50">
                                <Dna size={14} /> {loading ? 'Queuing...' : 'Trigger Evolution'}
                            </button>
                        </div>

                        {/* Harvester Status */}
                        <div className="bg-white/[0.03] rounded-2xl p-5 border border-white/5">
                            <div className="flex items-center gap-2 mb-2">
                                <Sparkles size={14} className="text-emerald-400" />
                                <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Passive Thought Harvester</span>
                            </div>
                            <p className="text-[10px] text-slate-500">
                                Silently reads system logs, the Integrity Ledger, and the Prevention Guide hourly.
                                Converts system knowledge into training pairs and builds the Knowledge Graph automatically.
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                <span className="text-[9px] text-emerald-400 font-bold">HARVESTER ACTIVE</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── ANALYTICS TAB ────────── */}
                {tab === 'stats' && (
                    <div className="max-w-2xl mx-auto space-y-5">
                        <div className="text-center mb-6">
                            <h3 className="text-lg font-black uppercase tracking-wider">Forge Analytics</h3>
                            <p className="text-[11px] text-slate-500 mt-1">Training data, graph memory, and quality metrics.</p>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                                { label: 'Total Pairs', value: stats.total, color: 'text-white', bg: 'bg-white/5' },
                                { label: 'Manual', value: stats.manual, color: 'text-purple-400', bg: 'bg-purple-500/10' },
                                { label: 'Harvested', value: stats.harvested, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                                { label: 'From Chat', value: stats.chat, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
                                { label: 'JSONL Size', value: stats.jsonlEntries || 0, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                                { label: 'Graph Nodes', value: stats.graphNodes || 0, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
                                { label: 'Graph Edges', value: stats.graphEdges || 0, color: 'text-rose-400', bg: 'bg-rose-500/10' },
                                { label: 'Avg Quality', value: `${(stats.avgQuality * 100).toFixed(0)}%`, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                            ].map(s => (
                                <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-white/5`}>
                                    <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest block mb-1">{s.label}</span>
                                    <span className={`text-xl font-mono font-black ${s.color}`}>{s.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Background Atmosphere */}
            <div className="absolute inset-0 pointer-events-none opacity-10">
                <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/20 rounded-full blur-[100px] translate-x-1/2 -translate-y-1/2"></div>
                <div className="absolute bottom-0 left-0 w-80 h-80 bg-cyan-500/20 rounded-full blur-[100px] -translate-x-1/2 translate-y-1/2"></div>
            </div>
        </div>
    );
}
