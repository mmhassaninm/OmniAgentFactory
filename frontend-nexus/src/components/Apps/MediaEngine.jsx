import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Music, Shuffle, Repeat, Disc3, Mic2, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOSStore } from '../../store/osStore';

/**
 * Nexus Media Engine
 * ─────────────────────────────────────────────
 * Hyper-Evolved from legacy Nexus Prime AudioPlayer.
 * Features:
 * - Holographic Glassmorphism UI
 * - Dynamic Waveform Visualization (Simulated pending real WebAudio source)
 * - Full Aura System Sync
 * - Native RTL (Arabic) Support
 */

const FALLBACK_TRACKS = [
    { id: 1, title: 'No Tracks Found', artist: 'System', src: '', cover: 'from-gray-500 to-slate-600', duration: '0:00' }
];

// Aesthetic Visualizer leveraging Aura Color
const Visualizer = ({ playing, auraColor }) => {
    const [bars, setBars] = useState(new Array(40).fill(10));

    useEffect(() => {
        if (!playing) {
            setBars(new Array(40).fill(5));
            return;
        }

        const interval = setInterval(() => {
            setBars(bars => bars.map(() => Math.max(5, Math.random() * 80)));
        }, 100);

        return () => clearInterval(interval);
    }, [playing]);

    const getColorClass = () => {
        switch (auraColor) {
            case 'cyan': return 'bg-cyan-400';
            case 'purple': return 'bg-purple-400';
            case 'emerald': return 'bg-emerald-400';
            case 'rose': return 'bg-rose-400';
            case 'amber': return 'bg-amber-400';
            default: return 'bg-cyan-400';
        }
    };

    return (
        <div className="flex items-end justify-center gap-1 h-32 px-6 overflow-hidden relative">
            {/* Holographic Glow */}
            <div className={`absolute inset-0 ${getColorClass()} opacity-5 blur-3xl rounded-full`}></div>

            {bars.map((h, i) => (
                <div
                    key={i}
                    className={`w-1.5 rounded-t-full transition-all duration-100 ease-out ${getColorClass()}`}
                    style={{
                        height: `${h}%`,
                        opacity: playing ? 0.7 + (Math.random() * 0.3) : 0.2,
                        boxShadow: playing ? `0 0 10px currentColor` : 'none'
                    }}
                />
            ))}
        </div>
    );
};

