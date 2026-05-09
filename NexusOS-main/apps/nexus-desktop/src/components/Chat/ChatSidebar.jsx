import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, FolderPlus, ChevronRight, FolderOpen, MoreVertical, Pencil, Trash2, MessageSquare, ArrowRightLeft, Cpu } from 'lucide-react';

export default function ChatSidebar({
    isRtl, t, sidebarSearch, setSidebarSearch,
    createConversation, createFolder, folders, conversations,
    editingFolderId, folderNameRef, renameFolder,
    folderMenuOpen, setFolderMenuOpen, setEditingFolderId, deleteFolder,
    activeConvId, toggleFolderExpand, setActiveConvId,
    movingConvId, setMovingConvId, deleteConversation, moveConversation, getFolderColor
}) {
    return (
        <div className={`w-72 flex-shrink-0 border-white/5 bg-white/[0.02] flex flex-col ${isRtl ? 'border-l' : 'border-r'}`}>
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/5 bg-black/40">
                <div className={`flex items-center gap-2.5 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <div className="relative">
                        <div className="absolute inset-0 bg-cyan-500/20 blur-lg rounded-full animate-pulse"></div>
                        <div className="w-8 h-8 rounded-lg bg-slate-900 border border-cyan-500/30 flex items-center justify-center relative">
                            <Cpu size={16} className="text-cyan-400" />
                        </div>
                    </div>
                    <div>
                        <div className="text-xs font-black tracking-wider uppercase text-white">Nexus Chat</div>
                        <div className="text-[9px] text-slate-500 uppercase tracking-wider">Intelligence Engine</div>
                    </div>
                </div>
            </div>

            {/* ── Sidebar Search ── */}
            <div className="px-3 pb-2">
                <div className="relative">
                    <Search className={`absolute ${isRtl ? 'right-2.5' : 'left-2.5'} top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600`} />
                    <input type="text" value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)}
                        placeholder="Search chats..." className={`w-full bg-black/20 border border-white/5 rounded-lg py-1.5 text-[10px] text-gray-300 placeholder:text-gray-700 focus:outline-none focus:border-cyan-500/30 ${isRtl ? 'pr-7 pl-2' : 'pl-7 pr-2'}`} />
                </div>
            </div>

            {/* ── New Chat + New Folder ── */}
            <div className={`flex gap-1.5 px-3 pb-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                <button onClick={() => createConversation()}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-all text-[10px] font-bold uppercase tracking-wider ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <Plus className="w-3 h-3" />
                    <span>{t('chat.new_chat', { defaultValue: 'New Chat' })}</span>
                </button>
                <button onClick={createFolder}
                    className="flex items-center justify-center p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-all" title="New Folder">
                    <FolderPlus className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* ── Folder + Conversation List ── */}
            <div className="flex-1 overflow-y-auto px-2 space-y-0.5 custom-scrollbar">
                {folders.map(folder => {
                    const fc = getFolderColor(folder.color);
                    const folderConvs = conversations.filter(c => (c.folderId || 'default') === folder.id)
                        .filter(c => !sidebarSearch || c.title.toLowerCase().includes(sidebarSearch.toLowerCase()));
                    if (sidebarSearch && folderConvs.length === 0) return null;

                    return (
                        <div key={folder.id} className="mb-1">
                            {/* Folder Header */}
                            <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer group hover:bg-white/[0.03] transition-all ${isRtl ? 'flex-row-reverse' : ''}`}
                                onClick={() => toggleFolderExpand(folder.id)}>
                                <ChevronRight className={`w-3 h-3 text-gray-600 transition-transform flex-shrink-0 ${folder.expanded ? 'rotate-90' : ''}`} />
                                <FolderOpen className={`w-3.5 h-3.5 flex-shrink-0 ${fc.class}`} />
                                {editingFolderId === folder.id ? (
                                    <input ref={folderNameRef} defaultValue={folder.name}
                                        className="flex-1 bg-transparent text-[10px] text-white font-bold focus:outline-none border-b border-cyan-500/50"
                                        onBlur={(e) => renameFolder(folder.id, e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') renameFolder(folder.id, e.target.value); }}
                                        onClick={(e) => e.stopPropagation()} />
                                ) : (
                                    <span className="flex-1 text-[10px] font-bold text-gray-400 truncate uppercase tracking-wider">{folder.name}</span>
                                )}
                                <span className="text-[8px] text-gray-700 font-mono">{folderConvs.length}</span>
                                {/* Folder actions */}
                                <div className="relative" onClick={e => e.stopPropagation()}>
                                    <button className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-white p-0.5 transition-all"
                                        onClick={() => setFolderMenuOpen(folderMenuOpen === folder.id ? null : folder.id)}>
                                        <MoreVertical size={10} />
                                    </button>
                                    {folderMenuOpen === folder.id && (
                                        <div className={`absolute ${isRtl ? 'left-0' : 'right-0'} top-full mt-1 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl z-50 py-1 min-w-[120px]`}>
                                            <button className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-gray-300 hover:bg-white/5"
                                                onClick={() => { setEditingFolderId(folder.id); setFolderMenuOpen(null); setTimeout(() => folderNameRef.current?.focus(), 50); }}>
                                                <Pencil size={10} /> Rename
                                            </button>
                                            <button className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-gray-300 hover:bg-white/5"
                                                onClick={() => { createConversation(folder.id); setFolderMenuOpen(null); }}>
                                                <Plus size={10} /> New Chat Here
                                            </button>
                                            {folder.id !== 'default' && (
                                                <button className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-red-400 hover:bg-red-500/10"
                                                    onClick={() => deleteFolder(folder.id)}>
                                                    <Trash2 size={10} /> Delete
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Conversations inside folder */}
                            {folder.expanded && (
                                <div className={`space-y-0.5 ${isRtl ? 'pr-4' : 'pl-4'}`}>
                                    {folderConvs.length === 0 && !sidebarSearch && (
                                        <div className="text-center text-gray-700 text-[9px] py-2 italic">Empty</div>
                                    )}
                                    {folderConvs.map(conv => (
                                        <div key={conv.id} onClick={() => setActiveConvId(conv.id)}
                                            className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all text-[10px] ${isRtl ? 'flex-row-reverse' : ''}
                                                ${activeConvId === conv.id ? `${fc.bg} text-white border ${fc.border}` : 'text-gray-500 hover:bg-white/[0.03] hover:text-gray-300'}`}>
                                            <MessageSquare className="w-3 h-3 flex-shrink-0" />
                                            <span className="flex-1 truncate">{conv.title}</span>
                                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0">
                                                <button onClick={(e) => { e.stopPropagation(); setMovingConvId(movingConvId === conv.id ? null : conv.id); }}
                                                    className="text-gray-600 hover:text-cyan-400 transition-all p-0.5" title="Move">
                                                    <ArrowRightLeft size={9} />
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                                                    className="text-gray-600 hover:text-red-400 transition-all p-0.5">
                                                    <Trash2 size={9} />
                                                </button>
                                            </div>
                                            {/* Move dropdown */}
                                            {movingConvId === conv.id && (
                                                <div className={`absolute ${isRtl ? 'left-0' : 'right-2'} mt-16 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl z-50 py-1 min-w-[140px]`}
                                                    onClick={e => e.stopPropagation()}>
                                                    <div className="px-3 py-1 text-[8px] text-gray-600 uppercase font-bold tracking-wider">Move to...</div>
                                                    {folders.filter(f => f.id !== folder.id).map(f => (
                                                        <button key={f.id} className={`w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-gray-300 hover:bg-white/5 ${isRtl ? 'flex-row-reverse' : ''}`}
                                                            onClick={() => moveConversation(conv.id, f.id)}>
                                                            <FolderOpen size={10} className={getFolderColor(f.color).class} />
                                                            {f.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
