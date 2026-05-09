import React from 'react';
import { motion } from 'framer-motion';
import { User, Sparkles, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import ThinkingAccordion from '../Apps/ThinkingAccordion';
import { markdownRenderers, parseThinkContent } from './MarkdownRenderers';

const isArabicText = (text) =>
    /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(text);

function formatTimestamp(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    const month = d.toLocaleString('en-US', { month: 'short' });
    return `${hh}:${mm} · ${dd} ${month}`;
}

function formatModelInfo(provider, model) {
    if (!model || model === 'auto') return null;
    const providerLabel = provider ? provider.replace(/_/g, ' ') : '';
    const modelShort = model.includes('/') ? model : model.substring(0, 28);
    return providerLabel ? `${providerLabel} · ${modelShort}` : modelShort;
}

export default function MessageBubble({ message, isRtl }) {
    const isUser = message.role === 'user';

    // Derive thinking/answer from content via <think> tag parsing
    const { reasoning: thinking, answer, isStreaming: thinkStreaming } = parseThinkContent(message.content);

    // Effective visible content (for empty-guard check)
    const effectiveContent = answer || (!thinking ? message.content : '');

    // An AI message that is done but has no visible content becomes an error bubble
    const isEmptyDone = !isUser && message.done && !effectiveContent?.trim() && !thinking?.trim();
    const isError = (!isUser && !!message.isError) || isEmptyDone;

    // Resolved content for empty-done messages
    const displayContent = isEmptyDone && !message.isError
        ? '⚠️ No response received — the model returned an empty reply.'
        : effectiveContent;

    const textDir = isArabicText(displayContent || message.content) ? 'rtl' : 'ltr';
    const timeLabel = formatTimestamp(message.timestamp);
    const modelInfo = !isUser ? formatModelInfo(message.provider, message.model) : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`flex gap-3 py-2 group ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
        >
            {/* ── Avatar ── */}
            <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center mt-0.5 flex-shrink-0 ${isUser ? 'nd-avatar-user' : isError ? 'nd-avatar-error' : 'nd-avatar-ai'}`}
                style={isError && !message.isError ? { background: 'rgba(239,68,68,0.15)', color: '#f87171' } : {}}
            >
                {isUser
                    ? <User size={14} />
                    : isError ? <AlertTriangle size={14} />
                    : <Sparkles size={14} />
                }
            </div>

            {/* ── Bubble + Meta ── */}
            <div
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                style={{ maxWidth: isUser ? '70%' : '75%' }}
            >
                {/* Sender label */}
                <span
                    className="text-[9px] font-black uppercase tracking-widest px-1 mb-1"
                    style={{ color: isError ? '#f97316' : 'var(--text-muted)' }}
                >
                    {isUser ? 'You' : isError ? 'Error' : 'Nexus AI'}
                </span>

                {/* Content bubble */}
                <div
                    className={isUser ? 'nd-bubble-user' : 'nd-bubble-ai'}
                    style={{
                        padding: '12px 16px',
                        lineHeight: 1.6,
                        fontSize: 'var(--chat-font-size, 14px)',
                        ...(isError ? {
                            borderLeft: '3px solid #ff4444',
                            background: '#1a0808',
                        } : {})
                    }}
                    dir={textDir}
                >
                    {isUser ? (
                        <span className="whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                            {message.content}
                        </span>
                    ) : (
                        <div>
                            {/* Thinking accordion — ABOVE the answer */}
                            {thinking && (
                                <ThinkingAccordion
                                    thinking={thinking}
                                    isStreaming={thinkStreaming && !message.done}
                                />
                            )}
                            <ReactMarkdown components={markdownRenderers}>
                                {isEmptyDone ? displayContent : (answer || (!thinking ? message.content : ''))}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>

                {/* Timestamp + model — always visible below bubble */}
                <div
                    className={`flex items-center gap-2 mt-1 px-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                    style={{ color: '#4a5568', fontSize: '11px' }}
                >
                    {timeLabel && <span className="font-mono">{timeLabel}</span>}
                    {modelInfo && (
                        <span
                            className="truncate"
                            style={{ maxWidth: '220px', color: '#4a5568' }}
                            title={modelInfo}
                        >
                            {modelInfo}
                        </span>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
