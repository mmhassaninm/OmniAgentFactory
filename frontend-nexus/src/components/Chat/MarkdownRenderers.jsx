import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// ═══════════════════════════════════════════════════
//  CODE BLOCK — Glassmorphism + Syntax Highlighting
// ═══════════════════════════════════════════════════
export function NexusCodeBlock({ node, inline, className, children, ...props }) {
    const [copied, setCopied] = useState(false);
    const lang = /language-(\w+)/.exec(className || '')?.[1];

    async function handleCopy() {
        await navigator.clipboard.writeText(String(children));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    if (inline) {
        return (
            <code className="px-1.5 py-0.5 rounded-md text-[13px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20" {...props}>
                {children}
            </code>
        );
    }

    return (
        <div className="relative my-3 rounded-xl overflow-hidden border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between px-4 py-2 bg-black/60 border-b border-white/5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-500/70 font-bold">
                    {lang || 'code'}
                </span>
                <button onClick={handleCopy} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all hover:bg-white/10"
                    style={{ color: copied ? '#10b981' : '#64748b' }}>
                    {copied ? <Check size={11} /> : <Copy size={11} />}
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            </div>
            <SyntaxHighlighter language={lang || 'text'} style={oneDark}
                customStyle={{ margin: 0, padding: '16px 20px', background: 'rgba(0,0,0,0.40)', fontSize: '12.5px', lineHeight: '1.65', borderRadius: 0 }}
                showLineNumbers={true} lineNumberStyle={{ color: '#334155', fontSize: '10px', paddingRight: '16px' }}
                {...props}>
                {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
        </div>
    );
}

// ── Markdown Renderers ──
export const markdownRenderers = {
    code: NexusCodeBlock,
    p: ({ children }) => <p className="my-1.5 leading-relaxed text-slate-300 text-[13.5px]">{children}</p>,
    ul: ({ children }) => <ul className="my-2 pl-5 text-slate-300 list-disc space-y-1 text-[13.5px]">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 pl-5 text-slate-300 list-decimal space-y-1 text-[13.5px]">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    h1: ({ children }) => <h1 className="text-lg font-black text-white mt-4 mb-2 tracking-wide">{children}</h1>,
    h2: ({ children }) => <h2 className="text-[15px] font-bold text-white mt-3 mb-1.5">{children}</h2>,
    h3: ({ children }) => <h3 className="text-[14px] font-semibold text-white mt-2 mb-1">{children}</h3>,
    strong: ({ children }) => <strong className="font-bold text-cyan-200">{children}</strong>,
    em: ({ children }) => <em className="italic text-slate-400">{children}</em>,
    a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300 transition-colors">
            {children}
        </a>
    ),
    blockquote: ({ children }) => (
        <blockquote className="my-3 px-4 py-2 border-l-2 border-cyan-500/50 bg-cyan-500/5 rounded-r-lg text-slate-400 italic text-[13px]">
            {children}
        </blockquote>
    ),
    hr: () => <hr className="my-4 border-white/5" />,
    table: ({ children }) => (
        <div className="my-3 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-[12px] text-slate-300">{children}</table>
        </div>
    ),
    th: ({ children }) => <th className="px-3 py-2 text-left bg-black/40 text-cyan-400 font-bold uppercase tracking-wider text-[10px] border-b border-white/10">{children}</th>,
    td: ({ children }) => <td className="px-3 py-2 border-b border-white/5">{children}</td>,
};

// ── Parse <think> tags ──
export function parseThinkContent(text) {
    if (!text) return { reasoning: '', answer: text || '', isStreaming: false };
    const thinkMatch = text.match(/<think>([\s\S]*?)(<\/think>|$)/);
    if (thinkMatch) {
        const reasoning = thinkMatch[1].trim();
        const isStreaming = !text.includes('</think>');
        const answer = text.replace(/<think>[\s\S]*?(<\/think>|$)/, '').trim();
        return { reasoning, answer, isStreaming };
    }
    return { reasoning: '', answer: text, isStreaming: false };
}
