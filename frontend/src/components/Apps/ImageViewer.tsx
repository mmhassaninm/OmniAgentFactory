import React, { useState } from 'react'
import { ZoomIn, ZoomOut, RotateCw, Maximize, ChevronLeft, ChevronRight } from 'lucide-react'

interface ImageViewerProps {
  src: string
  alt?: string
  onNext?: () => void
  onPrev?: () => void
}

export const ImageViewer: React.FC<ImageViewerProps> = ({
  src,
  alt,
  onNext,
  onPrev,
}) => {
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [isFit, setIsFit] = useState(true)

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 10, 200))
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 10, 50))
  const handleRotate = () => setRotation(prev => (prev + 90) % 360)
  const handleFitScreen = () => setIsFit(!isFit)

  return (
    <div className="w-full h-full flex flex-col bg-gray-900">
      {/* Toolbar */}
      <div className="bg-gray-800 text-white p-3 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-2">
          {onPrev && (
            <button
              onClick={onPrev}
              className="hover:bg-gray-700 p-2 rounded transition"
              title="Previous"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          {onNext && (
            <button
              onClick={onNext}
              className="hover:bg-gray-700 p-2 rounded transition"
              title="Next"
            >
              <ChevronRight size={20} />
            </button>
          )}
        </div>

        <div className="text-sm">{alt}</div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="hover:bg-gray-700 p-2 rounded transition"
            title="Zoom Out"
          >
            <ZoomOut size={20} />
          </button>
          <span className="text-sm w-12 text-center">{zoom}%</span>
          <button
            onClick={handleZoomIn}
            className="hover:bg-gray-700 p-2 rounded transition"
            title="Zoom In"
          >
            <ZoomIn size={20} />
          </button>
          <button
            onClick={handleRotate}
            className="hover:bg-gray-700 p-2 rounded transition"
            title="Rotate"
          >
            <RotateCw size={20} />
          </button>
          <button
            onClick={handleFitScreen}
            className={`p-2 rounded transition ${
              isFit ? 'bg-blue-600' : 'hover:bg-gray-700'
            }`}
            title="Fit to Screen"
          >
            <Maximize size={20} />
          </button>
        </div>
      </div>

      {/* Image Display */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        <img
          src={src}
          alt={alt}
          style={{
            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
            maxWidth: isFit ? '100%' : 'none',
            maxHeight: isFit ? '100%' : 'none',
            objectFit: isFit ? 'contain' : 'auto',
          }}
          className="transition-transform duration-200"
        />
      </div>
    </div>
  )
}

export default ImageViewer
