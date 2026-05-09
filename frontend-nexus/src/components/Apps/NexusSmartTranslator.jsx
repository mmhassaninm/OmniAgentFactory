import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useOSStore } from '../../store/osStore';
import nexusBridge from '../../services/bridge.js';
import { Languages, ArrowRightLeft, Sparkles, Copy, Check, Loader2, Volume2, Search, Brain } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function NexusSmartTranslator() {
    const { t } = useTranslation();
    const { systemLanguage } = useOSStore();
    const isRtl = systemLanguage === 'ar';

    const [sourceText, setSourceText] = useState('');
    const [targetLang, setTargetLang] = useState(isRtl ? 'English' : 'Arabic');
    const [isTranslating, setIsTranslating] = useState(false);
    const [translationResult, setTranslationResult] = useState(null);
    const [copied, setCopied] = useState(false);

    const handleTranslate = async () => {
        if (!sourceText.trim()) return;
        setIsTranslating(true);
        setTranslationResult(null);

        const prompt = `You are a world-class linguist and cultural translator. 
Translate the following text into ${targetLang}. 
Do not just do a literal translation; provide a "Smart Translation" which includes:
1. The most natural, culturally accurate translation.
2. An explanation of any idioms, slang, or difficult words used in the source.
3. 2-3 alternative ways to say it (e.g., formal vs. casual).

Return the result strictly in this JSON format:
{
  "translation": "The main translation",
  "phonetic": "Phonetic reading (optional)",
  "context": "Explanation of cultural context or idioms",
  "alternatives": ["Alt 1", "Alt 2"]
}

Text to translate:
"${sourceText}"`;

        try {
            const res = await nexusBridge.invoke('hive:orchestrateTask', {
                text: prompt,
                context: 'Mode: Smart Translation'
            });

            if (res.success && res.response) {
                // Extract JSON from markdown
                const jsonMatch = res.response.match(/\{[\s\S]*?\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    setTranslationResult(parsed);
                } else {
                    // Fallback if AI didn't return perfect JSON
                    setTranslationResult({
                        translation: res.response,
                        context: 'Standard translation applied. No deep context provided.',
                        alternatives: []
                    });
                }
            } else {
                throw new Error('Translation failed');
            }
        } catch (error) {
            console.error(error);
            setTranslationResult({
                translation: 'Error processing translation. Please try again.',
                context: error.message,
                alternatives: []
            });
        } finally {
            setIsTranslating(false);
        }
    };

    const handleCopy = async (text) => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={`flex flex-col h-full bg-[#050810] text-slate-200 overflow-hidden font-sans p-6 ${isRtl ? 'text-right rtl' : 'text-left ltr'}`} dir={isRtl ? 'rtl' : 'ltr'}>

            {/* Header */}
            <div className={`flex items-center gap-4 mb-6 ${isRtl ? 'flex-row-reverse' : ''}`}>
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center relative">
                    <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full animate-pulse"></div>
                    <Languages className="w-6 h-6 text-indigo-400 relative z-10" />
                </div>
                <div>
                    <h1 className="text-2xl font-black text-white uppercase tracking-wider">Nexus Smart Translator</h1>
                    <p className="text-sm text-indigo-400/80 font-bold uppercase tracking-widest">Context-Aware Neural Engine</p>
                </div>
            </div>

            {/* Translation Layout */}
            <div className={`flex-1 flex gap-6 min-h-0 ${isRtl ? 'flex-row-reverse' : 'flex-col lg:flex-row'}`}>

                {/* Input Panel */}
                <div className="flex-1 flex flex-col bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden shadow-2xl relative">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
                    <div className={`flex items-center justify-between p-4 border-b border-white/5 bg-black/40 ${isRtl ? 'flex-row-reverse' : ''}`}>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Auto Detect</span>
                        <button
                            onClick={() => setTargetLang(targetLang === 'English' ? 'Arabic' : 'English')}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors text-indigo-400">
                            <ArrowRightLeft size={16} />
                        </button>
                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">{targetLang}</span>
                    </div>

                    <textarea
                        className="flex-1 w-full bg-transparent p-6 text-lg text-slate-200 resize-none focus:outline-none custom-scrollbar"
                        placeholder="Type or paste text to translate..."
                        value={sourceText}
                        onChange={(e) => setSourceText(e.target.value)}
                        dir="auto"
                    ></textarea>

                    <div className={`p-4 border-t border-white/5 bg-black/40 flex items-center justify-between ${isRtl ? 'flex-row-reverse' : ''}`}>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{sourceText.length} characters</span>
                        <button
                            onClick={handleTranslate}
                            disabled={isTranslating || !sourceText.trim()}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30 hover:text-white transition-all disabled:opacity-50 font-bold uppercase tracking-wider text-sm shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                            {isTranslating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {isTranslating ? 'Analyzing...' : 'Translate'}
                        </button>
                    </div>
                </div>

                {/* Output Panel */}
                <div className="flex-1 flex flex-col bg-indigo-950/20 backdrop-blur-xl border border-indigo-500/10 rounded-3xl overflow-hidden shadow-2xl relative">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>

                    {!translationResult && !isTranslating ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                            <Brain className="w-16 h-16 text-indigo-500/20 mb-4" />
                            <h3 className="text-lg font-bold text-indigo-300/50 uppercase tracking-widest mb-2">Neural Translation Awaiting</h3>
                            <p className="text-sm text-slate-500 max-w-sm">Enter text to get a highly contextualized translation with cultural idioms and natural phrasing alternatives.</p>
                        </div>
                    ) : isTranslating ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                            <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-6"></div>
                            <h3 className="text-lg font-bold text-indigo-400 uppercase tracking-widest mb-2 animate-pulse">Processing Deep Context</h3>
                            <p className="text-sm text-slate-500">Evaluating cultural nuances and idioms...</p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                            {/* Primary Translation */}
                            <div>
                                <div className={`flex items-center justify-between mb-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                    <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400">Primary Translation</h3>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => {
                                            const utterance = new SpeechSynthesisUtterance(translationResult.translation);
                                            utterance.lang = targetLang === 'Arabic' ? 'ar-SA' : 'en-US';
                                            window.speechSynthesis.speak(utterance);
                                        }} className="p-1.5 rounded-lg bg-black/40 hover:bg-white/10 text-slate-400 transition-colors">
                                            <Volume2 size={14} />
                                        </button>
                                        <button onClick={() => handleCopy(translationResult.translation)} className="p-1.5 rounded-lg bg-black/40 hover:bg-white/10 text-slate-400 transition-colors">
                                            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="p-5 rounded-2xl bg-black/40 border border-white/5 text-xl font-medium text-white leading-relaxed" dir="auto">
                                    {translationResult.translation}
                                </div>
                                {translationResult.phonetic && (
                                    <div className="mt-2 text-sm text-slate-500 italic px-2">
                                        {translationResult.phonetic}
                                    </div>
                                )}
                            </div>

                            {/* Cultural Context */}
                            {translationResult.context && (
                                <div>
                                    <h3 className={`text-xs font-black uppercase tracking-widest text-emerald-400 mb-3 ${isRtl ? 'text-right' : 'text-left'}`}>Cultural & Idiomatic Context</h3>
                                    <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/10 text-emerald-100/80 text-sm leading-relaxed" dir="auto">
                                        {translationResult.context}
                                    </div>
                                </div>
                            )}

                            {/* Alternatives */}
                            {translationResult.alternatives && translationResult.alternatives.length > 0 && (
                                <div>
                                    <h3 className={`text-xs font-black uppercase tracking-widest text-purple-400 mb-3 ${isRtl ? 'text-right' : 'text-left'}`}>Alternative Phrasings</h3>
                                    <div className="space-y-2">
                                        {translationResult.alternatives.map((alt, i) => (
                                            <div key={i} className={`p-4 rounded-xl bg-purple-950/20 border border-purple-500/10 text-purple-100/90 flex justify-between items-center group ${isRtl ? 'flex-row-reverse' : ''}`} dir="auto">
                                                <span>{alt}</span>
                                                <button onClick={() => handleCopy(alt)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-white/10 transition-all">
                                                    <Copy size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
