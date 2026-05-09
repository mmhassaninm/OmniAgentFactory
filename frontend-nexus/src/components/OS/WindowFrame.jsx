import React, { useRef, useState, useEffect } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { X, Minus, Maximize2, Minimize2 } from 'lucide-react';
import { useOSStore } from '../../store/osStore';
import NetGuardModal from '../Apps/NetGuardModal';
import SecureVault from '../Apps/SecureVault';
import Settings from '../Apps/Settings';
import SystemMonitor from '../Apps/SystemMonitor';
import AdminPanel from '../Apps/AdminPanel';
import NexusForge from '../Apps/NexusForge';
import AnimusDashboard from '../Apps/AnimusDashboard';
import ArchitectWidget from '../Apps/ArchitectWidget';
import PantheonGallery from '../Apps/PantheonGallery';
import NexusBrowser from '../Apps/NexusBrowser';
import FileExplorer from '../Apps/FileExplorer';
import NexusAiControl from '../Apps/NexusAiControl';
import EventViewerApp from '../Apps/EventViewerApp';
import NeuralHubApp from '../Apps/NeuralHubApp';
import AuraCustomizer from '../Apps/AuraCustomizer';
import MediaEngine from '../Apps/MediaEngine';
import CortexAI from '../Apps/CortexAI';
import NexusCode from '../Apps/NexusCode';
import NexusIdentityShield from '../Apps/NexusIdentityShield';
import NexusVaultBackup from '../Apps/NexusVaultBackup';
import NexusCodex from '../Apps/NexusCodex';
import NexusSmartTranslator from '../Apps/NexusSmartTranslator';
import NeuralForgeApp from '../Apps/NeuralForgeApp';
import TerminalApp from '../Apps/TerminalApp';

