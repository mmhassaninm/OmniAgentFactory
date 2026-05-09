import React, { useState, useEffect, useCallback } from 'react'
import {
  Folder, File, Image as ImageIcon, FileText, Code, Settings,
  ChevronRight, RefreshCw, AlertTriangle, Search, LayoutGrid, List,
  Home, Monitor, Download, Music, Video, Archive, Database, FolderOpen,
  ArrowLeft, Terminal, Cpu
} from 'lucide-react'

// Image extensions for potential thumbnail display or custom icons
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']

interface FileItem {
  name: string
  type: 'directory' | 'file'
  size: number
  modified: string
  path: string
}

function IconRenderer({ item }: { item: FileItem }) {
  if (item.type === 'directory') {
    return <Folder size={32} className="text-cyan-400 fill-cyan-400/10" />
  }

  const dotIdx = item.name.lastIndexOf('.')
  const ext = dotIdx !== -1 ? item.name.substring(dotIdx).toLowerCase() : ''

  if (IMAGE_EXTENSIONS.includes(ext)) {
    return <ImageIcon size={32} className="text-purple-400 fill-purple-400/10" />
  }
  if (['.txt', '.md', '.log', '.json', '.yaml', '.yml'].includes(ext)) {
    return <FileText size={32} className="text-emerald-400 fill-emerald-400/10" />
  }
  if (['.js', '.jsx', '.ts', '.tsx', '.py', '.html', '.css', '.sh', '.bat'].includes(ext)) {
    return <Code size={32} className="text-yellow-400 fill-yellow-400/10" />
  }
  if (['.zip', '.rar', '.tar', '.gz', '.7z'].includes(ext)) {
    return <Archive size={32} className="text-amber-500 fill-amber-500/10" />
  }
  if (['.db', '.sqlite', '.sqlite3', '.sql'].includes(ext)) {
    return <Database size={32} className="text-cyan-500 fill-cyan-500/10" />
  }

  return <File size={32} className="text-slate-400" />
}

