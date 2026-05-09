import React, { useState, useEffect } from 'react'
import { ImageIcon, Search, RefreshCw, Calendar, Tag, User, AlertCircle } from 'lucide-react'
import { ImageViewer } from './ImageViewer'

interface GalleryItem {
  path: string
  name: string
  thumbnail: string
  date: string
  agent: string | null
}

export const Gallery: React.FC = () => {
  const [images, setImages] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedAgent, setSelectedAgent] = useState<string>('all')
  const [selectedImage, setSelectedImage] = useState<GalleryItem | null>(null)

  // ── Fetch Screenshots ──────────────────────────────────────────────────
  const fetchGallery = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/media/gallery')
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`)
      }
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error)
      }
      setImages(data || [])
    } catch (err: any) {
      console.error('[Gallery] Fetch error:', err)
      setError(err.message || 'Failed to fetch gallery')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchGallery()
  }, [])

  // List of unique agents represented in the gallery
  const agentsList = ['all', ...Array.from(new Set(images.map(img => img.agent || 'system')))]

  // Filter criteria
  const filteredImages = images.filter(img => {
    const matchesSearch = img.name.toLowerCase().includes(searchQuery.toLowerCase())
    const agentName = img.agent || 'system'
    const matchesAgent = selectedAgent === 'all' || agentName === selectedAgent
    return matchesSearch && matchesAgent
  })

  return (
    <div className="flex flex-col h-full bg-[#070b11] text-white/90 font-sans select-none overflow-hidden">
      {/* Gallery Header Toolset */}
      <div className="flex items-center justify-between p-3 border-b border-white/5 bg-black/30 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <ImageIcon className="text-cyan-400 shrink-0" size={16} />
          <span className="text-xs uppercase font-black tracking-widest text-white/50">Cortex Gallery</span>
          <button
            onClick={fetchGallery}
            className="p-1 rounded-lg hover:bg-white/5 text-slate-400 hover:text-cyan-400 transition-colors"
            title="Refresh Gallery"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Dynamic Tag/Agent Selector & Search */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Filter images..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-40 py-1.5 pl-8 pr-3 text-xs bg-black/60 border border-white/5 rounded-xl focus:outline-none focus:border-cyan-400/50 text-white font-mono"
            />
          </div>

          <div className="flex items-center gap-1 bg-black/40 border border-white/5 p-0.5 rounded-xl">
            {agentsList.map(agent => (
              <button
                key={agent}
                onClick={() => setSelectedAgent(agent)}
                className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-lg transition-all ${
                  selectedAgent === agent
                    ? 'bg-white/10 text-cyan-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {agent}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid Canvas */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs text-red-400 mb-4">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-xs text-slate-500">
            <RefreshCw size={24} className="animate-spin text-cyan-400" />
            <span>Parsing image vault...</span>
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-xs text-slate-500 gap-2">
            <ImageIcon size={32} className="text-slate-700 animate-pulse" />
            <span>No images captured yet.</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredImages.map((img) => (
              <div
                key={img.path}
                onClick={() => setSelectedImage(img)}
                className="group relative flex flex-col p-2 bg-black/30 hover:bg-white/[0.03] border border-white/5 hover:border-cyan-400/30 rounded-2xl cursor-pointer transition-all duration-300 overflow-hidden"
              >
                {/* Thumbnail Layer */}
                <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-black/60 border border-white/5 relative">
                  <img
                    src={img.thumbnail}
                    alt={img.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 select-none"
                    loading="lazy"
                  />
                  {/* Floating Date Badge */}
                  <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md border border-white/5 px-2 py-0.5 rounded-lg text-[8px] font-mono text-slate-400">
                    {new Date(img.date).toLocaleDateString()}
                  </div>
                </div>

                {/* Metadata block */}
                <div className="mt-2.5 min-w-0 px-1">
                  <span className="block text-xs font-semibold text-slate-200 truncate group-hover:text-white transition-colors" title={img.name}>
                    {img.name}
                  </span>
                  <div className="flex items-center gap-3 mt-1.5 text-[9px] text-slate-500 font-mono">
                    <div className="flex items-center gap-1 truncate max-w-[80px]">
                      <Tag size={10} className="shrink-0" />
                      <span className="truncate uppercase font-bold text-cyan-400/80">{img.agent || 'system'}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full screen Lightbox overlay */}
      {selectedImage && (
        <ImageViewer
          src={selectedImage.thumbnail}
          name={selectedImage.name}
          onClose={() => setSelectedImage(null)}
        />
      )}
    </div>
  )
}

export default Gallery
