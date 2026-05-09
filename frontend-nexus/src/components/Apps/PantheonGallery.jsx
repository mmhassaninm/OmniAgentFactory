import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, RefreshCw, Maximize2, X, FolderOpen, Shield, Scan, Ghost, EyeOff, Sparkles, Download, Wand2, Loader2, Cpu, Settings2 } from 'lucide-react';
import nexusBridge from '../../services/bridge.js';
import '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-webgl';
import * as bodySegmentation from '@tensorflow-models/body-segmentation';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, Maximize } from 'lucide-react';

// Embedded Custom ImageViewer using Framer Motion
const ImageViewer = ({ src, title, children }) => {
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0);
    const containerRef = useRef(null);

    const handleZoomIn = () => setScale(s => Math.min(s + 0.5, 5));
    const handleZoomOut = () => setScale(s => Math.max(s - 0.5, 0.5));
    const handleReset = () => { setScale(1); setRotation(0); };
    const handleRotateL = () => setRotation(r => r - 90);
    const handleRotateR = () => setRotation(r => r + 90);

    return (
        <div className="flex-1 relative flex flex-col items-center justify-center p-8 overflow-hidden h-full">
            {/* Top Toolbar */}
            <div className="absolute top-4 inset-x-0 flex justify-center z-40 pointer-events-none">
                <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 px-3 rounded-full border border-white/10 shadow-2xl pointer-events-auto">
                    <button onClick={handleZoomOut} className="p-1.5 hover:bg-white/10 rounded-full text-slate-300 hover:text-white"><ZoomOut size={16} /></button>
                    <span className="text-[10px] font-mono text-cyan-400 w-10 text-center">{Math.round(scale * 100)}%</span>
                    <button onClick={handleZoomIn} className="p-1.5 hover:bg-white/10 rounded-full text-slate-300 hover:text-white"><ZoomIn size={16} /></button>
                    <div className="w-px h-5 bg-white/10 mx-1"></div>
                    <button onClick={handleRotateL} className="p-1.5 hover:bg-white/10 rounded-full text-slate-300 hover:text-purple-400"><RotateCcw size={16} /></button>
                    <button onClick={handleRotateR} className="p-1.5 hover:bg-white/10 rounded-full text-slate-300 hover:text-purple-400"><RotateCw size={16} /></button>
                    <div className="w-px h-5 bg-white/10 mx-1"></div>
                    <button onClick={handleReset} className="p-1.5 hover:bg-white/10 rounded-full text-slate-300 hover:text-yellow-400"><Maximize size={16} /></button>
                </div>
            </div>

            {/* Interactive Image Canvas */}
            <div ref={containerRef} className="flex-1 w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing overflow-hidden relative">
                <motion.div
                    drag
                    dragConstraints={containerRef}
                    dragElastic={0.2}
                    animate={{ scale, rotate: rotation }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="relative max-w-full max-h-full rounded-2xl overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.8)] border border-white/10 group flex items-center justify-center pointer-events-auto"
                >
                    {children}
                </motion.div>
            </div>
            <div className="absolute top-4 left-4 z-50 text-sm font-mono text-cyan-400 max-w-[30%] truncate drop-shadow-md">
                {title}
            </div>
        </div>
    );
};

