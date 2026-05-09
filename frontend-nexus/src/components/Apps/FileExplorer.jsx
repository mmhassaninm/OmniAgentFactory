import React, { useState, useEffect, useCallback } from 'react';
import {
    Folder, File, Image as ImageIcon, FileText, Code, Settings,
    ChevronRight, ChevronDown, ArrowUpCircle, HardDrive, RefreshCw, AlertTriangle,
    Search, LayoutGrid, List, Home, Star, Monitor, Download, Music, Video,
    FolderOpen, ArrowLeft, ArrowRight, FileCode2, Archive, Database,
    Cpu, ChevronLeft, Image as ImageIco
} from 'lucide-react';
import nexusBridge from '../../services/bridge.js';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];

function IconRenderer({ item, size = 40 }) {
    const [thumb, setThumb] = useState(null);
    const isImage = item.extension && IMAGE_EXTENSIONS.includes(item.extension.toLowerCase());

    useEffect(() => {
        if (isImage && item.path) {
            nexusBridge.invoke('fs:read', item.path, 'base64').then(res => {
                if (typeof res === 'string' && res.startsWith('data:image')) {
                    setThumb(res);
                }
            }).catch(err => console.error('Thumb error:', err));
        } else {
            setThumb(null);
        }
    }, [item.path, isImage]);

    if (thumb) {
        return (
            <img
                src={thumb}
                alt=""
                className="object-cover rounded shadow border border-white/10"
                style={{ width: size, height: size }}
            />
        );
    }

    if (item.isDirectory) return <Folder size={size} className="text-cyan-400 fill-cyan-400/20" />;
    const ext = item.extension?.toLowerCase();

    if (isImage) return <ImageIco size={size} className="text-purple-400" />;
    if (['.txt', '.md', '.log'].includes(ext)) return <FileText size={size} className="text-slate-300" />;
    if (['.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.py'].includes(ext)) return <Code size={size} className="text-yellow-400" />;
    if (['.exe', '.dll', '.msi'].includes(ext)) return <Settings size={size} className="text-slate-500" />;
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return <Archive size={size} className="text-amber-400" />;
    if (['.db', '.sqlite', '.sql'].includes(ext)) return <Database size={size} className="text-emerald-400" />;

    return <File size={size} className="text-slate-400" />;
}

// ── Quick Access Icon Map ──────────────────────
const QA_ICONS = {
    'Desktop': Monitor,
    'Documents': FileText,
    'Downloads': Download,
    'Pictures': ImageIcon,
    'Music': Music,
    'Videos': Video,
};

const QA_COLORS = {
    'Desktop': 'text-blue-400',
    'Documents': 'text-yellow-400',
    'Downloads': 'text-green-400',
    'Pictures': 'text-purple-400',
    'Music': 'text-pink-400',
    'Videos': 'text-red-400',
};

