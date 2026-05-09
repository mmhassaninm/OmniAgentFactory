import React, { useState, useEffect } from 'react'
import { Menu, Settings, Clock, Globe } from 'lucide-react'
import { useLang } from '../../i18n/LanguageContext'

export interface OpenWindow {
  id: string
  title: string
  icon: string
  isMinimized: boolean
}

interface TaskbarProps {
  onStartClick: () => void
  onAppClick: (appId: string) => void
  windows: OpenWindow[]
  activeWindowId?: string
}

export const Taskbar: React.FC<TaskbarProps> = ({
  onStartClick,
  onAppClick,
  windows,
  activeWindowId,
}) => {
  const [time, setTime] = useState(new Date())
  const { t, isRTL, lang, setLang } = useLang()

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTime = () => {
    return time.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  }

  const toggleLanguage = () => {
    setLang(lang === 'en' ? 'ar' : 'en')
  }

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 h-12 flex items-center justify-between px-3 z-[80] glass border-t border-white/10 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] select-none ${
        isRTL ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {/* Start Button */}
      <button
        onClick={onStartClick}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-white hover:text-cyan-400 transition-all active:scale-95 shrink-0 group"
        title={t('nav.factory')}
      >
        <Menu size={15} className="group-hover:rotate-90 transition-transform duration-300" />
        <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">
          {lang === 'ar' ? 'البدء' : 'Start'}
        </span>
      </button>

      {/* Quick Launch Icons */}
      <div className={`flex items-center gap-1.5 px-2 ${isRTL ? 'border-r border-white/5 mr-2' : 'border-l border-white/5 ml-2'}`}>
        <QuickLaunchButton
          icon="🏭"
          label="Factory"
          isActive={activeWindowId?.startsWith('route_/') && activeWindowId.length === 8} // exact route_/
          onClick={() => onAppClick('route_/')}
        />
        <QuickLaunchButton
          icon="🔑"
          label="Vault"
          isActive={activeWindowId?.includes('/vault')}
          onClick={() => onAppClick('route_/vault')}
        />
        <QuickLaunchButton
          icon="🌐"
          label="Hub"
          isActive={activeWindowId?.includes('/hub')}
          onClick={() => onAppClick('route_/hub')}
        />
      </div>

      {/* Open Program Tabs */}
      <div className={`flex-1 flex items-center gap-1.5 overflow-x-auto px-2 custom-scrollbar ${isRTL ? 'border-r border-white/5 mr-2' : 'border-l border-white/5 ml-2'}`}>
        {windows.map((win) => {
          const isActive = activeWindowId === win.id
          return (
            <button
              key={win.id}
              onClick={() => onAppClick(win.id)}
              className={`px-3 py-1.5 rounded-xl text-xs whitespace-nowrap truncate max-w-[140px] transition-all flex items-center gap-2 border ${
                isActive
                  ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-400 font-bold glow-primary scale-[0.98]'
                  : 'bg-black/30 hover:bg-white/5 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              <span className="text-sm shrink-0">{win.icon}</span>
              <span className="truncate">{win.title}</span>
              {win.isMinimized && <span className="text-[9px] text-slate-500 shrink-0 uppercase">min</span>}
            </button>
          )
        })}
      </div>

      {/* System Tray (Clock, Settings, Language Switch) */}
      <div className={`flex items-center gap-2.5 shrink-0 ${isRTL ? 'border-r border-white/5 mr-2' : 'border-l border-white/5 ml-2'}`}>
        {/* Language switch button */}
        <button
          onClick={toggleLanguage}
          className="p-1.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:text-cyan-400 text-slate-400 transition-all flex items-center gap-1 text-[10px] font-bold"
          title={t('nav.language')}
        >
          <Globe size={13} />
          <span className="uppercase">{lang}</span>
        </button>

        {/* Settings button */}
        <button
          onClick={() => onAppClick('route_/settings')}
          className="p-1.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:text-cyan-400 text-slate-400 transition-all"
          title={t('nav.settings')}
        >
          <Settings size={13} />
        </button>

        {/* Digital Localized Clock */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 border border-white/5 text-xs font-semibold font-mono text-cyan-400/90 shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]">
          <Clock size={12} className="text-cyan-500 animate-pulse" />
          <span>{formatTime()}</span>
        </div>
      </div>
    </div>
  )
}

interface QuickLaunchButtonProps {
  icon: string
  label: string
  isActive: boolean
  onClick: () => void
}

const QuickLaunchButton: React.FC<QuickLaunchButtonProps> = ({
  icon,
  label,
  isActive,
  onClick,
}) => (
  <button
    onClick={onClick}
    className={`text-base p-1.5 rounded-xl hover:bg-white/5 hover:scale-105 transition-all border shrink-0 ${
      isActive ? 'bg-cyan-500/10 border-cyan-400/30' : 'bg-transparent border-transparent'
    }`}
    title={label}
  >
    {icon}
  </button>
)
