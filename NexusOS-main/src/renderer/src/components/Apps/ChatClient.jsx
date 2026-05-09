import React, { useState, useEffect, useRef } from 'react';
import { Send, Settings, Shield, User, Bot, Loader2 } from 'lucide-react';
import { useOSStore } from '../../store/osStore';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const ChatClient = () => {
    const { systemLanguage } = useOSStore();
    const { t } = useTranslation();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);
    const isRtl = systemLanguage === 'ar';

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Listen for STDOUT stream from Python Orchestrator via Electron IPC
    useEffect(() => {
        if (!window.nexusAPI) return;

        const unsubscribe = window.nexusAPI.receive('python:stdout', (data) => {
            const output = data.output;

            // In Phase 16/17 we will parse this JSON properly. 
            // For now, we just append it as a raw string if it's text.
            setIsTyping(false);
            setMessages(prev => [...prev, { role: 'ai', text: output, id: Date.now() }]);
        });

        // Add a system welcome message
        setMessages([
            {
                role: 'system',
                text: t('chat.welcome', {
                    defaultValue: isRtl
                        ? 'تم تأمين الاتصال بنواة الذكاء الاصطناعي (Local-First). المراسلات مشفرة تماماً.'
                        : 'Encrypted connection to Local-First AI Core established.'
                }),
                id: 'sys-1'
            }
        ]);

        return () => {
            // Phase 32.4: Step 18 - Cleanup IPC listener on unmount
            if (unsubscribe) unsubscribe();
        };
    }, [isRtl, t]);

    const handleSend = async (e) => {
        if (e) e.preventDefault();
        if (!input.trim()) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg, id: Date.now() }]);
        setIsTyping(true);

        if (!window.nexusAPI) {
            setTimeout(() => {
                setMessages(prev => [...prev, {
                    role: 'ai',
                    text: "Browser Preview Mode: Electron IPC is unavailable. In the real app, this would query your AI Provider.",
                    id: Date.now()
                }]);
                setIsTyping(false);
            }, 1000);
            return;
        }

        try {
            const res = await window.nexusAPI.invoke('ai:prompt', { text: userMsg });
            if (res.success) {
                setMessages(prev => [...prev, { role: 'ai', text: res.response, id: Date.now() }]);
            } else {
                setMessages(prev => [...prev, { role: 'system', text: `Error: ${res.error || res.message}`, id: Date.now() }]);
            }
        } catch (err) {
            console.error('IPC Invoke Error:', err);
            setMessages(prev => [...prev, { role: 'system', text: 'Bridge Offline', id: Date.now() }]);
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 text-slate-100 rounded-b-xl overflow-hidden font-sans">

            {/* Header */}
            <div className="flex items-center justify-between p-3 bg-slate-800 border-b border-slate-700/50">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                        <Shield size={18} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm">Nexus AI Core</h3>
                        <p className="text-xs text-emerald-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                            {t('chat.encrypted', { defaultValue: isRtl ? 'مشفر محلياً' : 'Local Encrypted' })}
                        </p>
                    </div>
                </div>
                <button className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors text-slate-400 hover:text-white">
                    <Settings size={18} />
                </button>
            </div>

            {/* Chat Area */}
            <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${isRtl ? 'rtl' : 'ltr'}`}>
                {messages.map((msg) => (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={msg.id}
                        className={`flex gap-3 ${msg.role === 'user' ? (isRtl ? 'flex-row-reverse' : 'flex-row-reverse') : ''}`}
                    >
                        {msg.role !== 'system' && (
                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-blue-600' : 'bg-emerald-600'
                                }`}>
                                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                            </div>
                        )}

                        <div className={`max-w-[80%] rounded-xl p-3 text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' :
                            msg.role === 'system' ? 'w-full bg-slate-800/50 text-slate-400 text-center border border-slate-700/50 text-xs' :
                                'bg-slate-800 text-slate-200 border border-slate-700/50'
                            }`}>
                            {msg.text}
                        </div>
                    </motion.div>
                ))}

                {isTyping && (
                    <div className={`flex gap-3 ${isRtl ? '' : ''}`}>
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center">
                            <Bot size={16} />
                        </div>
                        <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-3 flex items-center gap-2">
                            <Loader2 size={16} className="text-emerald-400 animate-spin" />
                            <span className="text-xs text-slate-400">{t('chat.typing', { defaultValue: isRtl ? 'الذكاء الاصطناعي يفكر...' : 'AI is processing...' })}</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 bg-slate-800 border-t border-slate-700/50">
                <form onSubmit={handleSend} className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder={t('chat.input_placeholder', { defaultValue: isRtl ? "اكتب رسالتك المشفرة هنا..." : "Type your encrypted message here..." })}
                        className={`w-full bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors ${isRtl ? 'pr-4 pl-12' : 'pl-4 pr-12'
                            }`}
                        dir={isRtl ? 'rtl' : 'ltr'}
                    />
                    <button
                        type="button"
                        onClick={handleSend}
                        disabled={!input.trim() || isTyping}
                        className={`absolute top-1/2 -translate-y-1/2 p-2 rounded-md ${input.trim() && !isTyping ? 'text-blue-400 hover:bg-blue-400/10' : 'text-slate-600 cursor-not-allowed'
                            } ${isRtl ? 'left-2' : 'right-2'}`}
                    >
                        <Send size={18} className={isRtl ? 'transform rotate-180' : ''} />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChatClient;
