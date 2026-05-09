import React, { useState, useRef, useEffect } from 'react';
import { Send, Wand2, Flame, Loader2, Copy, Check, ImagePlus, Zap, Sparkles, RefreshCw } from 'lucide-react';
import nexusBridge from '../../services/bridge';

const ASPECT_RATIOS = ['1024×1024', '1152×896', '896×1152', '1216×832', '832×1216', '1344×768', '768×1344'];
const STYLE_PRESETS = ['Fooocus V2', 'Fooocus Enhance', 'Fooocus Sharp', 'Cinematic', 'Photographic', 'Digital Art', 'Dark Fantasy', 'Comic Book'];

export default function NexusForge() {
    // Prompt Sculptor State
    const [userIdea, setUserIdea] = useState('');
    const [expandedPrompt, setExpandedPrompt] = useState('');
    const [isExpanding, setIsExpanding] = useState(false);
    const [copied, setCopied] = useState(false);

    // Render Engine State
    const [fooocusStatus, setFooocusStatus] = useState('checking');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationResult, setGenerationResult] = useState(null);
    const [selectedRatio, setSelectedRatio] = useState('1152×896');
    const [selectedStyle, setSelectedStyle] = useState('Fooocus V2');
    const [negativePrompt, setNegativePrompt] = useState('(worst quality, low quality, normal quality, lowres, low details)');

    const textareaRef = useRef(null);

    // Check Fooocus health on mount
    useEffect(() => {
        nexusBridge.invoke('forge:health', {})
            .then(res => setFooocusStatus(res?.available ? 'online' : 'offline'))
            .catch(() => setFooocusStatus('offline'));
    }, []);

    // ── Prompt Expansion via AI ──
    const handleExpandPrompt = async () => {
        if (!userIdea.trim() || isExpanding) return;
        setIsExpanding(true);
        setExpandedPrompt('');

        try {
            const result = await nexusBridge.invoke('ai:prompt', {
                text: userIdea,
                type: 'forge_expand',
                systemPrompt: `You are an elite AI Art prompt engineer specializing in Greco-Roman classical art, high-fidelity anatomical accuracy, and photorealism. Your task is to expand the user's short idea into a highly detailed, comma-separated image generation prompt. Include: subject description, pose, lighting (e.g., Rembrandt lighting, golden hour), camera angle, lens (e.g., 85mm f/1.4), medium (oil painting, marble sculpture, digital render), environment, mood, color palette, and technical quality tags (masterpiece, best quality, ultra-detailed, 8K). Return ONLY the expanded prompt, no explanations.`,
                urgency: 'high'
            });

            if (result?.response) {
                setExpandedPrompt(result.response.trim());
            } else {
                setExpandedPrompt('[AI returned no response. Check LM Studio connection.]');
            }
        } catch (err) {
            setExpandedPrompt(`[Error: ${err.message}]`);
        } finally {
            setIsExpanding(false);
        }
    };

    // ── Copy to Clipboard ──
    const handleCopy = () => {
        navigator.clipboard.writeText(expandedPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // ── Send to Fooocus ──
    const handleGenerate = async () => {
        if (!expandedPrompt.trim() || isGenerating) return;
        setIsGenerating(true);
        setGenerationResult(null);

        try {
            const result = await nexusBridge.invoke('forge:generate', {
                prompt: expandedPrompt,
                negativePrompt,
                style: selectedStyle,
                aspectRatio: selectedRatio,
                seed: -1
            });

            setGenerationResult(result);
        } catch (err) {
            setGenerationResult({ success: false, error: err.message });
        } finally {
            setIsGenerating(false);
        }
    };

    // ── Refresh Fooocus status ──
    const refreshHealth = () => {
        setFooocusStatus('checking');
        nexusBridge.invoke('forge:health', {})
            .then(res => setFooocusStatus(res?.available ? 'online' : 'offline'))
            .catch(() => setFooocusStatus('offline'));
    };

    return (
        <div className="w-full h-full flex bg-[#060606] text-white font-sans overflow-hidden">

            {/* ═══ LEFT PANE: Prompt Sculptor ═══ */}
            <div className="w-1/2 flex flex-col border-r border-white/5">
                {/* Header */}
                <div className="p-4 border-b border-white/5 bg-gradient-to-r from-purple-500/10 to-transparent">
                    <div className="flex items-center gap-2 mb-1">
                        <Wand2 className="w-5 h-5 text-purple-400" />
                        <h2 className="text-sm font-bold tracking-wide text-purple-300">Prompt Sculptor</h2>
                    </div>
                    <p className="text-[10px] text-gray-500">AI-powered prompt expansion for Greco-Roman classical art & photorealism</p>
                </div>

                {/* Input Area */}
                <div className="flex-1 flex flex-col p-4 gap-3 overflow-auto custom-scrollbar">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Your Idea</label>
                    <textarea
                        ref={textareaRef}
                        value={userIdea}
                        onChange={(e) => setUserIdea(e.target.value)}
                        placeholder="e.g., A marble statue of Athena holding a shield, dramatic studio lighting..."
                        rows={4}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all placeholder:text-gray-600 resize-none"
                    />

                    <button
                        onClick={handleExpandPrompt}
                        disabled={!userIdea.trim() || isExpanding}
                        className="flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-500/20"
                    >
                        {isExpanding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {isExpanding ? 'Sculpting...' : 'Expand with AI'}
                    </button>

                    {/* Expanded Prompt Output */}
                    {expandedPrompt && (
                        <div className="mt-2">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Expanded Prompt</label>
                                <button
                                    onClick={handleCopy}
                                    className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white transition-colors"
                                >
                                    {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-gray-200 leading-relaxed max-h-60 overflow-auto custom-scrollbar">
                                {expandedPrompt}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ RIGHT PANE: Render Engine ═══ */}
            <div className="w-1/2 flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-white/5 bg-gradient-to-r from-orange-500/10 to-transparent flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Flame className="w-5 h-5 text-orange-400" />
                            <h2 className="text-sm font-bold tracking-wide text-orange-300">Render Engine</h2>
                        </div>
                        <p className="text-[10px] text-gray-500">Local Fooocus API Integration</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={refreshHealth} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Refresh Status">
                            <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${fooocusStatus === 'online' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
                                fooocusStatus === 'checking' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
                                    'bg-red-500/10 border-red-500/30 text-red-400'
                            }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${fooocusStatus === 'online' ? 'bg-green-400' :
                                    fooocusStatus === 'checking' ? 'bg-yellow-400 animate-pulse' :
                                        'bg-red-400'
                                }`} />
                            {fooocusStatus === 'online' ? 'ONLINE' : fooocusStatus === 'checking' ? 'CHECKING...' : 'OFFLINE'}
                        </div>
                    </div>
                </div>

                {/* Controls & Generation */}
                <div className="flex-1 flex flex-col p-4 gap-3 overflow-auto custom-scrollbar">
                    {/* Aspect Ratio */}
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Aspect Ratio</label>
                    <div className="flex flex-wrap gap-1.5">
                        {ASPECT_RATIOS.map(r => (
                            <button
                                key={r}
                                onClick={() => setSelectedRatio(r)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all ${selectedRatio === r
                                        ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                    }`}
                            >
                                {r}
                            </button>
                        ))}
                    </div>

                    {/* Style Preset */}
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">Style Preset</label>
                    <div className="flex flex-wrap gap-1.5">
                        {STYLE_PRESETS.map(s => (
                            <button
                                key={s}
                                onClick={() => setSelectedStyle(s)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all ${selectedStyle === s
                                        ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                    }`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>

                    {/* Negative Prompt */}
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">Negative Prompt</label>
                    <textarea
                        value={negativePrompt}
                        onChange={(e) => setNegativePrompt(e.target.value)}
                        rows={2}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30 transition-all placeholder:text-gray-600 resize-none text-gray-300"
                    />

                    {/* Generate Button */}
                    <button
                        onClick={handleGenerate}
                        disabled={!expandedPrompt.trim() || isGenerating || fooocusStatus !== 'online'}
                        className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-orange-500/20 mt-2"
                    >
                        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                        {isGenerating ? 'Rendering...' : 'Send to Fooocus'}
                    </button>

                    {/* Result Display */}
                    {generationResult && (
                        <div className={`mt-3 p-4 rounded-xl border ${generationResult.success
                                ? 'bg-green-500/10 border-green-500/30'
                                : 'bg-red-500/10 border-red-500/30'
                            }`}>
                            <div className="flex items-center gap-2 mb-2">
                                {generationResult.success
                                    ? <Zap className="w-4 h-4 text-green-400" />
                                    : <Flame className="w-4 h-4 text-red-400" />
                                }
                                <span className={`text-xs font-bold ${generationResult.success ? 'text-green-300' : 'text-red-300'}`}>
                                    {generationResult.success ? 'Generation Queued Successfully!' : 'Generation Failed'}
                                </span>
                            </div>
                            <p className="text-[10px] text-gray-400">
                                {generationResult.success
                                    ? 'Your image is being rendered by the local Fooocus engine. Check the Fooocus UI for progress.'
                                    : generationResult.error || 'Unknown error occurred.'
                                }
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
