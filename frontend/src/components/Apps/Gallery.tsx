import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, X, Play } from 'lucide-react'

interface GalleryImage {
  path: string
  name: string
  thumbnail: string
  date: string
  agent?: string
}

const Gallery: React.FC = () => {
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null)
  const [isSlideshow, setIsSlideshow] = useState(false)
  const [filter, setFilter] = useState<'all' | 'agent' | 'screenshot'>('all')

  const { data: images = [] } = useQuery<GalleryImage[]>({
    queryKey: ['gallery'],
    queryFn: () =>
      fetch('/api/media/gallery')
        .then(r => r.json())
        .catch(() => []),
  })

  const filteredImages =
    filter === 'all'
      ? images
      : images.filter(img =>
          filter === 'agent' ? img.agent : !img.agent
        )

  const currentIndex = selectedImage
    ? filteredImages.findIndex(img => img.path === selectedImage.path)
    : -1

  const handleNext = () => {
    if (currentIndex < filteredImages.length - 1) {
      setSelectedImage(filteredImages[currentIndex + 1])
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setSelectedImage(filteredImages[currentIndex - 1])
    }
  }

  return (
    <div className="w-full h-full flex flex-col bg-white">
      {/* Toolbar */}
      <div className="border-b border-gray-200 p-3 flex items-center gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded text-sm ${
            filter === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-100'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('agent')}
          className={`px-3 py-1 rounded text-sm ${
            filter === 'agent' ? 'bg-blue-500 text-white' : 'bg-gray-100'
          }`}
        >
          Agent
        </button>
        <button
          onClick={() => setFilter('screenshot')}
          className={`px-3 py-1 rounded text-sm ${
            filter === 'screenshot' ? 'bg-blue-500 text-white' : 'bg-gray-100'
          }`}
        >
          Screenshot
        </button>
        <div className="flex-1" />
        {selectedImage && (
          <button
            onClick={() => setIsSlideshow(!isSlideshow)}
            className="px-3 py-1 rounded text-sm bg-green-500 text-white flex items-center gap-1 hover:bg-green-600"
          >
            <Play size={16} /> Slideshow
          </button>
        )}
      </div>

      {/* Gallery Grid */}
      <div className="flex-1 overflow-auto p-4">
        {filteredImages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No images found</div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-2 md:grid-cols-4">
            {filteredImages.map(img => (
              <img
                key={img.path}
                src={img.thumbnail}
                alt={img.name}
                onClick={() => setSelectedImage(img)}
                className="w-full h-32 object-cover rounded cursor-pointer hover:opacity-75 transition border-2 border-transparent hover:border-blue-400"
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
          onClick={() => {
            if (!isSlideshow) setSelectedImage(null)
          }}
        >
          <div
            className="relative max-w-4xl max-h-screen flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={selectedImage.path}
              alt={selectedImage.name}
              className="max-w-full max-h-[70vh] object-contain"
            />

            <div className="bg-gray-900 text-white p-3 flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm">{selectedImage.name}</div>
                <div className="text-xs text-gray-400">{selectedImage.date}</div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrev}
                  className="hover:bg-gray-700 p-1 rounded"
                >
                  <ChevronLeft size={20} />
                </button>
                <span className="text-xs">
                  {currentIndex + 1} / {filteredImages.length}
                </span>
                <button
                  onClick={handleNext}
                  className="hover:bg-gray-700 p-1 rounded"
                >
                  <ChevronRight size={20} />
                </button>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="hover:bg-gray-700 p-1 rounded ml-2"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Gallery
