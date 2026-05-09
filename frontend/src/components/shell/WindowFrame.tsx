import React, { useState, useRef, useEffect } from 'react'
import { X, Minus, Square } from 'lucide-react'

export interface WindowFrameProps {
  title: string
  icon: string
  children: React.ReactNode
  onClose: () => void
  onMinimize: () => void
  defaultWidth?: number
  defaultHeight?: number
  defaultX?: number
  defaultY?: number
  isActive?: boolean
  onFocus?: () => void
}

export const WindowFrame: React.FC<WindowFrameProps> = ({
  title,
  icon,
  children,
  onClose,
  onMinimize,
  defaultWidth = 800,
  defaultHeight = 600,
  defaultX = 120,
  defaultY = 80,
  isActive = true,
  onFocus,
}) => {
  const [position, setPosition] = useState({ x: defaultX, y: defaultY })
  const [size, setSize] = useState({ width: defaultWidth, height: defaultHeight })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const frameRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    setIsDragging(true)
    if (onFocus) onFocus()
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    })
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      // Keep inside bounds roughly
      const nextX = Math.max(10, Math.min(window.innerWidth - 100, e.clientX - dragStart.x))
      const nextY = Math.max(10, Math.min(window.innerHeight - 80, e.clientY - dragStart.y))
      setPosition({ x: nextX, y: nextY })
    } else if (isResizing && frameRef.current) {
      const rect = frameRef.current.getBoundingClientRect()
      setSize({
        width: Math.max(320, e.clientX - rect.left),
        height: Math.max(240, e.clientY - rect.top),
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setIsResizing(false)
  }

  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, isResizing, dragStart])

  return (
    <div
      ref={frameRef}
      className={`fixed flex flex-col rounded-xl overflow-hidden glass-strong transition-all duration-300 ease-out animate-slide-up ${
        isActive ? 'glow-primary border-accent/40 z-50' : 'border-white/5 opacity-90 z-40'
      }`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        userSelect: isDragging ? 'none' : 'auto',
      }}
      onMouseDown={onFocus}
    >
      {/* Title Bar */}
      <div
        className={`px-4 py-2.5 flex items-center justify-between border-b select-none cursor-move ${
          isActive ? 'bg-black/80 border-white/10' : 'bg-black/95 border-white/5'
        }`}
        onMouseDown={handleMouseDown}
        data-no-drag="false"
      >
        <div className="flex items-center gap-2" data-no-drag="true">
          <span className="text-base select-none">{icon}</span>
          <h3 className="font-semibold text-xs tracking-wider uppercase text-white truncate max-w-[200px] sm:max-w-xs">{title}</h3>
        </div>
        <div className="flex items-center gap-1.5" data-no-drag="true">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMinimize()
            }}
            className="text-white/40 hover:text-white hover:bg-white/10 p-1 rounded-lg transition-colors"
            title="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="text-white/40 hover:text-red-400 hover:bg-red-500/20 p-1 rounded-lg transition-colors"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto bg-black/50 text-white select-text relative">
        {children}
      </div>

      {/* Resize Handle */}
      <div
        className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-se-resize select-none bg-white/5 hover:bg-accent-primary/50 transition-colors rounded-tl border-r border-b border-white/10"
        onMouseDown={(e) => {
          e.stopPropagation()
          setIsResizing(true)
        }}
      />
    </div>
  )
}

