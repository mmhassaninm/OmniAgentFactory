import React, { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  List,
  X,
} from 'lucide-react'

interface MediaFile {
  path: string
  name: string
  duration: number
  type: string
}

const MediaPlayer: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(1)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showPlaylist, setShowPlaylist] = useState(false)

  const { data: playlist = [] } = useQuery<MediaFile[]>({
    queryKey: ['media/playlist'],
    queryFn: () =>
      fetch('/api/media/playlist')
        .then(r => r.json())
        .catch(() => []),
  })

  const currentTrack = playlist[currentIndex]

  useEffect(() => {
    if (isPlaying && audioRef.current) {
      audioRef.current.play()
    } else if (audioRef.current) {
      audioRef.current.pause()
    }
  }, [isPlaying, currentTrack])

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying)
  }

  const handleNext = () => {
    if (currentIndex < playlist.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setCurrentTime(0)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setCurrentTime(0)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="w-full h-full flex bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      {/* Main Player */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {currentTrack ? (
          <>
            {/* Album Art Placeholder */}
            <div className="w-48 h-48 bg-gray-700 rounded-lg mb-6 flex items-center justify-center text-6xl shadow-lg">
              🎵
            </div>

            {/* Track Info */}
            <h2 className="text-2xl font-bold mb-2">{currentTrack.name}</h2>
            <p className="text-gray-400 mb-6">
              {formatTime(currentTrack.duration)}
            </p>

            {/* Progress Bar */}
            <div className="w-full max-w-xs mb-4">
              <input
                type="range"
                min="0"
                max={currentTrack.duration || 100}
                value={currentTime}
                onChange={e => setCurrentTime(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(currentTrack.duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-6 mb-6">
              <button
                onClick={handlePrev}
                className="hover:text-blue-400 transition"
              >
                <SkipBack size={24} />
              </button>
              <button
                onClick={handlePlayPause}
                className="bg-blue-600 hover:bg-blue-700 p-3 rounded-full transition"
              >
                {isPlaying ? <Pause size={32} /> : <Play size={32} />}
              </button>
              <button
                onClick={handleNext}
                className="hover:text-blue-400 transition"
              >
                <SkipForward size={24} />
              </button>
            </div>

            {/* Volume Control */}
            <div className="flex items-center gap-2 w-full max-w-xs">
              <Volume2 size={20} />
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-gray-700 rounded cursor-pointer"
              />
              <span className="text-xs w-8 text-right">
                {Math.round(volume * 100)}%
              </span>
            </div>
          </>
        ) : (
          <div className="text-center">
            <p className="text-xl text-gray-400">No media files loaded</p>
          </div>
        )}

        <audio ref={audioRef} src={currentTrack?.path} />
      </div>

      {/* Playlist Sidebar */}
      <div
        className={`
          bg-gray-900 border-l border-gray-700 transition-all
          ${showPlaylist ? 'w-64' : 'w-0 overflow-hidden'}
        `}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2">
              <List size={20} /> Playlist
            </h3>
            <button onClick={() => setShowPlaylist(false)}>
              <X size={20} />
            </button>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {playlist.map((track, idx) => (
              <button
                key={track.path}
                onClick={() => {
                  setCurrentIndex(idx)
                  setCurrentTime(0)
                  setIsPlaying(true)
                }}
                className={`
                  w-full text-left p-2 rounded truncate text-sm transition
                  ${
                    idx === currentIndex
                      ? 'bg-blue-600 font-semibold'
                      : 'hover:bg-gray-800'
                  }
                `}
              >
                {track.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Playlist Toggle */}
      <button
        onClick={() => setShowPlaylist(!showPlaylist)}
        className="absolute bottom-4 right-4 bg-blue-600 hover:bg-blue-700 p-3 rounded-full"
      >
        <List size={24} />
      </button>
    </div>
  )
}

export default MediaPlayer