export default function WindowFrame({ app }) {
    const { closeApp, focusApp, activeAppId, systemLanguage } = useOSStore();
    const isRtl = systemLanguage === 'ar';
    const isActive = activeAppId === app.id;
    const windowRef = useRef(null);
    const controls = useAnimationControls();

    const [isMaximized, setIsMaximized] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);

    // Default window dimensions and position
    const [bounds, setBounds] = useState({
        width: 800,
        height: 600,
        x: Math.random() * 100 + 50,
        y: Math.random() * 50 + 50
    });

    useEffect(() => {
        // Handle z-indexing and animation on mount
        controls.start({ opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 350, damping: 25 } });
    }, [controls]);

    const handleMinimize = (e) => {
        e.stopPropagation();
        setIsMinimized(true);
    };

    const handleMaximize = (e) => {
        e.stopPropagation();
        setIsMaximized(!isMaximized);
    };

    const handleClose = (e) => {
        e.stopPropagation();
        controls.start({ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }).then(() => {
            closeApp(app.id);
        });
    };

    // If completely minimized (e.g. click from taskbar hides it), we wouldn't render the body
    // However, the OS Store just keeps it open. A true minimize might just hide CSS visiblity.
    if (isMinimized) {
        // When clicking taskbar icon while minimized, we'll restore it
        if (isActive) setIsMinimized(false);
        else return null;
    }

    return (
        <motion.div
            dir="ltr"
            ref={windowRef}
            drag={!isMaximized}
            dragMomentum={false}
            dragElastic={0.05}
            whileDrag={{ scale: 1.01, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)' }}
            dragTransition={{ bounceStiffness: 400, bounceDamping: 20 }}
            // Add a constraint box if needed, or window bounds
            dragConstraints={{ top: 0, left: 0, right: window.innerWidth - bounds.width, bottom: window.innerHeight - bounds.height - 50 }}
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={controls}
            onPointerDown={() => focusApp(app.id)}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: isMaximized ? '100vw' : bounds.width,
                height: isMaximized ? 'calc(100vh - 56px)' : bounds.height, // 56px taskbar height
                x: isMaximized ? 0 : bounds.x,
                y: isMaximized ? 0 : bounds.y,
                zIndex: app.zIndex + (isActive ? 100 : 0)
            }}
            className={`flex flex-col overflow-hidden transition-shadow duration-300 pointer-events-auto
                ${isMaximized ? 'rounded-none border-0' : 'rounded-2xl border-white/10'}
                ${isActive ? 'glass-panel-premium shadow-[0_0_50px_rgba(0,243,255,0.1)] ring-1 ring-cyan-500/30 bg-glass-dark' : 'bg-glass-base border border-white/5 shadow-glass-md backdrop-blur-glass-heavy opacity-95'}
            `}
        >
            <div dir={isRtl ? 'rtl' : 'ltr'} className="flex flex-col w-full h-full relative">
                {/* Title Bar - Drag Handle */}
                <div
                    className={`h-11 flex items-center justify-between px-4 select-none flex-shrink-0 cursor-default relative z-10 border-b border-white/5 ${isRtl ? 'flex-row-reverse' : ''}
                    ${!isMaximized && 'cursor-grab active:cursor-grabbing'}
                    ${isActive ? 'bg-gradient-to-r from-white/10 to-transparent' : 'bg-black/30'}
                `}
                    onDoubleClick={handleMaximize}
                >
                    <div className={`flex items-center gap-2 overflow-hidden ${isRtl ? 'flex-row-reverse' : ''}`}>
                        {/* Cyan Icon Indicator */}
                        <div className={`w-4 h-4 rounded flex items-center justify-center ${isActive ? 'bg-cyan-500/20' : 'bg-white/5'}`}>
                            <div className={`w-2 h-2 rounded-sm ${isActive ? 'bg-cyan-400' : 'bg-gray-500'}`}></div>
                        </div>
                        <span className={`text-xs font-bold uppercase tracking-wider truncate ${isActive ? 'text-slate-200' : 'text-gray-500'} ${isRtl ? 'text-right' : 'text-left'}`}>
                            {app.title}
                        </span>
                    </div>

                    {/* Window Controls */}
                    <div className={`flex items-center gap-1.5 ${isRtl ? 'mr-2' : 'ml-2'}`}>
                        <button
                            onClick={handleMinimize}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        >
                            <Minus className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleMaximize}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        >
                            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={handleClose}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/80 text-gray-400 hover:text-white transition-colors group"
                        >
                            <X className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        </button>
                    </div>
                </div>

                {/* App Content Area */}
                <div className="flex-1 bg-black/40 relative overflow-hidden">
                    {/* Dynamically render content based on app.id */}
                    {app.id === 'agent-factory' ? (
                        <iframe src="http://localhost:5173/" className="w-full h-full border-0 bg-transparent" title="Agent Factory" />
                    ) : app.id === 'key-vault' ? (
                        <iframe src="http://localhost:5173/key-vault" className="w-full h-full border-0 bg-transparent" title="Key Vault" />
                    ) : app.id === 'autonomous-mode' ? (
                        <iframe src="http://localhost:5173/factory" className="w-full h-full border-0 bg-transparent" title="Autonomous Mode" />
                    ) : app.id === 'egyptian-chatbot' ? (
                        <iframe src="http://localhost:5173/agent/egyptian/chat" className="w-full h-full border-0 bg-transparent" title="Egyptian Chatbot" />
                    ) : app.id === 'agent-manager' ? (
                        <iframe src="http://localhost:5173/settings" className="w-full h-full border-0 bg-transparent" title="Agent Manager" />
                    ) : app.id === 'monitor' ? (
                        <SystemMonitor />
                    ) : app.id === 'terminal' ? (
                        <TerminalApp />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                            <div className="text-4xl mb-4 opacity-50">🧭</div>
                            <p>NexusOS {app.title}</p>
                            <p className="text-xs mt-2 opacity-50">Feature Link Under Construction</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Simulated Resize Handles (Visual only for now, framer-motion drag handles bounds) */}
            {!isMaximized && (
                <>
                    <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-50"></div>
                    <div className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize z-50"></div>
                    <div className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize z-50"></div>
                </>
            )}
        </motion.div>
    );
}