export default function PantheonGallery() {
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [currentPath, setCurrentPath] = useState('');
    const [selectedImage, setSelectedImage] = useState(null);
    const [error, setError] = useState(null);

    // Aura Mode State
    const [isAuraMode, setIsAuraMode] = useState(false);
    const [auraMask, setAuraMask] = useState('blur'); // blur, neon, glitch, ghost
    const [isScanning, setIsScanning] = useState(false);
    const [privacyScore, setPrivacyScore] = useState(0);

    // AI Segmentation State
    const [aiStatus, setAiStatus] = useState('idle'); // idle, loading_model, analyzing, ready, error
    const [aiSegmenter, setAiSegmenter] = useState(null);
    const [aiMaskPath, setAiMaskPath] = useState(null);
    const [blurIntensity, setBlurIntensity] = useState(15);
    const canvasRef = useRef(null);
    const sourceImgRef = useRef(null);

    const loadImages = async (pathOverride) => {
        setLoading(true);
        setError(null);
        try {
            const target = pathOverride || currentPath || await nexusBridge.invoke('fs:home');
            setCurrentPath(target);
            const results = await nexusBridge.invoke('fs:list', target);
            if (results.error) throw new Error(results.error);

            const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
            const foundImages = results.filter(item => item.isFile && imageExts.includes(item.extension));
            setImages(foundImages);
        } catch (err) {
            console.error('[PantheonGallery] Error:', err);
            setError(err.message || 'Failed to initialize Native Bridge');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadImages();
    }, []);

    const fetchImageBase64 = async (filePath) => {
        try {
            return await nexusBridge.invoke('fs:read', { path: filePath, format: 'base64' });
        } catch (err) {
            console.error('Failed to load full image:', err);
            return null;
        }
    };

    const handleImageClick = async (img) => {
        const dataUri = await fetchImageBase64(img.path);
        if (dataUri) {
            setSelectedImage({ ...img, dataUri });
            setIsAuraMode(false);
            setPrivacyScore(0);
            setAiStatus('idle');
            setAiMaskPath(null);
        }
    };

    const toggleAuraMode = () => {
        if (!isAuraMode) {
            setIsAuraMode(true);
            setIsScanning(true);
            setPrivacyScore(0);
            runBodySegmentation();
        } else {
            setIsAuraMode(false);
            setAiStatus('idle');
        }
    };

    const runBodySegmentation = async () => {
        try {
            setAiStatus('loading_model');

            // 1. Load Model (Singleton)
            let segmenter = aiSegmenter;
            if (!segmenter) {
                const model = bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;
                const segmenterConfig = { runtime: 'tfjs', modelType: 'general' };
                segmenter = await bodySegmentation.createSegmenter(model, segmenterConfig);
                setAiSegmenter(segmenter);
            }

            setAiStatus('analyzing');

            // Wait for image to be fully rendered in DOM for extraction
            await new Promise(r => setTimeout(r, 500));

            if (!sourceImgRef.current) throw new Error('Source image not found in DOM');

            // 2. Perform Inference
            const segmentation = await segmenter.segmentPeople(sourceImgRef.current, {
                flipHorizontal: false,
                multiSegmentation: false,
                segmentBodyParts: false
            });

            if (segmentation.length > 0) {
                // 3. Convert Mask to Canvas Path / ImageData
                const mask = segmentation[0].mask;
                const maskImage = await mask.toImageData();
                setAiMaskPath(maskImage);
                setAiStatus('ready');
            } else {
                throw new Error('No humans detected');
            }

            setIsScanning(false);
            setPrivacyScore(100);

        } catch (err) {
            console.error('[GhostVeil] Segmentation Error:', err);
            setAiStatus('error');
            setIsScanning(false);
        }
    };

    // Advanced Canvas Compositing Pipeline
    useEffect(() => {
        if (!isAuraMode || !canvasRef.current || !sourceImgRef.current || !aiMaskPath) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const img = sourceImgRef.current;

        // Match canvas to image intrinsic size
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        // Clear previous render
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Draw the blurred original image (The Obfuscation Layer)
        ctx.filter = getAuraFilterStyle(true); // Pass true to return raw CSS filter string
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 2. Change compositing to destination-in
        // This means "Keep the blurred pixels ONLY where the next drawn shape exists"
        ctx.globalCompositeOperation = 'destination-in';
        ctx.filter = 'none';

        // 3. Create a temporary canvas to hold the AI Mask
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = aiMaskPath.width;
        maskCanvas.height = aiMaskPath.height;
        const maskCtx = maskCanvas.getContext('2d');
        maskCtx.putImageData(aiMaskPath, 0, 0);

        // 4. Draw the mask onto the main canvas
        // This clips the blur so it perfectly matches the human silhouette
        ctx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);

        // 5. Reset compositing
        ctx.globalCompositeOperation = 'source-over';

    }, [isAuraMode, aiMaskPath, auraMask, blurIntensity]);

    const getAuraFilterStyle = (rawString = false) => {
        let filterStr = `blur(${blurIntensity}px)`;
        switch (auraMask) {
            case 'neon': filterStr = `${filterStr} hue-rotate(90deg) saturate(3) invert(1) drop-shadow(0 0 20px cyan)`; break;
            case 'glitch': filterStr = `${filterStr} contrast(1.5) grayscale(1) invert(1) hue-rotate(180deg)`; break;
            case 'ghost': filterStr = `${filterStr} sepia(1)`; break;
        }

        if (rawString) return filterStr;

        if (auraMask === 'ghost') return { opacity: 0.6, filter: filterStr };
        return { filter: filterStr };
    };

    return (
        <div className="flex flex-col h-full bg-[#050510] text-white overflow-hidden rounded-b-xl relative font-sans">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/10 backdrop-blur-xl shrink-0 z-10">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                        <ImageIcon size={16} className="text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">Pantheon Gallery</h2>
                        <div className="text-[10px] text-slate-500 font-mono tracking-wider flex items-center gap-1">
                            <FolderOpen size={10} /> {currentPath || 'Loading...'}
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => loadImages()}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-slate-400 hover:text-purple-400"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin text-purple-400' : ''} />
                </button>
            </div>

            {error && (
                <div className="m-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center z-10">
                    {error}
                </div>
            )}

            {/* Image Grid */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative z-0">
                {loading && images.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
                    </div>
                ) : images.length === 0 && !error ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-600">
                        <ImageIcon size={32} className="mb-3 opacity-50" />
                        <span className="text-xs font-medium">No images found.</span>
                    </div>
                ) : (
                    <div className="columns-2 sm:columns-3 lg:columns-4 gap-4 space-y-4">
                        {images.map((img, idx) => (
                            <ImageThumbnail key={idx} img={img} onClick={() => handleImageClick(img)} />
                        ))}
                    </div>
                )}
            </div>

            {/* Advanced Lightbox & Aura Editor */}
            <AnimatePresence>
                {selectedImage && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute inset-0 z-50 bg-black/95 backdrop-blur-3xl flex overflow-hidden"
                    >
                        {/* Left: Main Image Canvas */}
                        <ImageViewer src={selectedImage.dataUri} title={selectedImage.name}>
                            <img
                                ref={sourceImgRef}
                                src={selectedImage.dataUri}
                                alt={selectedImage.name}
                                className={`max-w-full max-h-[85vh] object-contain transition-all duration-1000 ${isAuraMode && privacyScore === 100 ? 'scale-105' : ''}`}
                                draggable={false}
                            />

                            {/* AI Canvas Overlay Effect Container */}
                            {isAuraMode && aiStatus === 'ready' && (
                                <div className="absolute inset-x-0 bottom-0 top-[0%] pointer-events-none overflow-hidden flex items-center justify-center">
                                    <canvas
                                        ref={canvasRef}
                                        className="w-full h-full object-contain scale-[1.05]"
                                        style={auraMask === 'ghost' ? { opacity: 0.8 } : {}}
                                    />
                                </div>
                            )}

                            {/* Scanning Animation */}
                            <AnimatePresence>
                                {isScanning && (
                                    <motion.div
                                        initial={{ top: '0%' }}
                                        animate={{ top: '100%' }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 1.5, repeat: 1, ease: 'linear' }}
                                        className="absolute left-0 right-0 h-1 bg-cyan-500 shadow-[0_0_20px_cyan] z-20 pointer-events-none"
                                    />
                                )}
                            </AnimatePresence>

                            {/* Neural Grid Overlay */}
                            {isAuraMode && privacyScore > 0 && (
                                <div className="absolute inset-0 pointer-events-none opacity-20 transition-opacity">
                                    <svg className="w-full h-full">
                                        <rect x="25%" y="20%" width="50%" height="70%" fill="none" stroke="cyan" strokeWidth="1" strokeDasharray="4 4" className="animate-pulse" />
                                        <circle cx="50%" cy="30%" r="5" fill="cyan" />
                                        <text x="26%" y="18%" fill="cyan" fontSize="10" fontFamily="monospace">ID_BLOCK_AUTO_TARGET: BODY_SEGMENT_01</text>
                                    </svg>
                                </div>
                            )}

                            {/* Floating Controls Overlay (When not in Aura mode) */}
                            {!isAuraMode && (
                                <motion.div
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-3 bg-black/60 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl"
                                >
                                    <div className="px-3 border-r border-white/10 text-xs font-mono text-slate-300 truncate max-w-[200px]">
                                        {selectedImage.name}
                                    </div>
                                    <button
                                        onClick={toggleAuraMode}
                                        className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl transition-all font-black text-[10px] uppercase tracking-widest shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:scale-105 active:scale-95"
                                    >
                                        <Sparkles size={14} className="animate-pulse" />
                                        Privacy Aura Mode
                                    </button>
                                </motion.div>
                            )}
                        </ImageViewer>

                        {/* Top-Right Absolute Close Button outside the Viewer so it's always accessible */}
                        <button
                            className="absolute top-4 right-4 p-3 rounded-full bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 text-white transition-all z-50 shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:scale-110"
                            onClick={() => setSelectedImage(null)}
                        >
                            <X size={24} />
                        </button>

                        {/* Right: Aura Editor Sidebar (Appears in Aura Mode) */}
                        <AnimatePresence>
                            {isAuraMode && (
                                <motion.div
                                    initial={{ x: 300, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: 300, opacity: 0 }}
                                    className="w-80 shrink-0 bg-black/50 border-l border-white/10 p-6 flex flex-col gap-6 relative z-10 backdrop-blur-2xl"
                                >
                                    <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                                        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
                                            <Shield className="text-cyan-400" size={20} />
                                        </div>
                                        <div>
                                            <h2 className="text-sm font-black tracking-tighter text-white uppercase italic">Privacy Aura</h2>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] text-cyan-500 font-mono tracking-widest">BIOMETRIC MASKING</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Score Widget */}
                                    <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/5 flex items-center justify-between relative overflow-hidden">
                                        {/* Status Glow Indicator */}
                                        <div className={`absolute top-0 left-0 w-1 h-full ${aiStatus === 'loading_model' ? 'bg-amber-400' : aiStatus === 'analyzing' ? 'bg-purple-400 animate-pulse' : aiStatus === 'ready' ? 'bg-emerald-400' : aiStatus === 'error' ? 'bg-red-500' : 'bg-transparent'}`} />

                                        <div className="flex flex-col ml-2">
                                            <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Privacy Index</span>
                                            <span className="text-[10px] text-slate-400 font-mono mt-1 flex items-center gap-1.5">
                                                {aiStatus === 'loading_model' ? <><Cpu size={10} className="animate-spin text-amber-400" /> Booting Core</> :
                                                    aiStatus === 'analyzing' ? <><Scan size={10} className="animate-pulse text-purple-400" /> Segmenting Image</> :
                                                        aiStatus === 'error' ? <span className="text-red-400">Failed</span> :
                                                            'Identity Masked'
                                                }
                                            </span>
                                        </div>
                                        <span className={`text-2xl font-mono font-black ${privacyScore === 100 ? 'text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]' : 'text-cyan-400'}`}>
                                            {privacyScore}%
                                        </span>
                                    </div>

                                    {/* Modes */}
                                    <div className="flex-1 space-y-3">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-2">
                                            <Wand2 size={12} /> Render Mechanics
                                        </span>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { id: 'blur', label: 'Neural Blur', icon: EyeOff },
                                                { id: 'neon', label: 'Neon Aura', icon: Sparkles },
                                                { id: 'glitch', label: 'Cyber Glitch', icon: Scan },
                                                { id: 'ghost', label: 'Ghost Void', icon: Ghost }
                                            ].map(mode => (
                                                <button
                                                    key={mode.id}
                                                    onClick={() => { setAuraMask(mode.id); setPrivacyScore(0); setIsScanning(true); setTimeout(() => { setIsScanning(false); setPrivacyScore(100); }, 1500); }}
                                                    className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${auraMask === mode.id
                                                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                                                        : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10 hover:border-white/10'
                                                        }`}
                                                >
                                                    <mode.icon size={16} className="mb-2" />
                                                    <span className="text-[9px] font-bold uppercase tracking-tighter">{mode.label}</span>
                                                </button>
                                            ))}
                                        </div>

                                        {/* Intensity Slider */}
                                        <div className="pt-4 border-t border-white/5 mt-4">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-2">
                                                    <Settings2 size={12} /> Obfuscation Intensity
                                                </span>
                                                <span className="text-[10px] font-mono text-cyan-400">{blurIntensity}px</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="5"
                                                max="50"
                                                value={blurIntensity}
                                                onChange={(e) => setBlurIntensity(Number(e.target.value))}
                                                disabled={aiStatus !== 'ready'}
                                                className={`w-full h-1.5 rounded-full appearance-none outline-none ${aiStatus === 'ready' ? 'bg-white/20 cursor-pointer accent-cyan-400' : 'bg-white/5 cursor-not-allowed opacity-50'}`}
                                            />
                                        </div>

                                        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3 mt-4">
                                            <p className="text-[9px] text-cyan-400 font-mono leading-relaxed">
                                                INTELLIGENCE MODE: Auto-segmenting human silhouette in image layer. Out-of-box masking effects engaged.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Save Button */}
                                    <button
                                        onClick={() => { alert('Aura Matrix Applied & Saved to Nexus Vault.'); setIsAuraMode(false); }}
                                        disabled={privacyScore < 100}
                                        className={`w-full py-3.5 rounded-xl flex items-center justify-center gap-2 font-black uppercase tracking-widest text-[10px] transition-all border
                                                ${privacyScore < 100 ? 'opacity-30 cursor-not-allowed border-white/10 bg-transparent' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30 hover:border-emerald-500/50 hover:shadow-[0_0_20px_rgba(52,211,153,0.3)]'}
                                            `}
                                    >
                                        <Download size={14} /> Commit Safe Export
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const ImageThumbnail = ({ img, onClick }) => {
    const [src, setSrc] = useState(null);

    useEffect(() => {
        nexusBridge.invoke('fs:read', { path: img.path, format: 'base64' })
            .then(data => setSrc(data))
            .catch(() => setSrc(null));
    }, [img.path]);

    return (
        <div onClick={onClick} className="group relative rounded-xl overflow-hidden border border-white/5 cursor-pointer bg-white/5 hover:border-purple-500/50 hover:shadow-[0_0_20px_rgba(168,85,247,0.2)] transition-all break-inside-avoid">
            {src ? (
                <img src={src} alt={img.name} className="w-full h-auto object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" loading="lazy" />
            ) : (
                <div className="w-full aspect-square flex items-center justify-center">
                    <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
                </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="text-[10px] font-mono text-slate-300 truncate font-medium flex items-center justify-between">
                    <span className="truncate pr-2">{img.name}</span>
                    <Maximize2 size={12} className="text-purple-400 shrink-0" />
                </div>
            </div>
        </div>
    );
};
