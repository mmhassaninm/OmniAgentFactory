import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Globe, ArrowRight, RefreshCw, Lock, ExternalLink, Home, Search, Star, MoveLeft, MoveRight } from 'lucide-react';
import { motion } from 'framer-motion';

const HOME_URL = 'https://duckduckgo.com/?kae=d&kak=-1&kao=-1&k1=-1';
const SEARCH_PREFIX = 'https://duckduckgo.com/?q=';

const QUICK_LINKS = [
    { name: 'Google', url: 'https://www.google.com/', icon: '🔍' },
    { name: 'YouTube', url: 'https://www.youtube.com/', icon: '▶️' },
    { name: 'Wikipedia', url: 'https://en.wikipedia.org/', icon: '📚' },
    { name: 'GitHub', url: 'https://github.com/', icon: '🐙' },
    { name: 'Nexus Docs', url: 'https://developer.mozilla.org/', icon: '📖' },
];

export default function NexusBrowser() {
    const [url, setUrl] = useState(HOME_URL);
    const [addressBar, setAddressBar] = useState('');
    const [displayUrl, setDisplayUrl] = useState('Nexus Surf — Secure');
    const [loading, setLoading] = useState(false);
    const webviewRef = useRef(null);

    const navigate = useCallback((target) => {
        let finalUrl = target.trim();
        if (!finalUrl) return;

        // If no protocol and no dots, treat as search query
        if (!/^https?:\/\//i.test(finalUrl) && !finalUrl.includes('.')) {
            finalUrl = SEARCH_PREFIX + encodeURIComponent(finalUrl);
        } else if (!/^https?:\/\//i.test(finalUrl)) {
            finalUrl = 'https://' + finalUrl;
        }

        setUrl(finalUrl);
        setDisplayUrl(finalUrl);
        setLoading(true);
    }, []);

    const handleGo = (e) => {
        e?.preventDefault();
        navigate(addressBar);
    };

    const handleHome = () => {
        setUrl(HOME_URL);
        setAddressBar('');
        setDisplayUrl('Nexus Surf — Dashboard');
        setLoading(true);
    };

    const handleReload = () => {
        setLoading(true);
        if (webviewRef.current) {
            webviewRef.current.reload();
        }
    };

    const handleBack = () => {
        if (webviewRef.current && webviewRef.current.canGoBack()) {
            webviewRef.current.goBack();
        }
    };

    const handleForward = () => {
        if (webviewRef.current && webviewRef.current.canGoForward()) {
            webviewRef.current.goForward();
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleGo();
        }
    };

    useEffect(() => {
        const wv = webviewRef.current;
        if (!wv) return;

        const onStartLoad = () => setLoading(true);
        const onStopLoad = () => setLoading(false);
        const onNavigate = (e) => {
            setDisplayUrl(e.url);
            setAddressBar(e.url);
        };

        wv.addEventListener('did-start-loading', onStartLoad);
        wv.addEventListener('did-stop-loading', onStopLoad);
        wv.addEventListener('did-navigate', onNavigate);
        wv.addEventListener('did-navigate-in-page', onNavigate);
        wv.addEventListener('page-title-updated', (e) => {
            if (e.title) setDisplayUrl(`${e.title} — ${wv.getURL()}`);
        });

        return () => {
            wv.removeEventListener('did-start-loading', onStartLoad);
            wv.removeEventListener('did-stop-loading', onStopLoad);
            wv.removeEventListener('did-navigate', onNavigate);
            wv.removeEventListener('did-navigate-in-page', onNavigate);
        };
    }, [url]);

    // Check if we are running in Electron where <webview> is supported
    const isElectron = window.nexusAPI !== undefined;

    return (
        <div className="flex flex-col h-full w-full bg-[#050510] text-white overflow-hidden rounded-b-xl">
            {/* Ultra-Premium Glass Address Bar */}
            <div className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border-b border-white/10 backdrop-blur-xl">
                {/* Navigation Controls */}
                <button onClick={handleBack} className="p-1.5 rounded-lg hover:bg-white/10 transition-all text-slate-400 hover:text-cyan-400 group" title="Back">
                    <MoveLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                </button>
                <button onClick={handleForward} className="p-1.5 rounded-lg hover:bg-white/10 transition-all text-slate-400 hover:text-cyan-400 group" title="Forward">
                    <MoveRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button onClick={handleReload} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-cyan-400" title="Reload">
                    <RefreshCw size={14} className={loading ? 'animate-spin text-cyan-400' : ''} />
                </button>
                <button onClick={handleHome} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-cyan-400" title="Home">
                    <Home size={16} />
                </button>

                {/* Cyberpunk URL Input */}
                <div className="flex-1 flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 focus-within:border-cyan-500/50 focus-within:shadow-[0_0_15px_rgba(6,182,212,0.2)] transition-all relative overflow-hidden">
                    <Search size={14} className="text-cyan-500/50 shrink-0" />
                    <input
                        type="text"
                        value={addressBar}
                        onChange={(e) => setAddressBar(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search or enter URL..."
                        className="flex-1 bg-transparent text-xs text-cyan-100 placeholder-slate-600 outline-none font-mono"
                    />
                    {/* Inner glowing edge */}
                    <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent pointer-events-none"></div>
                </div>

                {/* Go Button */}
                <button
                    onClick={handleGo}
                    className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-bold transition-all hover:shadow-[0_0_10px_rgba(6,182,212,0.4)]"
                    title="Navigate"
                >
                    <ArrowRight size={14} />
                </button>
            </div>

            {/* Quick Links Sub-bar */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border-b border-white/5 overflow-x-auto custom-scrollbar">
                <Star size={12} className="text-yellow-500 shrink-0" />
                {QUICK_LINKS.map(link => (
                    <button
                        key={link.name}
                        onClick={() => navigate(link.url)}
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] text-slate-400 hover:text-cyan-300 hover:bg-white/5 border border-transparent hover:border-white/10 transition-all shrink-0 font-medium"
                    >
                        <span>{link.icon}</span>
                        {link.name}
                    </button>
                ))}

                <div className="ml-auto flex items-center gap-2 text-[10px] font-mono opacity-60">
                    <Lock size={10} className="text-emerald-400" />
                    <span className="text-emerald-400">{displayUrl}</span>
                </div>
            </div>

            {/* Loading Progress Bar */}
            <div className="h-[2px] w-full bg-black/50 overflow-hidden relative">
                {loading && (
                    <motion.div
                        initial={{ width: '0%', opacity: 1 }}
                        animate={{ width: '100%', opacity: 1 }}
                        transition={{ duration: 1.5, ease: "linear", repeat: Infinity }}
                        className="absolute h-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 shadow-[0_0_10px_#00f3ff]"
                    />
                )}
            </div>

            {/* Web Content Area */}
            <div className="flex-1 relative bg-white overflow-hidden">
                {isElectron ? (
                    <webview
                        ref={webviewRef}
                        src={url}
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        allowpopups="true"
                    />
                ) : (
                    <iframe
                        src={url}
                        title="Nexus Web Engine"
                        className="w-full h-full border-0"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                        onLoad={() => setLoading(false)}
                        onError={() => setLoading(false)}
                    />
                )}

                {/* Fallback Overlay for Browser Mode if iframe is blocked */}
                {!isElectron && (
                    <div className="absolute bottom-4 right-4 bg-black/80 backdrop-blur-md border border-amber-500/50 p-4 rounded-xl shadow-2xl max-w-sm pointer-events-none z-50">
                        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm mb-1">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                            </span>
                            Web Mode Detected
                        </div>
                        <p className="text-xs text-slate-300">
                            Some sites (like Google or YouTube) block iframes. To experience unrestricted browsing, launch NexusOS via the Native Electron App using `npm run start`.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
