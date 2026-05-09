import React from 'react';
import { motion } from 'framer-motion';
import { User, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import ThinkingAccordion from '../Apps/ThinkingAccordion';
import { markdownRenderers, parseThinkContent } from './MarkdownRenderers';

const isArabicText = (text) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);

export default function MessageBubble({ message, isRtl }) {
    const isUser = message.role === 'user';
    const { reasoning: thinking, answer, isStreaming } = parseThinkContent(message.content);
    const textDir = isArabicText(answer || message.content) ? 'rtl' : 'ltr';

    return (
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3.5 py-2 group ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 border shadow-lg
                ${isUser ? 'bg-slate-800 border-white/10 text-slate-400' : 'bg-cyan-950 border-cyan-500/30 text-cyan-400'}`}>
                {isUser ? <User size={14} /> : <Sparkles size={14} />}
            </div>
            {/* Content */}
            <div className={`max-w-[85%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                <div className={`px-4 py-3 rounded-2xl border leading-relaxed
                    ${isUser
                        ? 'bg-gradient-to-br from-slate-800/60 to-slate-900/50 border-white/10 text-slate-200 rounded-tr-sm'
                        : 'bg-cyan-500/5 border-cyan-500/10 text-cyan-50 rounded-tl-sm'}`}
                    dir={textDir}>
                    {isUser ? (
                        <span className="text-slate-200 text-[13.5px] leading-relaxed whitespace-pre-wrap">{message.content}</span>
                    ) : (
                        <div className="text-[13.5px]">
                            {thinking && <ThinkingAccordion thinking={thinking} isStreaming={isStreaming && !message.done} />}
                            <ReactMarkdown components={markdownRenderers}>
                                {answer || (!thinking ? message.content : '')}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>
                <span className={`text-[9px] text-slate-600 mt-1.5 font-bold uppercase tracking-tighter px-1 ${isUser ? 'text-end' : 'text-start'}`}>
                    {isUser ? 'You' : 'Nexus AI'} • {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}
                </span>
            </div>
        </motion.div>
    );
}
