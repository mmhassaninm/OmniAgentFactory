import React, { useState, useEffect, useRef } from 'react'
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX,
  Music, RefreshCw, AlertCircle, Disc
} from 'lucide-react'

interface Track {
  path: string
  name: string
  duration: number
  type: string
}

export const MediaPlayer: React.FC = () => {
  const [playlist, setPlaylist] = useState<Track[]>([])
  const [currentTrackIdx, setCurrentTrackIdx] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [volume, setVolume] = useState<number>(0.8)
  const [isMuted, setIsMuted] = useState<boolean>(false)
  const [progress, setProgress] = useState<number>(0)
  const [duration, setDuration] = useState<number>(180)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const progressInterval = useRef<number | null>(null)

  // ── Fetch Playlist ──────────────────────────────────────────────────
  const fetchPlaylist = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/media/playlist')
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`)
      }
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error)
      }
      setPlaylist(data || [])
      setCurrentTrackIdx(0)
    } catch (err: any) {
      console.error('[MediaPlayer] Fetch error:', err)
      setError(err.message || 'Failed to fetch playlist')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlaylist()
  }, [])

  // Manage native Audio object
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause()
    }

    if (playlist.length > 0) {
      const activeTrack = playlist[currentTrackIdx]
      audioRef.current = new Audio(activeTrack.path)
      audioRef.current.volume = isMuted ? 0 : volume

      audioRef.current.addEventListener('loadedmetadata', () => {
        setDuration(audioRef.current?.duration || 180)
      })

      audioRef.current.addEventListener('ended', () => {
        handleSkipForward()
      })

      if (isPlaying) {
        audioRef.current.play().catch(err => {
          console.warn('Audio playback failed or was interrupted:', err)
          setIsPlaying(false)
        })
      }
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
    // eslint-disable-next-line
  }, [currentTrackIdx, playlist])

  // Monitor progress
  useEffect(() => {
    if (isPlaying) {
      progressInterval.current = window.setInterval(() => {
        if (audioRef.current) {
          setProgress(audioRef.current.currentTime)
        }
      }, 250)
    } else {
      if (progressInterval.current) {
        clearInterval(progressInterval.current)
      }
    }

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current)
      }
    }
  }, [isPlaying])

  // Sync volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

  const handlePlayPause = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play().catch(err => {
        console.warn('Playback click failed:', err)
      })
      setIsPlaying(true)
    }
  }

  const handleSkipForward = () => {
    if (playlist.length === 0) return
    setCurrentTrackIdx(prev => (prev + 1) % playlist.length)
    setProgress(0)
  }

  const handleSkipBackward = () => {
    if (playlist.length === 0) return
    setCurrentTrackIdx(prev => (prev - 1 + playlist.length) % playlist.length)
    setProgress(0)
  }

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = val
      setProgress(val)
    }
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  const activeTrack = playlist[currentTrackIdx]

  return (
    <div className="flex h-full bg-[#070b11] text-white/90 font-sans select-none overflow-hidden">
      {/* Sidebar: Track List */}
      <div className="w-56 shrink-0 border-r border-white/5 bg-black/40 flex flex-col">
        <div className="p-4 border-b border-white/5 bg-white/[0.01] flex items-center justify-between">
          <span className="text-[10px] uppercase font-black tracking-widest text-white/40">Music Catalog</span>
          <button
            onClick={fetchPlaylist}
            className="p-1 rounded-lg hover:bg-white/5 text-slate-400 hover:text-cyan-400 transition-colors"
            title="Reload Playlist"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Playlists */}
        <div className="flex-1 p-2 space-y-1 overflow-y-auto custom-scrollbar">
          {playlist.map((track, idx) => (
            <button
              key={track.path}
              onClick={() => {
                setCurrentTrackIdx(idx)
                setIsPlaying(true)
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all ${
                idx === currentTrackIdx ? 'bg-cyan-500/10 text-cyan-400' : 'hover:bg-white/5 text-slate-400'
              }`}
            >
              <Music size={13} className={idx === currentTrackIdx ? 'text-cyan-400' : 'text-slate-600'} />
              <span className="truncate flex-1">{track.name}</span>
            </button>
          ))}

          {playlist.length === 0 && !loading && (
            <div className="text-[10px] text-slate-500 p-3 text-center">
              No media tracks loaded. Add audio files to `/backend/media` directory.
            </div>
          )}
        </div>
      </div>

      {/* Main Holographic Deck */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-radial-glow relative overflow-hidden">
        {error && (
          <div className="absolute top-4 left-4 right-4 flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 z-10">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* Spinner Disc */}
        <div className="relative group">
          <div className="absolute inset-0 bg-cyan-400/10 blur-3xl rounded-full scale-75 group-hover:scale-90 transition-transform duration-1000" />
          <div
            className={`w-44 h-44 rounded-full bg-[#0a0f18] border-4 border-slate-800 shadow-[0_0_50px_rgba(0,212,255,0.15)] flex items-center justify-center relative ${
              isPlaying ? 'animate-spin-slow' : ''
            }`}
          >
            {/* Grooves */}
            <div className="absolute inset-2 border border-slate-900/30 rounded-full" />
            <div className="absolute inset-6 border border-slate-900/25 rounded-full" />
            <div className="absolute inset-10 border border-slate-900/20 rounded-full" />
            <div className="absolute inset-14 border border-slate-900/15 rounded-full" />

            <Disc size={64} className="text-cyan-400/80 fill-cyan-400/10" />

            {/* Center Pin */}
            <div className="absolute w-6 h-6 bg-slate-900 rounded-full border-2 border-slate-800 flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
            </div>
          </div>
        </div>

        {/* Track Metadata */}
        <div className="text-center mt-6 w-full max-w-sm">
          <h2 className="text-base font-bold text-white truncate px-4">{activeTrack ? activeTrack.name : 'No track loaded'}</h2>
          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mt-1 block">
            {activeTrack ? 'Holographic Audio Node' : 'Idle System Engine'}
          </span>
        </div>

        {/* Simulated Waveform Visualizer */}
        <div className="flex items-center gap-[3px] h-12 mt-6 select-none">
          {Array.from({ length: 24 }).map((_, i) => {
            // Semi-random height factors to simulate bouncing frequencies
            const bounceDelay = i * 0.1
            const randomHeight = Math.floor(Math.sin(i * 0.4) * 16) + 24
            return (
              <div
                key={i}
                className="w-[3px] bg-gradient-to-t from-cyan-400 to-purple-500 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(0,212,255,0.4)]"
                style={{
                  height: isPlaying ? `${randomHeight}px` : '4px',
                  opacity: isPlaying ? 0.8 : 0.2,
                  animation: isPlaying ? `pulse-glow 1.2s ease-in-out infinite` : 'none',
                  animationDelay: `${bounceDelay}s`
                }}
              />
            )
          })}
        </div>

        {/* Progress Slider */}
        <div className="w-full max-w-sm flex items-center gap-3 mt-6">
          <span className="text-[10px] font-mono text-slate-500 shrink-0 w-8 text-right">{formatTime(progress)}</span>
          <input
            type="range"
            min={0}
            max={duration}
            value={progress}
            onChange={handleProgressChange}
            className="flex-1 h-1 bg-white/5 accent-cyan-400 rounded-lg cursor-pointer focus:outline-none focus:ring-0"
          />
          <span className="text-[10px] font-mono text-slate-500 shrink-0 w-8">{formatTime(duration)}</span>
        </div>

        {/* Control Interface Deck */}
        <div className="flex items-center gap-6 mt-6">
          <button
            onClick={handleSkipBackward}
            className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 hover:text-cyan-400 text-slate-300 transition-all border border-white/5"
            title="Previous Track"
          >
            <SkipBack size={16} />
          </button>
          <button
            onClick={handlePlayPause}
            className="p-4 rounded-full bg-cyan-500 hover:bg-cyan-400 text-[#070b11] transition-all hover:scale-105 shadow-[0_0_20px_rgba(0,212,255,0.3)]"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current ml-0.5" />}
          </button>
          <button
            onClick={handleSkipForward}
            className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 hover:text-cyan-400 text-slate-300 transition-all border border-white/5"
            title="Next Track"
          >
            <SkipForward size={16} />
          </button>
        </div>

        {/* Volume Subdeck */}
        <div className="flex items-center gap-2.5 mt-6 border border-white/5 bg-black/30 p-2 rounded-2xl">
          <button
            onClick={() => setIsMuted(prev => !prev)}
            className="p-1 rounded-lg text-slate-400 hover:text-cyan-400 transition-colors"
          >
            {isMuted || volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(parseFloat(e.target.value))
              setIsMuted(false)
            }}
            className="w-16 h-[3px] accent-cyan-400 bg-white/10 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </div>
  )
}

export default MediaPlayer