export default function MediaEngine() {
    const { t } = useTranslation();
    const { systemLanguage, auraColor } = useOSStore();
    const isRtl = systemLanguage === 'ar';

    const [playing, setPlaying] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const [volume, setVolume] = useState(0.8);
    const [muted, setMuted] = useState(false);
    const [durationText, setDurationText] = useState("0:00");
    const [currentTimeText, setCurrentTimeText] = useState("0:00");
    const [tracks, setTracks] = useState([]);
    const [audioSrc, setAudioSrc] = useState(null);
    const [isLoadingTrack, setIsLoadingTrack] = useState(false);

    const audioRef = useRef(null);
    const track = tracks[currentIndex] || FALLBACK_TRACKS[0];

    // Fetch local files on mount
    useEffect(() => {
        const fetchLocalMusic = async () => {
            try {
                const qa = await window.nexusAPI.invoke('fs:quick-access');
                const musicDir = qa.find(f => f.name === 'Music')?.path || 'D:\\NexusOS-main-Storage\\Music';
                const files = await window.nexusAPI.invoke('fs:list', musicDir);
                if (files && !files.error) {
                    const audioFiles = files.filter(f => f.isFile && ['.mp3', '.wav', '.ogg', '.m4a'].includes(f.extension));
                    if (audioFiles.length > 0) {
                        const gradients = [
                            'from-cyan-500 to-blue-600', 'from-purple-500 to-pink-600',
                            'from-emerald-500 to-teal-600', 'from-amber-500 to-orange-600'
                        ];
                        const t = audioFiles.map((f, i) => ({
                            id: i + 1,
                            title: f.name.replace(f.extension, ''),
                            artist: 'Local Library',
                            path: f.path,
                            cover: gradients[i % gradients.length],
                            duration: '-:--'
                        }));
                        setTracks(t);
                        return;
                    }
                }
                setTracks(FALLBACK_TRACKS);
            } catch (err) {
                console.warn('Failed to fetch local music', err);
                setTracks(FALLBACK_TRACKS);
            }
        };
        fetchLocalMusic();
    }, []);

    // Load track source dynamically
    useEffect(() => {
        if (!track || !track.path || track.src === '') {
            setAudioSrc(null);
            return;
        }
        setIsLoadingTrack(true);
        window.nexusAPI.invoke('fs:read', { path: track.path, format: 'base64' })
            .then(base64 => {
                setAudioSrc(base64);
                setIsLoadingTrack(false);
            })
            .catch(() => {
                setAudioSrc(null);
                setIsLoadingTrack(false);
            });
    }, [track.path]);

    // Sync volume & mute
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = muted ? 0 : volume;
        }
    }, [volume, muted]);

    // Play/Pause sync
    useEffect(() => {
        if (!audioRef.current) return;
        if (playing) {
            audioRef.current.play().catch(e => console.warn("Audio play blocked", e));
        } else {
            audioRef.current.pause();
        }
    }, [playing, currentIndex]);

    const handleNext = () => {
        if (tracks.length === 0) return;
        setCurrentIndex((prev) => (prev + 1) % tracks.length);
        setProgress(0);
    };

    const handlePrev = () => {
        if (tracks.length === 0) return;
        setCurrentIndex((prev) => (prev === 0 ? tracks.length - 1 : prev - 1));
        setProgress(0);
    };

    const onTimeUpdate = () => {
        if (!audioRef.current) return;
        const cur = audioRef.current.currentTime;
        const tot = audioRef.current.duration;
        if (tot && !isNaN(tot)) {
            setProgress((cur / tot) * 100);
            setCurrentTimeText(formatTime(cur));
            setDurationText(formatTime(tot));
        }
    };

    const onEnded = () => {
        handleNext();
    };

    const formatTime = (seconds) => {
        if (isNaN(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const handleSeek = (e) => {
        if (!audioRef.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        let clickPos = e.clientX - rect.left;
        if (isRtl) {
            clickPos = rect.right - e.clientX;
        }
        const percent = Math.max(0, Math.min(1, clickPos / rect.width));
        const newTime = percent * audioRef.current.duration;
        if (!isNaN(newTime)) {
            audioRef.current.currentTime = newTime;
            setProgress(percent * 100);
        }
    };

    return (
        <div className={`flex flex-col h-full bg-black/40 text-slate-200 overflow-hidden font-sans ${isRtl ? 'text-right' : 'text-left'}`}>

            {/* Top Bar / Category */}
            <div className={`flex items-center gap-4 px-6 py-4 border-b border-white/5 bg-white/[0.02] ${isRtl ? 'flex-row-reverse' : ''}`}>
                <div className={`flex items-center gap-2 text-white/50 hover:text-white transition-colors cursor-pointer ${isRtl ? 'flex-row-reverse text-right' : 'flex-row text-left'}`}>
                    <Music className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">{t('apps.media.library', { defaultValue: 'Library' })}</span>
                </div>
                <div className={`flex items-center gap-2 text-cyan-400 transition-colors cursor-pointer ${isRtl ? 'flex-row-reverse text-right' : 'flex-row text-left'}`}>
                    <Radio className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">{t('apps.media.stations', { defaultValue: 'Stations' })}</span>
                </div>
                <div className={`flex items-center gap-2 text-white/50 hover:text-white transition-colors cursor-pointer ${isRtl ? 'flex-row-reverse text-right' : 'flex-row text-left'}`}>
                    <Mic2 className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">{t('apps.media.podcasts', { defaultValue: 'Podcasts' })}</span>
                </div>
            </div>

            <div className={`flex flex-1 overflow-hidden ${isRtl ? 'flex-row-reverse' : ''}`}>

                {/* Visualizer & Now Playing Layer */}
                <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
                        <Visualizer playing={playing} auraColor={auraColor} />
                    </div>

                    {/* Floating Album Art Orb */}
                    <div className="relative z-10 w-48 h-48 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-4 border-white/10 overflow-hidden flex items-center justify-center bg-black/50 backdrop-blur-md mb-8 group">
                        <div className={`absolute inset-0 bg-gradient-to-br ${track.cover} opacity-50 group-hover:opacity-80 transition-opacity duration-700 ${playing ? 'animate-pulse' : ''}`}></div>
                        <Disc3 className={`w-20 h-20 text-white drop-shadow-2xl ${playing ? 'animate-spin-slow' : ''}`} style={{ animationDuration: '4s' }} />
                    </div>

                    <div className="relative z-10 text-center">
                        <h2 className="text-2xl font-black text-white tracking-tight drop-shadow-lg">{track.title}</h2>
                        <p className={`text-sm tracking-widest uppercase mt-2 font-bold opacity-70 bg-clip-text text-transparent bg-gradient-to-r ${track.cover}`}>{track.artist}</p>
                    </div>
                </div>

                {/* Playlist Sidebar */}
                <div className="w-72 border-white/5 bg-black/20 flex flex-col" style={{ borderLeftWidth: !isRtl ? '1px' : '0', borderRightWidth: isRtl ? '1px' : '0' }}>
                    <div className={`p-4 text-xs font-bold uppercase tracking-widest text-slate-500 border-b border-white/5 bg-white/[0.01] ${isRtl ? 'text-right' : 'text-left'}`}>
                        {t('apps.media.up_next', { defaultValue: 'Up Next' })}
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                        {tracks.map((tItem, idx) => (
                            <div
                                key={tItem.id}
                                onClick={() => { setCurrentIndex(idx); setProgress(0); setPlaying(true); }}
                                className={`flex items-center p-3 rounded-xl cursor-pointer transition-all ${currentIndex === idx ? 'bg-white/10 shadow-[0_0_15px_rgba(255,255,255,0.05)] border border-white/5 text-white' : 'hover:bg-white/5 text-slate-400'} ${isRtl ? 'flex-row-reverse' : ''}`}
                            >
                                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${tItem.cover} flex items-center justify-center flex-shrink-0 opacity-80`}>
                                    {currentIndex === idx && playing ? <div className="w-3 h-3 rounded-full bg-white animate-pulse"></div> : <Music className="w-3.5 h-3.5 text-white" />}
                                </div>
                                <div className={`flex-1 min-w-0 ${isRtl ? 'mr-3 text-right' : 'ml-3 text-left'}`}>
                                    <div className="text-[11px] font-bold truncate">{tItem.title}</div>
                                    <div className="text-[9px] opacity-60 truncate">{tItem.artist}</div>
                                </div>
                                <div className="text-[10px] opacity-50 font-mono tracking-tighter">
                                    {tItem.duration}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

            {/* Bottom Playback Controls */}
            <div className={`h-24 bg-gradient-to-t from-black/80 to-transparent border-t border-white/5 flex items-center justify-between px-8 z-20 ${isRtl ? 'flex-row-reverse' : ''}`}>

                {/* Track Info (Bottom Left/Right) */}
                <div className={`flex items-center gap-4 w-64 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${track.cover} shadow-lg shadow-black/50 flex flex-shrink-0`}></div>
                    <div className={`min-w-0 ${isRtl ? 'text-right' : 'text-left'}`}>
                        <div className="text-sm font-bold text-white truncate drop-shadow-md">{track.title}</div>
                        <div className="text-[10px] text-slate-400 truncate">{track.artist}</div>
                    </div>
                </div>

                {/* Core Controls */}
                <div className="flex-1 flex flex-col items-center max-w-xl px-8">
                    <div className={`flex items-center gap-6 mb-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                        <button className="text-slate-500 hover:text-white transition-colors p-2"><Shuffle className="w-4 h-4" /></button>
                        <button onClick={handlePrev} className="text-slate-300 hover:text-white transition-colors p-2"><SkipBack className="w-5 h-5 fill-current" /></button>
                        <button
                            onClick={() => setPlaying(!playing)}
                            className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 hover:bg-slate-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                        >
                            {playing ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                        </button>
                        <button onClick={handleNext} className="text-slate-300 hover:text-white transition-colors p-2"><SkipForward className="w-5 h-5 fill-current" /></button>
                        <button className="text-slate-500 hover:text-white transition-colors p-2"><Repeat className="w-4 h-4" /></button>
                    </div>
                    {/* Progress Bar */}
                    <div className={`w-full flex items-center gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                        <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{currentTimeText}</span>
                        <div onClick={handleSeek} className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden relative group cursor-pointer">
                            <div
                                className="absolute top-0 bottom-0 left-0 bg-white rounded-full transition-all ease-linear"
                                style={{ width: `${progress}%`, right: isRtl ? 0 : 'auto', left: isRtl ? 'auto' : 0 }}
                            ></div>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 w-8">{durationText}</span>
                    </div>
                </div>

                {/* Volume & Extras */}
                <div className={`w-64 flex items-center justify-end gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <button onClick={() => setMuted(!muted)} className="text-slate-400 hover:text-white transition-colors">
                        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input
                        type="range"
                        min="0" max="1" step="0.01"
                        value={muted ? 0 : volume}
                        onChange={(e) => { setVolume(e.target.value); setMuted(false); }}
                        className={`w-24 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white ${isRtl ? 'rotate-180' : ''}`}
                    />
                </div>

            </div>

            {/* Hidden Audio Element */}
            <audio
                ref={audioRef}
                src={audioSrc || ''}
                onTimeUpdate={onTimeUpdate}
                onEnded={onEnded}
            />
        </div>
    );
}
