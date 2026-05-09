import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Edit3, Save, X, BrainCircuit, RefreshCw } from 'lucide-react';

export default function PsychoProfileViewer() {
    const [profileContent, setProfileContent] = useState('');
    const [isEditing, setIsEditing] = window.useState(false);
    const [editBuffer, setEditBuffer] = useState('');
    const [loading, setLoading] = useState(true);

    const loadProfile = async () => {
        setLoading(true);
        try {
            const data = await window.nexusAPI.invoke('profile:get-active', 'User');
            setProfileContent(data || 'No psychometric signature established yet. Chat more to generate one.');
            setEditBuffer(data || '');
        } catch (e) {
            console.error('Failed to load psychometric profile', e);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadProfile();
    }, []);

    const handleSave = async () => {
        setLoading(true);
        try {
            await window.nexusAPI.invoke('profile:update-manual', {
                username: 'User',
                content: editBuffer
            });
            setProfileContent(editBuffer);
            setIsEditing(false);
        } catch (e) {
            console.error('Failed to save psychometric profile', e);
        }
        setLoading(false);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col h-full bg-[#050510] border border-white/10 rounded-xl overflow-hidden shadow-2xl"
        >
            <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <BrainCircuit size={18} className="text-[#00f3ff]" />
                    <h3 className="font-semibold text-white tracking-wide uppercase text-sm">
                        The Citadel — Psychometric State
                    </h3>
                </div>
                <div className="flex items-center gap-2">
                    {!isEditing ? (
                        <>
                            <button onClick={loadProfile} className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-white/10 transition-colors">
                                <RefreshCw size={14} className={loading ? "animate-spin text-[#00f3ff]" : ""} />
                            </button>
                            <button onClick={() => setIsEditing(true)} className="p-1.5 text-slate-400 hover:text-[#bc13fe] rounded-md hover:bg-[#bc13fe]/20 transition-colors">
                                <Edit3 size={14} />
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setIsEditing(false)} className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md hover:bg-rose-400/20 transition-colors">
                                <X size={14} />
                            </button>
                            <button onClick={handleSave} className="p-1.5 text-emerald-400 hover:text-white rounded-md bg-emerald-400/20 hover:bg-emerald-400/40 transition-colors ml-1">
                                <Save size={14} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {isEditing ? (
                    <textarea
                        value={editBuffer}
                        onChange={(e) => setEditBuffer(e.target.value)}
                        className="w-full h-full min-h-[300px] bg-black/40 border border-[#bc13fe]/30 rounded-lg p-4 text-slate-300 font-mono text-sm focus:outline-none focus:border-[#bc13fe] resize-none"
                        spellCheck="false"
                        dir="auto"
                    />
                ) : (
                    <div
                        className="prose prose-invert prose-sm max-w-none text-slate-300 prose-headings:text-[#00f3ff] prose-a:text-[#bc13fe] prose-strong:text-white"
                        dir="auto"
                        dangerouslySetInnerHTML={{ __html: profileContent.replace(/\n/g, '<br/>') }} // Simple proxy for markdown render
                    />
                )}
            </div>
        </motion.div>
    );
}