export const FileExplorer: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string>('')
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Navigation history tracking
  const [history, setHistory] = useState<string[]>([''])
  const [historyIdx, setHistoryIdx] = useState<number>(0)

  // ── Load a directory from the API ──────────────────────────────────────
  const loadDirectory = useCallback(async (targetPath: string, addToHistory = true) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/files?path=${encodeURIComponent(targetPath)}`)
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`)
      }
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error)
      }
      setFiles(data)
      setCurrentPath(targetPath)
      setSearchQuery('')

      if (addToHistory) {
        const nextHistory = [...history.slice(0, historyIdx + 1), targetPath]
        setHistory(nextHistory)
        setHistoryIdx(nextHistory.length - 1)
      }
    } catch (err: any) {
      console.error('[FileExplorer] fetch error:', err)
      setError(err.message || 'Failed to read directory')
    } finally {
      setLoading(false)
    }
  }, [history, historyIdx])

  // Initial load
  useEffect(() => {
    loadDirectory('')
    // eslint-disable-next-line
  }, [])

  // Navigation handlers
  const handleBack = () => {
    if (historyIdx > 0) {
      const target = history[historyIdx - 1]
      setHistoryIdx(historyIdx - 1)
      loadDirectory(target, false)
    }
  }

  const handleForward = () => {
    if (historyIdx < history.length - 1) {
      const target = history[historyIdx + 1]
      setHistoryIdx(historyIdx + 1)
      loadDirectory(target, false)
    }
  }

  const handleUp = () => {
    if (!currentPath) return
    const parts = currentPath.split(/[\\/]/).filter(Boolean)
    parts.pop()
    const parentPath = parts.join('/')
    loadDirectory(parentPath)
  }

  const handleHome = () => {
    loadDirectory('')
  }

  const handleRefresh = () => {
    loadDirectory(currentPath, false)
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const getBreadcrumbs = () => {
    if (!currentPath) return []
    const parts = currentPath.split(/[\\/]/).filter(Boolean)
    return parts.map((part, i) => ({
      label: part,
      path: parts.slice(0, i + 1).join('/'),
    }))
  }

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex h-full bg-[#070b11] text-white/90 font-sans select-none overflow-hidden">
      {/* Workspace Sidebar */}
      <div className="w-56 shrink-0 border-r border-white/5 bg-black/40 flex flex-col">
        <div className="p-4 border-b border-white/5 bg-white/[0.01]">
          <span className="text-[10px] uppercase font-black tracking-widest text-white/40">Nexus Workspace</span>
        </div>

        {/* Sidebar Navigation Links */}
        <div className="flex-1 p-2 space-y-1.5 overflow-y-auto">
          <button
            onClick={() => loadDirectory('')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all ${
              currentPath === '' ? 'bg-white/10 text-cyan-400' : 'hover:bg-white/5 text-slate-400'
            }`}
          >
            <Home size={15} />
            <span>Project Root</span>
          </button>
          <button
            onClick={() => loadDirectory('frontend')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all ${
              currentPath === 'frontend' ? 'bg-white/10 text-cyan-400' : 'hover:bg-white/5 text-slate-400'
            }`}
          >
            <Monitor size={15} />
            <span>Frontend App</span>
          </button>
          <button
            onClick={() => loadDirectory('backend')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all ${
              currentPath === 'backend' ? 'bg-white/10 text-cyan-400' : 'hover:bg-white/5 text-slate-400'
            }`}
          >
            <Cpu size={15} />
            <span>Backend Server</span>
          </button>
          <button
            onClick={() => loadDirectory('backend/agents')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all ${
              currentPath === 'backend/agents' ? 'bg-white/10 text-cyan-400' : 'hover:bg-white/5 text-slate-400'
            }`}
          >
            <Cpu size={15} className="text-purple-400" />
            <span>Agent Systems</span>
          </button>
          <button
            onClick={() => loadDirectory('backend/logs/exports')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all ${
              currentPath === 'backend/logs/exports' ? 'bg-white/10 text-cyan-400' : 'hover:bg-white/5 text-slate-400'
            }`}
          >
            <ImageIcon size={15} className="text-pink-400" />
            <span>Agent Exports</span>
          </button>
        </div>
      </div>

      {/* Main File Browser Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Navigation Toolbar */}
        <div className="flex items-center gap-2 p-3 border-b border-white/5 bg-black/30 backdrop-blur-md">
          <div className="flex items-center gap-1">
            <button
              onClick={handleBack}
              disabled={historyIdx <= 0}
              className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-cyan-400 disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
              title="Go Back"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              onClick={handleForward}
              disabled={historyIdx >= history.length - 1}
              className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-cyan-400 disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
              title="Go Forward"
            >
              <ArrowLeft size={16} className="rotate-180" />
            </button>
            <button
              onClick={handleUp}
              disabled={!currentPath}
              className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-cyan-400 disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
              title="Up Directory"
            >
              <ArrowLeft size={16} className="rotate-90" />
            </button>
            <button
              onClick={handleRefresh}
              className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-cyan-400 transition-colors"
              title="Refresh Directory"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin text-cyan-400' : ''} />
            </button>
          </div>

          {/* Breadcrumbs Path Bar */}
          <div className="flex-1 flex items-center gap-1.5 px-3 py-1.5 bg-black/60 border border-white/5 rounded-xl text-xs font-mono text-slate-300 overflow-hidden min-w-0">
            <button onClick={handleHome} className="shrink-0 text-cyan-400 hover:text-cyan-300 transition-colors">
              <Home size={13} />
            </button>
            {currentPath && (
              <>
                <ChevronRight size={11} className="text-slate-600 shrink-0" />
                {getBreadcrumbs().map((crumb, i) => (
                  <React.Fragment key={i}>
                    <button
                      onClick={() => loadDirectory(crumb.path)}
                      className="text-cyan-400/80 hover:text-cyan-300 truncate transition-colors max-w-[150px]"
                    >
                      {crumb.label}
                    </button>
                    {i < getBreadcrumbs().length - 1 && (
                      <ChevronRight size={11} className="text-slate-600 shrink-0" />
                    )}
                  </React.Fragment>
                ))}
              </>
            )}
          </div>

          {/* Search Filtering and Layout Controls */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search folder..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-40 py-1.5 pl-8 pr-3 text-xs bg-black/60 border border-white/5 rounded-xl focus:outline-none focus:border-cyan-400/50 text-white font-mono"
              />
            </div>
            <div className="flex border border-white/5 rounded-xl overflow-hidden bg-black/40 p-0.5 shrink-0">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white/10 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <LayoutGrid size={13} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white/10 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <List size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Content Viewer Panel */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs text-red-400">
              <AlertTriangle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-xs text-slate-500">
              <RefreshCw size={24} className="animate-spin text-cyan-400" />
              <span>Reading folder data...</span>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-xs text-slate-500">
              <span>This folder is empty.</span>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredFiles.map((file) => (
                <div
                  key={file.path}
                  onDoubleClick={() => file.type === 'directory' ? loadDirectory(file.path) : null}
                  className="group flex flex-col items-center p-3 rounded-2xl bg-black/10 hover:bg-white/[0.04] border border-transparent hover:border-white/5 cursor-pointer text-center transition-all duration-200"
                >
                  <IconRenderer item={file} />
                  <span className="text-xs font-semibold text-slate-300 mt-2.5 truncate max-w-full group-hover:text-white transition-colors" title={file.name}>
                    {file.name}
                  </span>
                  {file.type === 'file' && (
                    <span className="text-[9px] font-mono text-slate-500 mt-0.5">
                      {formatBytes(file.size)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-white/5 rounded-2xl overflow-hidden bg-black/10">
              <div className="grid grid-cols-12 p-3 text-[10px] font-bold text-slate-500 border-b border-white/5 bg-white/[0.01]">
                <div className="col-span-6">Name</div>
                <div className="col-span-3">Modified</div>
                <div className="col-span-3 text-right">Size</div>
              </div>
              <div className="divide-y divide-white/5">
                {filteredFiles.map((file) => (
                  <div
                    key={file.path}
                    onDoubleClick={() => file.type === 'directory' ? loadDirectory(file.path) : null}
                    className="grid grid-cols-12 items-center p-3 text-xs hover:bg-white/[0.03] cursor-pointer transition-colors"
                  >
                    <div className="col-span-6 flex items-center gap-3 min-w-0">
                      <div className="shrink-0 scale-75">
                        <IconRenderer item={file} />
                      </div>
                      <span className="font-semibold text-slate-300 truncate" title={file.name}>
                        {file.name}
                      </span>
                    </div>
                    <div className="col-span-3 text-[10px] font-mono text-slate-500">
                      {new Date(file.modified).toLocaleString()}
                    </div>
                    <div className="col-span-3 text-right font-mono text-slate-400">
                      {file.type === 'file' ? formatBytes(file.size) : '--'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default FileExplorer
