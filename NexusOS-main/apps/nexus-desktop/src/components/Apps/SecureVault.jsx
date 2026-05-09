import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Unlock, ShieldAlert, Plus, Trash2, FileText, Save, ArrowLeft, Loader2, KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import nexusBridge from '../../services/bridge.js';

const SecureVault = () => {
    const { t } = useTranslation();
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [pin, setPin] = useState('');
    const [notes, setNotes] = useState([]);
    const [activeNote, setActiveNote] = useState(null);
    const [view, setView] = useState('list'); // 'list' | 'editor'
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isUnlocked) {
            loadNotes();
        }
    }, [isUnlocked]);

    const loadNotes = async () => {
        setIsLoading(true);
        try {
            const res = await nexusBridge.invoke('vault:listNotes', { pin });
            if (res.success) {
                setNotes(res.data);
            } else {
                setError(res.error);
            }
        } catch (err) {
            setError('System Link Error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUnlock = async (e) => {
        if (e) e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            // Test decryption with a dummy call or just trust it for now
            const res = await nexusBridge.invoke('vault:listNotes', { pin });
            if (res.success) {
                setIsUnlocked(true);
            } else {
                setError('INVALID_PROTOCOL_KEY');
                setPin('');
            }
        } catch (err) {
            setError('ENCRYPTION_LAYER_FAILURE');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateNote = () => {
        setActiveNote({ title: 'NEW_DATA_NODE', content: '' });
        setView('editor');
    };

    const handleSaveNote = async () => {
        setIsLoading(true);
        try {
            const res = await nexusBridge.invoke('vault:saveNote', {
                title: activeNote.title,
                content: activeNote.content,
                pin
            });
            if (res.success) {
                await loadNotes();
                setView('list');
            } else {
                setError(res.error);
            }
        } catch (err) {
            setError('SAVE_ERROR');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteNote = async (id) => {
        try {
            const res = await nexusBridge.invoke('vault:deleteNote', { id });
            if (res.success) {
                setNotes(notes.filter(n => n.id !== id));
            }
        } catch (err) {
            setError('PURGE_FAILURE');
        }
    };

    const openNote = async (id) => {
        setIsLoading(true);
        try {
            const res = await nexusBridge.invoke('vault:getNote', { id, pin });
            if (res.success) {
                setActiveNote({ id, title: res.title, content: res.content });
                setView('editor');
            } else {
                setError(res.error);
            }
        } catch (err) {
            setError('DECRYPTION_FAILED');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isUnlocked) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-slate-950 text-slate-300 font-mono relative overflow-hidden">
                {/* Background Grid Effect */}
                <div className="absolute inset-0 opacity-10 pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #334155 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="z-10 bg-slate-900/60 backdrop-blur-2xl p-8 rounded-3xl border border-red-500/30 shadow-[0_0_50px_rgba(239,68,68,0.15)] flex flex-col items-center gap-6 w-full max-w-sm"
                >
                    <div className="relative">
                        <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full"></div>
                        <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center border-2 border-red-500/50 relative">
                            <Lock size={36} className="text-red-500" />
                        </div>
                    </div>

                    <div className="text-center">
                        <h2 className="text-2xl font-black text-white tracking-[0.2em] uppercase">Secure Vault</h2>
                        <p className="text-xs text-red-400/60 mt-2 font-bold uppercase tracking-widest">Zero-Knowledge Storage Active</p>
                    </div>

                    <form onSubmit={handleUnlock} className="w-full flex flex-col gap-5">
                        <div className="relative">
                            <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input
                                type="password"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                placeholder="ENTER_ENCRYPTION_PIN"
                                className="w-full bg-black/40 border-2 border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-center text-red-500 tracking-[0.4em] font-bold focus:outline-none focus:border-red-500/50 focus:ring-4 focus:ring-red-500/10 transition-all placeholder:tracking-normal placeholder:text-slate-600"
                                autoFocus
                                disabled={isLoading}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading || pin.length < 4}
                            className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-red-900/40 disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-3 uppercase tracking-widest text-sm"
                        >
                            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Unlock size={18} />}
                            Decrypt Node
                        </button>
                    </form>

                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-2 text-red-400 text-[10px] font-bold uppercase tracking-tighter bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20"
                        >
                            <ShieldAlert size={12} />
                            {error}
                        </motion.div>
                    )}
                </motion.div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30">
            {/* Premium Header */}
            <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/30">
                        <Unlock size={20} className="text-emerald-400" />
                    </div>
                    <div>
                        <span className="block text-sm font-black tracking-widest text-emerald-400 uppercase">Vault Online</span>
                        <span className="block text-[10px] text-slate-500 font-mono uppercase tracking-tighter leading-none">AES-256 Symmetric Encryption</span>
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {view === 'list' ? (
                        <motion.button
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            onClick={handleCreateNote}
                            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-xs font-black transition-all shadow-lg shadow-emerald-500/20"
                        >
                            <Plus size={16} /> NEW_ENTRY
                        </motion.button>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="flex gap-3"
                        >
                            <button onClick={() => setView('list')} className="p-2.5 hover:bg-white/5 rounded-xl text-slate-400 transition-colors border border-white/5">
                                <ArrowLeft size={20} />
                            </button>
                            <button onClick={handleSaveNote} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-xs font-black transition-all shadow-lg shadow-emerald-500/20">
                                <Save size={18} /> COMMIT_CHANGE
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative p-6">
                <AnimatePresence mode="wait">
                    {view === 'list' ? (
                        <motion.div
                            key="list"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-auto h-full content-start custom-scrollbar"
                        >
                            {notes.length === 0 && !isLoading && (
                                <div className="col-span-full h-full flex flex-col items-center justify-center opacity-30 mt-20">
                                    <FileText size={64} className="mb-4" />
                                    <p className="font-mono text-sm tracking-widest uppercase italic">The vault is currently empty.</p>
                                </div>
                            )}

                            {notes.map(note => (
                                <motion.div
                                    layoutId={note.id}
                                    key={note.id}
                                    onClick={() => openNote(note.id)}
                                    className="group relative h-48 p-6 rounded-3xl bg-slate-900 border border-white/5 hover:border-emerald-500/30 cursor-pointer overflow-hidden transition-all hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)]"
                                >
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-colors"></div>

                                    <div className="relative z-10 flex flex-col h-full">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="p-3 rounded-2xl bg-slate-800 text-emerald-400 border border-white/5">
                                                <FileText size={22} />
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                                                className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                        <h3 className="font-black text-white text-lg tracking-tight mb-2 truncate uppercase">{note.title}</h3>
                                        <p className="text-xs text-slate-500 font-mono line-clamp-2 leading-relaxed">
                                            {new Date(note.createdAt).toLocaleDateString()} — {new Date(note.createdAt).toLocaleTimeString()}
                                        </p>

                                        <div className="mt-auto flex items-center gap-1">
                                            <div className="h-1 w-8 rounded-full bg-emerald-500/50"></div>
                                            <div className="h-1 w-2 rounded-full bg-slate-800"></div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="editor"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.02 }}
                            className="flex flex-col h-full bg-slate-900/30 rounded-3xl border border-white/5 overflow-hidden"
                        >
                            <input
                                type="text"
                                value={activeNote?.title || ''}
                                onChange={(e) => setActiveNote({ ...activeNote, title: e.target.value.toUpperCase() })}
                                className="bg-white/5 text-2xl font-black p-8 border-b border-white/5 focus:outline-none focus:bg-white/[0.08] transition-colors placeholder:text-slate-700 tracking-tight"
                                placeholder="ENTRY_TITLE"
                                disabled={isLoading}
                            />
                            <textarea
                                value={activeNote?.content || ''}
                                onChange={(e) => setActiveNote({ ...activeNote, content: e.target.value })}
                                className="flex-1 bg-transparent p-8 resize-none focus:outline-none font-mono text-sm leading-relaxed text-slate-300 custom-scrollbar selection:bg-emerald-500/50"
                                placeholder="Enter encrypted intelligence data..."
                                disabled={isLoading}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Loading Overlay */}
            <AnimatePresence>
                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-slate-950/20 backdrop-blur-[2px] z-50 flex items-center justify-center"
                    >
                        <div className="bg-slate-900 border border-white/10 p-4 rounded-2xl shadow-2xl flex items-center gap-4">
                            <Loader2 className="animate-spin text-emerald-500" size={24} />
                            <span className="font-mono text-xs font-black tracking-widest uppercase">Syncing Cryptographic Node...</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SecureVault;
