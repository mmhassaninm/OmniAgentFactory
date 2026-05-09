import React, { useState } from 'react'
import { ZoomIn, ZoomOut, RotateCw, X, Maximize2 } from 'lucide-react'

interface ImageViewerProps {
  src: string
  name: string
  onClose: () => void
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ src, name, onClose }) => {
  const [zoom, setZoom] = useState<number>(1)
  const [rotation, setRotation] = useState<number>(0)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const handleZoomIn = () => setZoom(prev => Math.min(3, prev + 0.25))
  const handleZoomOut = () => setZoom(prev => Math.max(0.5, prev - 0.25))
  const handleRotate = () => setRotation(prev => (prev + 90) % 360)
  const handleReset = () => {
    setZoom(1)
    setRotation(0)
    setPosition({ x: 0, y: 0 })
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = () => setIsDragging(false)

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-md select-none animate-slide-up"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Lightbox Header Bar */}
      <div className="flex items-center justify-between p-4 border-b border-white/5 bg-black/40">
        <div className="flex flex-col">
          <span className="text-xs text-slate-500 uppercase tracking-widest font-black">Image Preview</span>
          <span className="text-sm text-slate-200 font-semibold truncate max-w-xs md:max-w-md font-mono">{name}</span>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomIn}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 hover:text-cyan-400 text-slate-300 transition-all"
            title="Zoom In"
          >
            <ZoomIn size={15} />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 hover:text-cyan-400 text-slate-300 transition-all"
            title="Zoom Out"
          >
            <ZoomOut size={15} />
          </button>
          <button
            onClick={handleRotate}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 hover:text-cyan-400 text-slate-300 transition-all"
            title="Rotate 90°"
          >
            <RotateCw size={15} />
          </button>
          <button
            onClick={handleReset}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 hover:text-cyan-400 transition-all"
            title="Reset Transformations"
          >
            Reset
          </button>
          <div className="w-[1px] h-6 bg-white/5 mx-1" />
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-slate-300 hover:text-red-400 transition-all"
            title="Close Lightbox"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Main Image Viewing Area */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing relative"
        onMouseDown={handleMouseDown}
      >
        <div
          className="transition-transform duration-100 ease-out select-none pointer-events-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
          }}
        >
          <img
            src={src}
            alt={name}
            className="max-w-[85vw] max-h-[75vh] object-contain rounded-lg shadow-2xl border border-white/5 select-none"
            draggable="false"
          />
        </div>
      </div>
    </div>
  )
}

export default ImageViewer
