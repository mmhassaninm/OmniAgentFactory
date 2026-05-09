import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Globe, Boxes, Volume2, VolumeX, Mic, MicOff, Send, RotateCcw, ChevronDown, RefreshCw, Server, CircleDot } from 'lucide-react';

export default function ChatInput({
    isRtl, t, activeConvId, isRecording, inputRef, inputValue, setInputValue,
    handleKeyDown, isStreaming, isSearchEnabled, setIsSearchEnabled,
    kbFileRef, handleKBUpload, kbStatus, ttsEnabled, setTtsEnabled,
    startRecording, stopRecording, abortRef, sendMessage,
    isModelDropdownOpen, setIsModelDropdownOpen, modelStatus, selectedModel,
    fetchModels, models, setSelectedModel, isDepthOpen, setIsDepthOpen,
    currentDepth, SEARCH_DEPTHS, searchDepth, setSearchDepth
}) {
    if (!activeConvId) return null;

    return (
        <div className="px-6 pb-4 pt-2 border-t border-cyan-500/10 bg-black/40 backdrop-blur-xl">
            <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500"></div>
                <div className={`relative flex items-center gap-3 bg-slate-900/50 border rounded-2xl p-2 pl-4 transition-all group-focus-within:border-cyan-500/50 group-focus-within:bg-black/60 shadow-inner
                    ${isRecording ? 'border-red-500/50 bg-red-500/5' : 'border-white/10'}
                    ${isRtl ? 'flex-row-reverse pl-2 pr-4' : ''}`}>
                    <MessageSquare className="text-slate-600 group-focus-within:text-cyan-500 transition-colors flex-shrink-0" size={18} />
                    <input ref={inputRef} value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleKeyDown}
                        disabled={isStreaming}
                        className="flex-1 bg-transparent p-2.5 focus:outline-none text-white placeholder:text-slate-700 tracking-tight text-sm"
                        placeholder={t('chat.placeholder', { defaultValue: 'Ask Nexus anything...' })}
                        dir="auto" />

                    {/* Web Search Toggle */}
                    <button type="button" onClick={() => setIsSearchEnabled(!isSearchEnabled)}
                        className={`p-2 rounded-xl transition-all flex-shrink-0 ${isSearchEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.15)]' : 'text-slate-600 hover:text-cyan-400 hover:bg-white/5'}`}
                        title={isSearchEnabled ? 'Web Search: ON' : 'Web Search: OFF'}>
                        <Globe size={15} />
                    </button>

                    {/* Knowledge Base Upload */}
                    <input ref={kbFileRef} type="file" accept=".txt,.md,.csv,.json" className="hidden" onChange={handleKBUpload} />
                    <button type="button" onClick={() => kbFileRef.current?.click()}
                        className={`p-2 rounded-xl transition-all flex-shrink-0 ${kbStatus ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'text-slate-600 hover:text-cyan-400 hover:bg-white/5'}`}
                        title={kbStatus || 'Upload Knowledge Base File'}>
                        <Boxes size={15} />
                    </button>

                    {/* TTS */}
                    <button type="button" onClick={() => { setTtsEnabled(!ttsEnabled); if (ttsEnabled) window.speechSynthesis.cancel(); }}
                        className={`p-2 rounded-xl transition-all flex-shrink-0 ${ttsEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-600 hover:text-cyan-400 hover:bg-white/5'}`}
                        title="Text-to-Speech">
                        {ttsEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                    </button>

                    {/* Mic */}
                    <button type="button" onClick={isRecording ? stopRecording : startRecording}
                        className={`p-2 rounded-xl transition-all flex-shrink-0
                            ${isRecording ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse' : 'text-slate-600 hover:text-cyan-400 hover:bg-white/5'}`}
                        title={isRecording ? 'Stop Recording' : 'Voice Input'}>
                        {isRecording ? <MicOff size={15} /> : <Mic size={15} />}
                    </button>

                    {/* Send / Cancel */}
                    <button onClick={isStreaming ? () => abortRef.current?.abort() : sendMessage}
                        disabled={!inputValue.trim() && !isStreaming}
                        className={`flex-shrink-0 p-3 rounded-xl transition-all shadow-lg flex items-center justify-center
                            ${isStreaming
                                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 shadow-red-500/20'
                                : inputValue.trim()
                                    ? 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-cyan-500/20'
                                    : 'bg-white/5 text-gray-600 cursor-not-allowed shadow-none'}`}>
                        {isStreaming ? <RotateCcw size={18} /> : <Send size={18} className={isRtl ? 'rotate-180' : ''} />}
                    </button>
                </div>
            </div>
            <div className={`flex items-center gap-2 mt-2 text-[10px] text-gray-500 ${isRtl ? 'flex-row-reverse' : ''}`}>
                {/* ── Model Selector (inline) ── */}
                <div className="relative">
                    <button onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all hover:bg-white/5 ${isRtl ? 'flex-row-reverse' : ''}
                            ${modelStatus === 'online' ? 'border-emerald-500/20 text-emerald-400' : 'border-white/5 text-gray-500'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${modelStatus === 'online' ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]' : modelStatus === 'loading' ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`}></div>
                        <Boxes size={11} />
                        <span className="truncate max-w-[150px] font-bold">{selectedModel ? selectedModel.split('/').pop() : 'No model'}</span>
                        <ChevronDown className={`w-2.5 h-2.5 transition-transform flex-shrink-0 ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                        {isModelDropdownOpen && (
                            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                                className="absolute bottom-full left-0 mb-1 min-w-[280px] bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 max-h-48 overflow-y-auto">
                                <div className={`flex items-center justify-between px-3 py-2 border-b border-white/5 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">LM Studio Models</span>
                                    <button onClick={fetchModels} className="p-1 text-gray-600 hover:text-cyan-400 transition-colors" title="Refresh">
                                        <RefreshCw size={10} className={modelStatus === 'loading' ? 'animate-spin' : ''} />
                                    </button>
                                </div>
                                {models.length === 0 ? (
                                    <div className="px-3 py-3 text-center text-[10px] text-gray-500">
                                        <Server size={14} className="mx-auto mb-1.5 text-gray-600" />
                                        No chat models loaded.
                                    </div>
                                ) : models.map(m => (
                                    <button key={m.id} onClick={() => { setSelectedModel(m.id); setIsModelDropdownOpen(false); }}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] transition-all hover:bg-white/5 ${isRtl ? 'flex-row-reverse' : ''}
                                            ${selectedModel === m.id ? 'text-cyan-400 font-bold bg-cyan-500/5' : 'text-gray-400'}`}>
                                        <CircleDot size={9} className={selectedModel === m.id ? 'text-cyan-400' : 'text-gray-600'} />
                                        <span className="truncate">{m.name}</span>
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <span className="text-gray-700">•</span>

                {/* ── Search Depth Selector (inline) ── */}
                <div className="relative">
                    <button onClick={() => setIsDepthOpen(!isDepthOpen)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/5 transition-all hover:bg-white/5 ${currentDepth.color} ${isRtl ? 'flex-row-reverse' : ''}`}>
                        <currentDepth.icon className="w-3 h-3" />
                        <span className="font-bold">{t(currentDepth.label, { defaultValue: currentDepth.id })}</span>
                        <ChevronDown className={`w-2.5 h-2.5 transition-transform ${isDepthOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isDepthOpen && (
                        <div className="absolute bottom-full left-0 mb-1 min-w-[180px] bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50">
                            {SEARCH_DEPTHS.map(d => (
                                <button key={d.id} onClick={() => { setSearchDepth(d.id); setIsDepthOpen(false); }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] transition-all hover:bg-white/5 ${isRtl ? 'flex-row-reverse' : ''} ${searchDepth === d.id ? `${d.color} font-bold` : 'text-gray-400'}`}>
                                    <d.icon className="w-3.5 h-3.5" />
                                    <span>{t(d.label, { defaultValue: d.id })}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {isSearchEnabled && (
                    <>
                        <span className="text-gray-700">•</span>
                        <span className="flex items-center gap-1 text-emerald-500/70">
                            <Globe size={10} /> Web Search
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}