export default function FileExplorer({ initialPath = null }) {
    const [currentPath, setCurrentPath] = useState(null); // null = "This PC" home
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [viewMode, setViewMode] = useState('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // This PC data
    const [drives, setDrives] = useState([]);
    const [quickAccess, setQuickAccess] = useState([]);
    const [storageRoot, setStorageRoot] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(true);

    // ── Initialize: Load "This PC" Home Data ──────────
    useEffect(() => {
        const init = async () => {
            try {
                const [drivesData, qaData, rootData] = await Promise.all([
                    nexusBridge.invoke('fs:drives'),
                    nexusBridge.invoke('fs:quick-access'),
                    nexusBridge.invoke('fs:storage-root'),
                ]);
                setDrives(drivesData || []);
                setQuickAccess(qaData || []);
                setStorageRoot(rootData || '');

                // If launched with an initial path (e.g. from a Desktop shortcut), navigate to it
                if (initialPath) {
                    loadDirectory(initialPath);
                }
            } catch (err) {
                console.error('[MyFiles] Init error:', err);
            }
        };
        init();
    }, []);

    // ── Load a specific directory ──────────
    const loadDirectory = useCallback(async (targetPath, addToHistory = true) => {
        setLoading(true);
        setError(null);
        try {
            const items = await nexusBridge.invoke('fs:list', targetPath);
            if (items.error) throw new Error(items.error);
            setFiles(items);
            setCurrentPath(targetPath);
            setSearchQuery('');
            if (addToHistory) {
                setHistory(prev => {
                    const newHistory = [...prev.slice(0, historyIndex + 1), targetPath];
                    setHistoryIndex(newHistory.length - 1);
                    return newHistory;
                });
            }
        } catch (err) {
            console.error('[MyFiles] Error:', err);
            setError(err.message || 'Failed to read directory');
        } finally {
            setLoading(false);
        }
    }, [historyIndex]);

    // ── Navigation ──────────
    const goHome = () => {
        setCurrentPath(null);
        setFiles([]);
        setSearchQuery('');
    };

    const goUp = () => {
        if (!currentPath) return;
        const parts = currentPath.replace(/[\\/]+$/, '').split(/[\\/]/);
        parts.pop();
        if (parts.length === 0) { goHome(); return; }
        if (parts.length === 1 && parts[0].includes(':')) {
            loadDirectory(parts[0] + '\\');
        } else {
            loadDirectory(parts.join('\\'));
        }
    };

    const goBack = () => {
        if (historyIndex <= 0) { goHome(); return; }
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        loadDirectory(history[newIndex], false);
    };

    const goForward = () => {
        if (historyIndex >= history.length - 1) return;
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        loadDirectory(history[newIndex], false);
    };

    // ── Drag Start Handler ──────────
    const handleDragStart = (e, item) => {
        e.dataTransfer.setData('application/nexus-file', JSON.stringify({
            name: item.name,
            path: item.path,
            isDirectory: item.isDirectory,
            extension: item.extension || '',
        }));
        e.dataTransfer.effectAllowed = 'copyLink';
    };

    // ── Format Bytes ──────────
    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    // ── Breadcrumbs ──────────
    const getBreadcrumbs = () => {
        if (!currentPath) return [];
        const parts = currentPath.split(/[\\/]/).filter(Boolean);
        const crumbs = [];
        for (let i = 0; i < parts.length; i++) {
            crumbs.push({
                label: parts[i],
                path: parts.slice(0, i + 1).join('\\') + (i === 0 && parts[0].includes(':') ? '\\' : ''),
            });
        }
        return crumbs;
    };

    const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

    // ════════════════════════════════════════════════
    //               RENDER
    // ════════════════════════════════════════════════
    return (
        <div className="flex flex-col h-full bg-[#0a0a1a] text-white rounded-b-xl overflow-hidden font-sans">
            {/* ── Toolbar ── */}
            <div className="flex flex-col gap-2 p-2.5 bg-[#0d0d20]/80 border-b border-white/10 backdrop-blur-md shrink-0 z-10">
                <div className="flex items-center gap-1.5">
                    {/* Nav Buttons */}
                    <button onClick={goBack} disabled={historyIndex <= 0 && !currentPath}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-cyan-400 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                        <ArrowLeft size={16} />
                    </button>
                    <button onClick={goForward} disabled={historyIndex >= history.length - 1}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-cyan-400 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                        <ArrowRight size={16} />
                    </button>
                    <button onClick={goUp} disabled={!currentPath}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-cyan-400 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                        <ArrowUpCircle size={16} />
                    </button>
                    <button onClick={() => currentPath ? loadDirectory(currentPath) : null}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-cyan-400 transition-colors">
                        <RefreshCw size={14} className={loading ? 'animate-spin text-cyan-400' : ''} />
                    </button>

                    {/* Breadcrumb / Address Bar */}
                    <div className="ml-1 flex-1 flex items-center gap-1 px-3 py-1.5 bg-black/50 border border-white/10 rounded-lg text-xs font-mono text-slate-300 overflow-hidden min-w-0">
                        <button onClick={goHome} className="shrink-0 text-cyan-500 hover:text-cyan-300 transition-colors">
                            <Home size={13} />
                        </button>
                        {currentPath ? (
                            <>
                                <ChevronRight size={10} className="text-slate-600 shrink-0" />
                                {getBreadcrumbs().map((crumb, i) => (
                                    <React.Fragment key={i}>
                                        <button onClick={() => loadDirectory(crumb.path)}
                                            className="text-cyan-400/80 hover:text-cyan-300 truncate transition-colors max-w-[120px]">
                                            {crumb.label}
                                        </button>
                                        {i < getBreadcrumbs().length - 1 && <ChevronRight size={10} className="text-slate-600 shrink-0" />}
                                    </React.Fragment>
                                ))}
                            </>
                        ) : (
                            <>
                                <ChevronRight size={10} className="text-slate-600 shrink-0" />
                                <span className="text-cyan-400/80">This PC</span>
                            </>
                        )}
                    </div>

                    {/* View Toggle */}
                    <div className="flex items-center gap-0.5 bg-black/40 p-0.5 rounded-lg border border-white/10">
                        <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white/10 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}>
                            <LayoutGrid size={13} />
                        </button>
                        <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white/10 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}>
                            <List size={13} />
                        </button>
                    </div>
                </div>

                {/* Search */}
                {currentPath && (
                    <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 focus-within:border-cyan-500/50">
                        <Search size={13} className="text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search current directory..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1 bg-transparent text-xs outline-none text-slate-300 placeholder-slate-600"
                        />
                    </div>
                )}
            </div>

            {/* ── Main Content ── */}
            <div className="flex-1 flex overflow-hidden">
                {/* ── Left Sidebar ── */}
                <div className={`${sidebarOpen ? 'w-52' : 'w-0'} shrink-0 bg-[#070714] border-r border-white/5 overflow-y-auto overflow-x-hidden custom-scrollbar transition-all`}>
                    {sidebarOpen && (
                        <div className="py-3 px-2 text-[11px]">
                            {/* Quick Access */}
                            <div className="mb-4">
                                <div className="flex items-center gap-1.5 px-2 mb-2 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                                    <Star size={10} /> Quick Access
                                </div>
                                {quickAccess.map((qa) => {
                                    const Icon = QA_ICONS[qa.name] || Folder;
                                    const color = QA_COLORS[qa.name] || 'text-cyan-400';
                                    return (
                                        <button
                                            key={qa.name}
                                            onClick={() => loadDirectory(qa.path)}
                                            className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors
                                                ${currentPath === qa.path ? 'bg-white/10 text-white' : 'text-slate-400'}`}
                                        >
                                            <Icon size={14} className={color} />
                                            <span className="truncate">{qa.name}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Drives */}
                            <div>
                                <div className="flex items-center gap-1.5 px-2 mb-2 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                                    <HardDrive size={10} /> Drives
                                </div>
                                {drives.map((drive) => (
                                    <button
                                        key={drive.letter}
                                        onClick={() => loadDirectory(drive.path)}
                                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors
                                            ${currentPath === drive.path ? 'bg-white/10 text-white' : 'text-slate-400'}`}
                                    >
                                        <HardDrive size={14} className="text-blue-400" />
                                        <span className="truncate">{drive.letter}:</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Right Content Area ── */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                    {/* Sidebar Toggle */}
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="absolute top-2 left-2 z-10 p-1 rounded bg-white/5 hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {error && (
                        <div className="m-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-3 text-red-400 text-sm">
                            <AlertTriangle size={24} className="shrink-0" />
                            <div><strong className="block mb-1">Access Error</strong>{error}</div>
                        </div>
                    )}

                    {/* ════ THIS PC HOME ════ */}
                    {!currentPath ? (
                        <div className="p-6 space-y-8">
                            {/* Header */}
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center border border-cyan-500/30">
                                    <Cpu size={24} className="text-cyan-400" />
                                </div>
                                <div>
                                    <h1 className="text-lg font-black text-white tracking-tight">This PC</h1>
                                    <div className="text-[10px] text-slate-500 font-mono">NexusOS File System</div>
                                </div>
                            </div>

                            {/* ── Quick Access Section ── */}
                            <div>
                                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <Star size={12} className="text-yellow-400" /> Quick Access
                                </h2>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                                    {quickAccess.map((qa) => {
                                        const Icon = QA_ICONS[qa.name] || Folder;
                                        const color = QA_COLORS[qa.name] || 'text-cyan-400';
                                        return (
                                            <button
                                                key={qa.name}
                                                onClick={() => loadDirectory(qa.path)}
                                                className="group flex flex-col items-center gap-2 p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.07] hover:border-cyan-500/30 transition-all hover:-translate-y-0.5 hover:shadow-[0_5px_20px_rgba(6,182,212,0.1)]"
                                            >
                                                <div className="w-11 h-11 rounded-xl bg-black/30 flex items-center justify-center border border-white/5 group-hover:border-white/10 transition-all">
                                                    <Icon size={22} className={`${color} group-hover:scale-110 transition-transform`} />
                                                </div>
                                                <span className="text-[11px] font-medium text-slate-300 group-hover:text-white transition-colors">{qa.name}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── Devices and Drives Section ── */}
                            <div>
                                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <HardDrive size={12} className="text-blue-400" /> Devices and Drives
                                </h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                    {drives.map((drive) => {
                                        const usedPercent = drive.totalSize > 0 ? Math.round((drive.usedSize / drive.totalSize) * 100) : 0;
                                        const barColor = usedPercent > 85 ? 'bg-red-500' : usedPercent > 60 ? 'bg-amber-400' : 'bg-blue-500';
                                        return (
                                            <button
                                                key={drive.letter}
                                                onClick={() => loadDirectory(drive.path)}
                                                className="group flex flex-col p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.07] hover:border-blue-500/30 transition-all hover:-translate-y-0.5 hover:shadow-[0_5px_20px_rgba(59,130,246,0.1)] text-left"
                                            >
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                                        <HardDrive size={20} className="text-blue-400" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-bold text-white truncate">{drive.label}</div>
                                                    </div>
                                                </div>
                                                {drive.totalSize > 0 && (
                                                    <>
                                                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-1.5">
                                                            <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${usedPercent}%` }} />
                                                        </div>
                                                        <div className="text-[9px] text-slate-500 font-mono">
                                                            {formatBytes(drive.freeSpace)} free of {formatBytes(drive.totalSize)}
                                                        </div>
                                                    </>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── NexusOS Storage ── */}
                            {storageRoot && (
                                <div>
                                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <FolderOpen size={12} className="text-emerald-400" /> NexusOS Storage
                                    </h2>
                                    <button
                                        onClick={() => loadDirectory(storageRoot)}
                                        className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/20 hover:bg-emerald-500/[0.1] hover:border-emerald-500/40 transition-all w-full text-left"
                                    >
                                        <FolderOpen size={24} className="text-emerald-400" />
                                        <div>
                                            <div className="text-sm font-bold text-emerald-300">NexusOS Storage</div>
                                            <div className="text-[10px] text-slate-500 font-mono">{storageRoot}</div>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* ════ DIRECTORY BROWSER ════ */
                        <div className="p-4">
                            {loading && files.length === 0 ? (
                                <div className="flex items-center justify-center h-64">
                                    <div className="flex flex-col items-center gap-3">
                                        <RefreshCw size={28} className="animate-spin text-cyan-500/50" />
                                        <span className="text-[10px] text-cyan-500/50 font-mono tracking-widest uppercase">Scanning Directory</span>
                                    </div>
                                </div>
                            ) : filteredFiles.length === 0 && !error ? (
                                <div className="flex flex-col items-center justify-center h-64 text-slate-600">
                                    <Folder size={40} className="mb-3 opacity-20" />
                                    <span className="text-sm font-medium">This folder is empty</span>
                                </div>
                            ) : (
                                <div className={viewMode === 'grid'
                                    ? "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3"
                                    : "flex flex-col gap-0.5"
                                }>
                                    {filteredFiles.map((item, idx) => (
                                        viewMode === 'grid' ? (
                                            <div
                                                key={idx}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, item)}
                                                onClick={() => item.isDirectory ? loadDirectory(item.path) : console.log('Open:', item.path)}
                                                className="group flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-cyan-500/30 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_5px_15px_rgba(6,182,212,0.1)] text-center"
                                            >
                                                <div className="relative">
                                                    <IconRenderer item={item} size={40} />
                                                </div>
                                                <span className="text-[11px] font-medium text-slate-300 group-hover:text-white line-clamp-2 w-full break-words transition-colors">
                                                    {item.name}
                                                </span>
                                            </div>
                                        ) : (
                                            <div
                                                key={idx}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, item)}
                                                onClick={() => item.isDirectory ? loadDirectory(item.path) : console.log('Open:', item.path)}
                                                className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                                            >
                                                <div className="shrink-0">
                                                    <IconRenderer item={item} size={20} />
                                                </div>
                                                <span className="flex-1 text-sm font-medium text-slate-300 group-hover:text-white truncate">{item.name}</span>
                                                {!item.isDirectory && (
                                                    <span className="text-[10px] uppercase text-slate-500 font-mono">{item.extension?.replace('.', '') || 'FILE'}</span>
                                                )}
                                            </div>
                                        )
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Status Bar ── */}
            <div className="px-4 py-1.5 bg-[#050510] border-t border-white/5 text-[10px] text-slate-500 font-mono flex justify-between shrink-0">
                <span>{currentPath ? `${filteredFiles.length} item(s)` : `${drives.length} drive(s) • ${quickAccess.length} folders`}</span>
                <span>NexusOS Secure Filesystem</span>
            </div>
        </div>
    );
}
