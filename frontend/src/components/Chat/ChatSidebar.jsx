import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Plus, FolderPlus, ChevronRight, FolderOpen,
    MoreVertical, Pencil, Trash2, MessageSquare, ArrowRightLeft,
    Cpu, Settings, CircleDot
} from 'lucide-react';
import { useOSStore } from '../../store/osStore';

const PROVIDER_ICONS = {
    lm_studio: '🖥', openai: '✦', anthropic: '◆',
    google: '✸', groq: '⚡', openrouter: '🌐',
};

/* Maps folder color id → hex for inline border styling */
const FOLDER_HEX = {
    cyan:    '#00d4ff',
    purple:  '#7c3aed',
    emerald: '#00ff88',
    amber:   '#ffaa00',
    rose:    '#ff4444',
    blue:    '#3b82f6',
};

const ChatSidebar = memo(function ChatSidebar({
    isRtl, t, sidebarSearch, setSidebarSearch,
    createConversation, createFolder, folders, conversations,
    editingFolderId, folderNameRef, renameFolder,
    folderMenuOpen, setFolderMenuOpen, setEditingFolderId, deleteFolder,
    activeConvId, toggleFolderExpand, setActiveConvId,
    movingConvId, setMovingConvId, deleteConversation, moveConversation, getFolderColor,
    onOpenSettings
}) {
    const { activeProvider, selectedModelId } = useOSStore();
    const providerLabel = (activeProvider || 'lm_studio').replace(/_/g, ' ');
    const modelLabel = (!selectedModelId || selectedModelId === 'auto')
        ? 'AutoDetect'
        : selectedModelId.split('/').pop().substring(0, 16);

    return (
        <div
            className={`nd-sidebar w-72 flex-shrink-0 flex flex-col nd-noise
                ${isRtl ? 'border-l' : 'border-r'}`}
            style={{
                background: 'var(--bg-panel)',
                borderColor: 'var(--border-subtle)',
            }}
        >
            {/* ─── Header ─────────────────────────────────────────── */}
            <div
                className="px-4 py-3.5 flex-shrink-0"
                style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.2)' }}
            >
                <div className={`flex items-center gap-2.5 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <div className="relative flex-shrink-0">
                        <div
                            className="absolute inset-0 rounded-xl blur-md animate-pulse"
                            style={{ background: 'rgba(0,212,255,0.22)' }}
                        />
                        <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center relative"
                            style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-primary)',
                                boxShadow: '0 0 12px rgba(0,212,255,0.15)',
                            }}
                        >
                            <Cpu size={15} style={{ color: 'var(--accent-primary)' }} />
                        </div>
                    </div>
                    <div>
                        <div
                            className="text-[11px] font-black tracking-widest uppercase"
                            style={{ color: 'var(--text-primary)' }}
                        >
                            Nexus Chat
                        </div>
                        <div
                            className="text-[8px] uppercase tracking-widest font-bold"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            Intelligence Engine
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Search ──────────────────────────────────────────── */}
            <div className="px-3 pt-3 pb-1 flex-shrink-0">
                <div className="relative">
                    <Search
                        className={`absolute ${isRtl ? 'right-2.5' : 'left-2.5'} top-1/2 -translate-y-1/2`}
                        size={12}
                        style={{ color: 'var(--text-muted)' }}
                    />
                    <input
                        type="text"
                        value={sidebarSearch}
                        onChange={e => setSidebarSearch(e.target.value)}
                        placeholder="Search chats…"
                        className={`w-full rounded-lg py-1.5 text-[10px] focus:outline-none transition-all
                            ${isRtl ? 'pr-7 pl-2' : 'pl-7 pr-2'}`}
                        style={{
                            background: 'rgba(0,0,0,0.25)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)',
                        }}
                        onFocus={e => { e.target.style.borderColor = 'var(--border-primary)'; e.target.style.boxShadow = 'var(--glow-primary)'; }}
                        onBlur={e =>  { e.target.style.borderColor = 'var(--border-subtle)';  e.target.style.boxShadow = 'none'; }}
                    />
                </div>
            </div>

            {/* ─── New Chat + New Folder ────────────────────────────── */}
            <div className={`flex gap-1.5 px-3 pb-2 pt-1 flex-shrink-0 ${isRtl ? 'flex-row-reverse' : ''}`}>
                {/* New Chat — gradient border on hover */}
                <button
                    onClick={() => createConversation()}
                    className={`nd-btn-gradient flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all
                        ${isRtl ? 'flex-row-reverse' : ''}`}
                    style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-primary)',
                        color: 'var(--accent-primary)',
                    }}
                >
                    <Plus size={12} />
                    <span>{t('chat.new_chat', { defaultValue: 'New Chat' })}</span>
                </button>

                <button
                    onClick={createFolder}
                    title="New Folder"
                    className="flex items-center justify-center p-2 rounded-xl transition-all"
                    style={{
                        background: 'rgba(124,58,237,0.10)',
                        border: '1px solid var(--border-secondary)',
                        color: '#a78bfa',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.18)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.10)'; }}
                >
                    <FolderPlus size={13} />
                </button>
            </div>

            {/* ─── Folder + Conversation List ──────────────────────── */}
            <div className="flex-1 overflow-y-auto px-2 space-y-0.5 custom-scrollbar py-1">
                {folders.map(folder => {
                    const fc = getFolderColor(folder.color);
                    const accentHex = FOLDER_HEX[folder.color] || '#00d4ff';
                    const folderConvs = conversations
                        .filter(c => (c.folderId || 'default') === folder.id)
                        .filter(c => !sidebarSearch || c.title.toLowerCase().includes(sidebarSearch.toLowerCase()));
                    if (sidebarSearch && folderConvs.length === 0) return null;

                    return (
                        <div key={folder.id} className="mb-0.5">
                            {/* Folder Header */}
                            <div
                                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer group transition-all ${isRtl ? 'flex-row-reverse' : ''}`}
                                onClick={() => toggleFolderExpand(folder.id)}
                                style={{ transition: 'background var(--t-base)' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                                <ChevronRight
                                    size={11}
                                    className={`flex-shrink-0 transition-transform duration-200 ${folder.expanded ? 'rotate-90' : ''}`}
                                    style={{ color: 'var(--text-muted)' }}
                                />
                                {/* Color dot indicator */}
                                <span
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ background: accentHex, boxShadow: `0 0 6px ${accentHex}60` }}
                                />
                                {editingFolderId === folder.id ? (
                                    <input
                                        ref={folderNameRef}
                                        defaultValue={folder.name}
                                        className="flex-1 bg-transparent text-[10px] font-bold focus:outline-none"
                                        style={{ color: 'var(--text-primary)', borderBottom: `1px solid ${accentHex}` }}
                                        onBlur={e => renameFolder(folder.id, e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') renameFolder(folder.id, e.target.value); }}
                                        onClick={e => e.stopPropagation()}
                                    />
                                ) : (
                                    <span
                                        className="flex-1 text-[9px] font-black truncate uppercase tracking-widest"
                                        style={{ color: 'var(--text-muted)' }}
                                    >
                                        {folder.name}
                                    </span>
                                )}
                                <span
                                    className="text-[8px] font-mono flex-shrink-0"
                                    style={{ color: 'var(--text-muted)' }}
                                >
                                    {folderConvs.length}
                                </span>

                                {/* Folder actions */}
                                <div className="relative" onClick={e => e.stopPropagation()}>
                                    <button
                                        className="opacity-0 group-hover:opacity-100 transition-all p-0.5"
                                        style={{ color: 'var(--text-muted)' }}
                                        onClick={() => setFolderMenuOpen(folderMenuOpen === folder.id ? null : folder.id)}
                                    >
                                        <MoreVertical size={10} />
                                    </button>
                                    <AnimatePresence>
                                        {folderMenuOpen === folder.id && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                                transition={{ duration: 0.12 }}
                                                className={`absolute ${isRtl ? 'left-0' : 'right-0'} top-full mt-1 py-1 min-w-[130px] rounded-xl shadow-2xl z-50 overflow-hidden`}
                                                style={{
                                                    background: 'var(--bg-elevated)',
                                                    border: '1px solid var(--border-default)',
                                                }}
                                            >
                                                {[
                                                    { label: 'Rename', icon: Pencil, action: () => { setEditingFolderId(folder.id); setFolderMenuOpen(null); setTimeout(() => folderNameRef.current?.focus(), 50); } },
                                                    { label: 'New Chat Here', icon: Plus, action: () => { createConversation(folder.id); setFolderMenuOpen(null); } },
                                                ].map(({ label, icon: Icon, action }) => (
                                                    <button
                                                        key={label}
                                                        onClick={action}
                                                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[10px] transition-all ${isRtl ? 'flex-row-reverse' : ''}`}
                                                        style={{ color: 'var(--text-secondary)' }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                                    >
                                                        <Icon size={10} /> {label}
                                                    </button>
                                                ))}
                                                {folder.id !== 'default' && (
                                                    <button
                                                        onClick={() => deleteFolder(folder.id)}
                                                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[10px] transition-all ${isRtl ? 'flex-row-reverse' : ''}`}
                                                        style={{ color: 'var(--accent-error)' }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,68,68,0.08)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                                    >
                                                        <Trash2 size={10} /> Delete
                                                    </button>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Conversations inside folder */}
                            <AnimatePresence>
                                {folder.expanded && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.15, ease: 'easeOut' }}
                                        className={`space-y-0.5 overflow-hidden ${isRtl ? 'pr-4' : 'pl-4'}`}
                                    >
                                        {folderConvs.length === 0 && !sidebarSearch && (
                                            <div className="text-center text-[9px] py-2 italic" style={{ color: 'var(--text-muted)' }}>
                                                Empty
                                            </div>
                                        )}
                                        {folderConvs.map(conv => {
                                            const isActive = activeConvId === conv.id;
                                            return (
                                                <div
                                                    key={conv.id}
                                                    onClick={() => setActiveConvId(conv.id)}
                                                    className={`nd-conv-item group flex items-center gap-1.5 px-2.5 py-1.5 rounded-r-lg cursor-pointer text-[10px] ${isRtl ? 'flex-row-reverse' : ''} ${isActive ? 'nd-conv-active' : ''}`}
                                                    style={{
                                                        borderLeftColor: isActive ? accentHex : 'transparent',
                                                        color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                                                    }}
                                                >
                                                    <MessageSquare size={11} className="flex-shrink-0" style={{ color: isActive ? accentHex : undefined }} />
                                                    <span className="flex-1 truncate font-medium">{conv.title}</span>

                                                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0 transition-opacity">
                                                        <button
                                                            onClick={e => { e.stopPropagation(); setMovingConvId(movingConvId === conv.id ? null : conv.id); }}
                                                            className="p-0.5 rounded transition-colors"
                                                            style={{ color: 'var(--text-muted)' }}
                                                            title="Move"
                                                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-primary)'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                                                        >
                                                            <ArrowRightLeft size={9} />
                                                        </button>
                                                        <button
                                                            onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }}
                                                            className="p-0.5 rounded transition-colors"
                                                            style={{ color: 'var(--text-muted)' }}
                                                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-error)'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                                                        >
                                                            <Trash2 size={9} />
                                                        </button>
                                                    </div>

                                                    {/* Move dropdown */}
                                                    {movingConvId === conv.id && (
                                                        <div
                                                            className={`absolute ${isRtl ? 'left-0' : 'right-2'} mt-16 py-1 min-w-[144px] rounded-xl shadow-2xl z-50 overflow-hidden`}
                                                            style={{
                                                                background: 'var(--bg-elevated)',
                                                                border: '1px solid var(--border-default)',
                                                            }}
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            <div className="px-3 py-1 text-[8px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                                                Move to…
                                                            </div>
                                                            {folders.filter(f => f.id !== folder.id).map(f => (
                                                                <button
                                                                    key={f.id}
                                                                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-[10px] transition-all ${isRtl ? 'flex-row-reverse' : ''}`}
                                                                    style={{ color: 'var(--text-secondary)' }}
                                                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                                                    onClick={() => moveConversation(conv.id, f.id)}
                                                                >
                                                                    <FolderOpen size={10} className={getFolderColor(f.color).class} />
                                                                    {f.name}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })}
            </div>

            {/* ─── Footer: Settings + Provider Status ──────────────── */}
            <div className="flex-shrink-0 p-3 space-y-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                {/* Settings button */}
                <button
                    onClick={onOpenSettings}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl group transition-all"
                    style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-muted)',
                        transition: 'all var(--t-base)',
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.color = 'var(--text-primary)';
                        e.currentTarget.style.borderColor = 'var(--border-default)';
                        e.currentTarget.style.background = 'var(--bg-elevated)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.color = 'var(--text-muted)';
                        e.currentTarget.style.borderColor = 'var(--border-subtle)';
                        e.currentTarget.style.background = 'var(--bg-card)';
                    }}
                >
                    <Settings
                        size={14}
                        className="group-hover:rotate-90 transition-transform duration-500"
                    />
                    <span className="text-[9px] font-black uppercase tracking-widest">Settings</span>
                </button>

                {/* Mini provider + model status */}
                <div
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg ${isRtl ? 'flex-row-reverse' : ''}`}
                    style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-subtle)' }}
                >
                    <CircleDot size={8} style={{ color: 'var(--accent-success)', flexShrink: 0 }} />
                    <span className="text-[9px] font-bold capitalize flex-1 truncate" style={{ color: 'var(--text-muted)' }}>
                        {PROVIDER_ICONS[activeProvider] || '🤖'} {providerLabel}
                    </span>
                    <span
                        className="text-[8px] font-mono truncate max-w-[80px]"
                        style={{ color: 'var(--text-muted)' }}
                        title={selectedModelId || 'auto'}
                    >
                        {modelLabel}
                    </span>
                </div>
            </div>
        </div>
    );
});

export default ChatSidebar;
