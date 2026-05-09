import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { WindowFrame } from './WindowFrame'
import { Taskbar, OpenWindow } from './Taskbar'
import { FileExplorer } from '../../apps/FileExplorer'
import { Gallery } from '../../apps/Gallery'
import { MediaPlayer } from '../../apps/MediaPlayer'
import { Terminal } from '../../apps/Terminal'
import { Search, Monitor, LogOut, Shield, Layout, Settings as SettingsIcon } from 'lucide-react'

// Lightweight type for in-desktop local windows
type LocalWindow = {
  id: string
  title: string
  icon: string
  isMinimized: boolean
  content: React.ReactNode
}

// Gorgeous wallpaper presets (Neural Dark system theme)
const WALLPAPERS: string[] = [
  'linear-gradient(135deg, #04060a 0%, #0c0f17 50%, #15102a 100%)', // Neural Neon Deep
  'linear-gradient(135deg, #07090e 0%, #111827 40%, #030508 100%)', // Sleek Graphite
  'linear-gradient(135deg, #080314 0%, #140c2d 50%, #05020a 100%)', // Violet Cyberpunk
]

// App descriptors
const DESKTOP_APPS = [
  { id: 'factory', label: 'Agent Factory', icon: '🏭' },
  { id: 'vault', label: 'Key Vault', icon: '🔑' },
  { id: 'hub', label: 'Model Hub', icon: '🌐' },
  { id: 'files', label: 'Workspace Files', icon: '📁' },
  { id: 'gallery', label: 'Cortex Gallery', icon: '🖼️' },
  { id: 'player', label: 'Media Player', icon: '🎵' },
  { id: 'terminal', label: 'Subshell CLI', icon: '💻' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

// Mappings from router pathnames to Window configurations
const ROUTE_INFO: Record<string, { title: string; icon: string; w: number; h: number }> = {
  '/': { title: 'Agent Factory Control Hub', icon: '🏭', w: 1000, h: 680 },
  '/settings': { title: 'System Settings Console', icon: '⚙️', w: 850, h: 600 },
  '/settings/keys': { title: 'Secure Key Vault API', icon: '🔑', w: 900, h: 550 },
  '/vault': { title: 'Secure Key Vault API', icon: '🔑', w: 900, h: 550 },
  '/hub': { title: 'Model Hub Neural Intelligence', icon: '🌐', w: 1050, h: 720 },
}

const getRouteInfo = (pathname: string) => {
  if (ROUTE_INFO[pathname]) return ROUTE_INFO[pathname]
  if (pathname.startsWith('/agent/')) {
    if (pathname.endsWith('/chat')) {
      return { title: 'Agent Conversation Console', icon: '💬', w: 920, h: 650 }
    }
    if (pathname.endsWith('/preview')) {
      return { title: 'Live Thought Visualizer', icon: '👁️', w: 920, h: 600 }
    }
    return { title: 'Agent Diagnostics Desk', icon: '🤖', w: 960, h: 700 }
  }
  return null
}

export const Desktop: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const location = useLocation()
  const navigate = useNavigate()

  // Routing window state
  const [routeWindow, setRouteWindow] = useState({
    isMinimized: false,
    isOpen: true,
    isActive: true,
  })

  // Local window state list
  const [localWindows, setLocalWindows] = useState<LocalWindow[]>([])
  const [activeLocalWindowId, setActiveLocalWindowId] = useState<string | null>(null)

  // Wallpaper and UI components overlay state
  const [wallpaperIdx, setWallpaperIdx] = useState<number>(0)
  const [launcherOpen, setLauncherOpen] = useState<boolean>(false)
  const [launcherQuery, setLauncherQuery] = useState<string>('')
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null)

  // Sync state whenever the standard router pathname changes
  useEffect(() => {
    const info = getRouteInfo(location.pathname)
    if (info) {
      setRouteWindow({
        isOpen: true,
        isMinimized: false,
        isActive: true,
      })
      setActiveLocalWindowId(null)
    }
  }, [location.pathname])

  // Aggregate current windows for Taskbar rendering
  const taskbarWindows: OpenWindow[] = useMemo(() => {
    const list: OpenWindow[] = []

    // Add route window if open
    const info = getRouteInfo(location.pathname)
    if (info && routeWindow.isOpen) {
      list.push({
        id: `route_${location.pathname}`,
        title: info.title,
        icon: info.icon,
        isMinimized: routeWindow.isMinimized,
      })
    }

    // Add currently active local windows
    localWindows.forEach((w) => {
      list.push({
        id: w.id,
        title: w.title,
        icon: w.icon,
        isMinimized: w.isMinimized,
      })
    })

    return list
  }, [location.pathname, routeWindow, localWindows])

  // Active highlighted window ID
  const activeWindowId = useMemo(() => {
    if (routeWindow.isOpen && !routeWindow.isMinimized && routeWindow.isActive) {
      return `route_${location.pathname}`
    }
    return activeLocalWindowId || undefined
  }, [location.pathname, routeWindow, activeLocalWindowId])

  // Native app click handlers
  const handleAppClick = (appId: string) => {
    // 1. Router based apps
    if (appId.startsWith('route_')) {
      const routePath = appId.substring(6)
      if (location.pathname === routePath) {
        if (routeWindow.isMinimized) {
          setRouteWindow({ isOpen: true, isMinimized: false, isActive: true })
          setActiveLocalWindowId(null)
        } else if (routeWindow.isActive) {
          setRouteWindow((prev) => ({ ...prev, isMinimized: true, isActive: false }))
        } else {
          setRouteWindow((prev) => ({ ...prev, isActive: true }))
          setActiveLocalWindowId(null)
        }
      } else {
        navigate(routePath)
        setRouteWindow({ isOpen: true, isMinimized: false, isActive: true })
        setActiveLocalWindowId(null)
      }
      return
    }

    // 2. Local state-based apps
    const win = localWindows.find((w) => w.id === appId)
    if (!win) return

    if (win.isMinimized) {
      setLocalWindows((ws) => ws.map((w) => (w.id === appId ? { ...w, isMinimized: false } : w)))
      setActiveLocalWindowId(appId)
      setRouteWindow((prev) => ({ ...prev, isActive: false }))
    } else if (activeLocalWindowId === appId && !routeWindow.isActive) {
      setLocalWindows((ws) => ws.map((w) => (w.id === appId ? { ...w, isMinimized: true } : w)))
    } else {
      setActiveLocalWindowId(appId)
      setRouteWindow((prev) => ({ ...prev, isActive: false }))
    }
  }

  // Open a program inside a beautiful Frame
  const openLocalApp = (appId: string) => {
    setLauncherOpen(false)

    // Route-based applications mapping
    if (['factory', 'vault', 'hub', 'settings'].includes(appId)) {
      const pathMap: Record<string, string> = {
        factory: '/',
        vault: '/vault',
        hub: '/hub',
        settings: '/settings',
      }
      navigate(pathMap[appId])
      setRouteWindow({ isOpen: true, isMinimized: false, isActive: true })
      setActiveLocalWindowId(null)
      return
    }

    // Bring to front if already active
    const existing = localWindows.find((w) => w.id === appId)
    if (existing) {
      setLocalWindows((ws) => ws.map((w) => (w.id === appId ? { ...w, isMinimized: false } : w)))
      setActiveLocalWindowId(appId)
      setRouteWindow((prev) => ({ ...prev, isActive: false }))
      return
    }

    // Load corresponding components
    let content: React.ReactNode = null
    let title = ''
    let icon = ''
    let w = 850
    let h = 600

    if (appId === 'files') {
      content = <FileExplorer />
      title = 'Workspace Explorer'
      icon = '📁'
      w = 950
      h = 640
    } else if (appId === 'gallery') {
      content = <Gallery />
      title = 'Cortex Gallery'
      icon = '🖼️'
      w = 1000
      h = 680
    } else if (appId === 'player') {
      content = <MediaPlayer />
      title = 'Holographic Player'
      icon = '🎵'
      w = 800
      h = 550
    } else if (appId === 'terminal') {
      content = <Terminal />
      title = 'Secure Subshell'
      icon = '💻'
      w = 850
      h = 500
    }

    if (content) {
      const newWin: LocalWindow = {
        id: appId,
        title,
        icon,
        isMinimized: false,
        content,
      }
      setLocalWindows((prev) => [...prev, newWin])
      setActiveLocalWindowId(appId)
      setRouteWindow((prev) => ({ ...prev, isActive: false }))
    }
  }

  // Right-click context menu triggers
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextPos({ x: e.clientX, y: e.clientY })
  }

  const cycleWallpaper = () => {
    setWallpaperIdx((prev) => (prev + 1) % WALLPAPERS.length)
    setContextPos(null)
  }

  // Start Menu Search filter
  const filteredApps = DESKTOP_APPS.filter((app) =>
    app.label.toLowerCase().includes(launcherQuery.toLowerCase())
  )

  const info = getRouteInfo(location.pathname)

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-cover bg-center select-none"
      style={{ backgroundImage: WALLPAPERS[wallpaperIdx] }}
      onContextMenu={handleContextMenu}
      onClick={() => setContextPos(null)}
    >
      {/* Desktop App Icons Grid (Left sidebar style) */}
      <div className="absolute left-6 top-6 bottom-20 flex flex-col flex-wrap gap-6 items-center p-3 rounded-2xl bg-black/10 backdrop-blur-[2px] border border-white/[0.02]">
        {DESKTOP_APPS.map((app) => (
          <div
            key={app.id}
            onDoubleClick={() => openLocalApp(app.id)}
            className="group flex flex-col items-center justify-center w-16 h-16 rounded-xl hover:bg-white/5 cursor-pointer transition-all duration-200"
            title={app.label}
          >
            <div className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-xl transition-transform duration-300 group-hover:scale-105 group-hover:border-cyan-400/30">
              {app.icon}
            </div>
            <span className="text-[10px] font-semibold text-slate-300 mt-1 truncate max-w-full group-hover:text-white transition-colors">
              {app.label}
            </span>
          </div>
        ))}
      </div>

      {/* Render 1. Route-based children inside its coordinates */}
      {info && routeWindow.isOpen && !routeWindow.isMinimized && (
        <WindowFrame
          title={info.title}
          icon={info.icon}
          defaultWidth={info.w}
          defaultHeight={info.h}
          isActive={routeWindow.isActive}
          onFocus={() => {
            setRouteWindow((prev) => ({ ...prev, isActive: true }))
            setActiveLocalWindowId(null)
          }}
          onClose={() => setRouteWindow((prev) => ({ ...prev, isOpen: false }))}
          onMinimize={() => setRouteWindow((prev) => ({ ...prev, isMinimized: true }))}
        >
          {children}
        </WindowFrame>
      )}

      {/* Render 2. Local-state based application frames */}
      {localWindows.map((win) => {
        if (win.isMinimized) return null
        return (
          <WindowFrame
            key={win.id}
            title={win.title}
            icon={win.icon}
            defaultWidth={win.id === 'files' ? 950 : win.id === 'gallery' ? 1000 : 850}
            defaultHeight={win.id === 'files' ? 640 : win.id === 'gallery' ? 680 : 550}
            isActive={activeLocalWindowId === win.id && !routeWindow.isActive}
            onFocus={() => {
              setActiveLocalWindowId(win.id)
              setRouteWindow((prev) => ({ ...prev, isActive: false }))
            }}
            onClose={() => {
              setLocalWindows((ws) => ws.filter((w) => w.id !== win.id))
              if (activeLocalWindowId === win.id) {
                setActiveLocalWindowId(null)
              }
            }}
            onMinimize={() => {
              setLocalWindows((ws) =>
                ws.map((w) => (w.id === win.id ? { ...w, isMinimized: true } : w))
              )
              if (activeLocalWindowId === win.id) {
                setActiveLocalWindowId(null)
              }
            }}
          >
            {win.content}
          </WindowFrame>
        )
      })}

      {/* Right-Click Desktop Context Menu */}
      {contextPos && (
        <div
          className="fixed z-[100] w-48 py-1 rounded-xl bg-[#090d16]/95 border border-white/10 backdrop-blur-md shadow-2xl animate-slide-up"
          style={{ left: contextPos.x, top: contextPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={cycleWallpaper}
            className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-white/5 text-slate-300 hover:text-cyan-400 transition-colors flex items-center gap-2"
          >
            <Monitor size={13} />
            <span>Cycle Wallpaper</span>
          </button>
          <button
            onClick={() => {
              setContextPos(null)
              setLauncherOpen(true)
            }}
            className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-white/5 text-slate-300 hover:text-cyan-400 transition-colors flex items-center gap-2"
          >
            <Layout size={13} />
            <span>App Launcher</span>
          </button>
          <div className="h-[1px] bg-white/5 my-1" />
          <button
            onClick={() => setContextPos(null)}
            className="w-full text-left px-4 py-2 text-xs font-bold text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
          >
            <LogOut size={13} />
            <span>Cancel</span>
          </button>
        </div>
      )}

      {/* Start Menu App Launcher Overlay */}
      {launcherOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setLauncherOpen(false)}
        >
          <div
            className="w-[500px] h-[380px] rounded-2xl bg-[#090d16]/95 border border-white/10 backdrop-blur-xl p-6 shadow-2xl flex flex-col justify-between animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header / Search Row */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-cyan-400" />
                  <span className="text-xs uppercase tracking-widest font-black text-slate-400">Applications Desk</span>
                </div>
                <button
                  onClick={() => setLauncherOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-200 transition-all text-xs font-bold"
                >
                  Esc
                </button>
              </div>

              {/* Launcher Search Bar */}
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Query system files..."
                  value={launcherQuery}
                  onChange={(e) => setLauncherQuery(e.target.value)}
                  className="w-full py-2 pl-9 pr-4 text-xs bg-black/60 border border-white/10 rounded-xl focus:outline-none focus:border-cyan-400 text-white font-mono"
                  autoFocus
                />
              </div>
            </div>

            {/* Application List Grid */}
            <div className="flex-1 overflow-y-auto py-4 grid grid-cols-4 gap-3 custom-scrollbar">
              {filteredApps.map((app) => (
                <button
                  key={app.id}
                  onClick={() => openLocalApp(app.id)}
                  className="flex flex-col items-center justify-center p-2 hover:bg-white/5 rounded-xl border border-transparent hover:border-white/5 transition-all group"
                >
                  <div className="text-2xl group-hover:scale-105 transition-transform">{app.icon}</div>
                  <span className="text-[10px] font-bold text-slate-400 mt-2 truncate max-w-full text-center group-hover:text-white transition-colors">
                    {app.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Footer Settings Link */}
            <div className="border-t border-white/5 pt-3.5 flex justify-between items-center text-[10px] text-slate-500">
              <span>OmniBot Autonomous Console OS</span>
              <button
                onClick={() => openLocalApp('settings')}
                className="flex items-center gap-1 hover:text-cyan-400 transition-colors font-bold"
              >
                <SettingsIcon size={12} />
                <span>Settings</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Taskbar Component */}
      <Taskbar
        onStartClick={() => setLauncherOpen((prev) => !prev)}
        onAppClick={handleAppClick}
        windows={taskbarWindows}
        activeWindowId={activeWindowId}
      />
    </div>
  )
}

export default Desktop