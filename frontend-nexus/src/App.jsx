import React, { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useOSStore } from './store/osStore';
import { useTranslation } from 'react-i18next';
import nexusBridge from './services/bridge.js';

// OS Components
import Taskbar from './components/OS/Taskbar';
import StartMenu from './components/OS/StartMenu';
import WindowFrame from './components/OS/WindowFrame';
import FloatingArchitectWidget from './components/OS/FloatingArchitectWidget';
import ToastManager from './components/OS/ToastManager';
import ThermalAlertListener from './components/OS/ThermalAlertListener';
import ContextMenu from './components/OS/ContextMenu';
import NotificationCenter from './components/OS/NotificationCenter';
import AuraCustomizer from './components/Apps/AuraCustomizer';
import DesktopWidgets from './components/OS/DesktopWidgets';
import AegisLockScreen from './components/OS/AegisLockScreen';
import GhostListener from './components/AI/GhostListener';
import { Terminal, Activity, Settings, Lock, Sparkles, Brain, Globe, Shield, Folder, Image, Palette, Disc3, MessageSquare, FileCode2, LayoutGrid, ArrowDownAZ, ArrowUpAZ, RefreshCw, FolderPlus, Monitor, Brush, Grid3X3, StretchHorizontal, List, SortAsc, BookOpen, ExternalLink, FileText, Trash2 } from 'lucide-react';

const DESKTOP_NODES = [
    { id: 'agent-factory', nameKey: 'Agent Factory', icon: Sparkles, color: 'text-cyan-400' },
    { id: 'key-vault', nameKey: 'Key Vault', icon: Shield, color: 'text-yellow-400' },
    { id: 'autonomous-mode', nameKey: 'Autonomous Mode', icon: Brain, color: 'text-purple-400' },
    { id: 'monitor', nameKey: 'System Monitor', icon: Activity, color: 'text-emerald-400' },
    { id: 'egyptian-chatbot', nameKey: 'Egyptian Chatbot', icon: MessageSquare, color: 'text-blue-400' },
    { id: 'agent-manager', nameKey: 'Agent Manager', icon: Folder, color: 'text-orange-400' },
    { id: 'terminal', nameKey: 'Terminal', icon: Terminal, color: 'text-green-400' },
];

// Icon size presets
const ICON_SIZES = {
    large: { box: 'w-16 h-16', icon: 'w-7 h-7', iconSizeInt: 28, cell: 'w-[100px]', text: 'text-[11px]' },
    medium: { box: 'w-12 h-12', icon: 'w-5 h-5', iconSizeInt: 20, cell: 'w-[86px]', text: 'text-[10px]' },
    small: { box: 'w-9 h-9', icon: 'w-4 h-4', iconSizeInt: 16, cell: 'w-[76px]', text: 'text-[9px]' },
};

const DesktopNode = ({ node, launchApp, t, isSelected, onSelect, size = 'medium' }) => {
    const s = ICON_SIZES[size];
    return (
        <div
            className={`flex flex-col items-center justify-center p-2 rounded-lg cursor-pointer group transition-all duration-150 desktop-node ${s.cell}
                ${isSelected
                    ? 'bg-white/10 ring-1 ring-cyan-500/40'
                    : 'hover:bg-white/[0.04]'
                }`
            }
            onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
            onDoubleClick={() => launchApp(node.id, t(node.nameKey))}
            data-id={node.id}
            data-name={t(node.nameKey)}
        >
            <div className={`${s.box} rounded-xl bg-black/20 border border-white/[0.06] flex items-center justify-center mb-1.5 shadow-lg group-hover:shadow-[0_0_20px_rgba(255,255,255,0.08)] group-hover:border-white/15 transition-all ${node.color} relative overflow-hidden`}>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-15 transition-opacity bg-current" style={{ filter: 'blur(8px)' }}></div>
                <node.icon className={`${s.icon} drop-shadow-[0_0_6px_currentColor] relative z-10 transition-transform group-hover:scale-110`} />
            </div>
            <span className={`${s.text} font-medium text-gray-300 text-center drop-shadow-md group-hover:text-white transition-colors leading-tight max-w-full truncate`}>
                {t(node.nameKey)}
            </span>
        </div>
    );
};

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];

function IconRenderer({ item, size = 20, isShortcut = false }) {
    const [thumb, setThumb] = React.useState(null);
    const isImage = item.extension && IMAGE_EXTENSIONS.includes(item.extension.toLowerCase());

    React.useEffect(() => {
        if (isImage && item.path) {
            nexusBridge.invoke('fs:read', item.path, 'base64').then(res => {
                if (typeof res === 'string' && res.startsWith('data:image')) {
                    setThumb(res);
                }
            }).catch(err => console.error('Thumb error:', err));
        }
    }, [item.path, isImage]);

    if (thumb) {
        return (
            <div className="relative group/thumb">
                <img
                    src={thumb}
                    alt=""
                    className="object-cover rounded shadow-lg transition-transform group-hover/thumb:scale-105"
                    style={{ width: size, height: size }}
                />
                {isShortcut && (
                    <div className="absolute bottom-0 left-0 w-3 h-3 bg-black/70 rounded-tr-sm flex items-center justify-center border-t border-r border-white/20">
                        <ExternalLink size={6} className="text-cyan-400" />
                    </div>
                )}
            </div>
        );
    }

    const IconComp = item.isDirectory ? Folder : (isImage ? Image : FileText);
    const iconColor = item.isDirectory ? 'text-cyan-400' : 'text-slate-400';

    return (
        <div className="relative">
            <IconComp size={size} className={`${iconColor} drop-shadow-[0_0_6px_currentColor]`} />
            {isShortcut && (
                <div className="absolute bottom-0 left-0 w-4 h-4 bg-black/70 rounded-tr-md flex items-center justify-center border-t border-r border-white/20">
                    <ExternalLink size={8} className="text-cyan-400" />
                </div>
            )}
        </div>
    );
}

export default function App() {
    const { isAuthenticated, openApps, closeStartMenu, systemLanguage, launchApp, auraColor, setTheme, desktopShortcuts, addDesktopShortcut, removeDesktopShortcut } = useOSStore();
    const { t, i18n } = useTranslation();
    const [contextMenu, setContextMenu] = useState({ isOpen: false, x: 0, y: 0, options: [] });
    const [iconSize, setIconSize] = useState('medium'); // large, medium, small
    const [selectedNode, setSelectedNode] = useState(null);
    const [sortBy, setSortBy] = useState('default'); // default, name, type

    // Sync language direction with i18n
    useEffect(() => {
        document.documentElement.dir = systemLanguage === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.lang = systemLanguage;
        // Apply Aura Theme to DOM
        document.documentElement.setAttribute('data-aura', auraColor);

        if (i18n.language !== systemLanguage) {
            i18n.changeLanguage(systemLanguage);
        }
    }, [systemLanguage, auraColor]);

    // Sync language state with Main process
    useEffect(() => {
        nexusBridge.invoke('os:change-language', systemLanguage)
            .catch(err => console.warn('Failed to sync OS Language:', err));

        if (window.nexusAPI && window.nexusAPI.receive) {
            const unsubFocus = window.nexusAPI.receive('os:focus-app', (appId) => {
                useOSStore.getState().focusApp(appId);
            });

            // Phase 69b: Listen for tray-driven app launches
            const unsubLaunch = window.nexusAPI.receive('os:launch', (payload) => {
                if (payload && payload.id) {
                    useOSStore.getState().launchApp(payload.id, payload.title || payload.id, payload.context);
                }
            });

            return () => {
                if (unsubFocus) unsubFocus();
                if (unsubLaunch) unsubLaunch();
            };
        }
    }, [systemLanguage]);

    // ── Phase 65: AuraManager — Dynamic Aesthetic Synchronization ──
    useEffect(() => {
        const updateAura = () => {
            const hour = new Date().getHours();
            const root = document.documentElement;

            // 1. Time-of-Day Context (Ambient Opacity)
            // Day (6 AM - 6 PM): Higher opacity/vibrancy
            // Night (6 PM - 6 AM): Lower opacity/deep focus
            const isNight = hour >= 18 || hour < 6;
            root.style.setProperty('--aura-opacity', isNight ? '0.12' : '0.22');
            root.style.setProperty('--aura-pulse-speed', isNight ? '12s' : '8s');

            // 2. Health Context (Aura Color Injection)
            // We read the System Pulse status (Mocked for now as passing, 
            // but preparing for bridge.invoke('os:get-health'))
            const systemHealth = 'stable'; // Default pulse

            if (systemHealth === 'stable') {
                root.style.setProperty('--aura-primary', 'var(--neon-primary)');
                root.style.setProperty('--aura-glow', 'var(--neon-glow)');
            } else {
                root.style.setProperty('--aura-primary', '#f43f5e'); // Rose (Threat)
                root.style.setProperty('--aura-glow', 'rgba(244, 63, 94, 0.4)');
            }
        };

        updateAura();
        const interval = setInterval(updateAura, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [auraColor]);

    // Sort nodes
    const getSortedNodes = () => {
        const nodes = [...DESKTOP_NODES];
        if (sortBy === 'name') nodes.sort((a, b) => t(a.nameKey).localeCompare(t(b.nameKey)));
        return nodes;
    };

    const handleContextMenu = (e) => {
        e.preventDefault();
        // Close Start Menu when right-clicking
        closeStartMenu();

        const clickedNode = e.target.closest('.desktop-node');
        const clickedWindow = e.target.closest('.react-draggable');

        let options = [];

        if (clickedNode) {
            // ── Context Menu for Desktop Icons ──
            const nodeId = clickedNode.getAttribute('data-id');
            const nodeName = clickedNode.getAttribute('data-name');
            const shortcutPath = clickedNode.getAttribute('data-shortcut-path');

            options = [
                {
                    label: t('context.open', { defaultValue: 'Open' }) + ' ' + nodeName, icon: Sparkles, action: () => {
                        if (shortcutPath) {
                            launchApp('explorer', nodeName, { initialPath: shortcutPath });
                        } else {
                            launchApp(nodeId, nodeName);
                        }
                    }
                },
                { divider: true },
                { label: t('context.metadata', { defaultValue: 'Properties' }), icon: Brain, action: () => console.log('Properties:', nodeName) },
            ];

            // Add "Remove Shortcut" option for user-created shortcuts
            if (shortcutPath) {
                options.push({ divider: true });
                options.push({ label: 'Remove Shortcut', icon: Trash2, action: () => removeDesktopShortcut(nodeId), color: 'text-red-400' });
            }
        } else if (!clickedWindow) {
            // ── Windows-style Desktop Context Menu ──
            options = [
                {
                    label: t('context.view', { defaultValue: 'View' }),
                    icon: LayoutGrid,
                    submenu: [
                        { label: t('context.large_icons', { defaultValue: 'Large icons' }), icon: Grid3X3, active: iconSize === 'large', action: () => setIconSize('large') },
                        { label: t('context.medium_icons', { defaultValue: 'Medium icons' }), icon: StretchHorizontal, active: iconSize === 'medium', action: () => setIconSize('medium') },
                        { label: t('context.small_icons', { defaultValue: 'Small icons' }), icon: List, active: iconSize === 'small', action: () => setIconSize('small') },
                    ],
                    action: () => { }
                },
                {
                    label: t('context.sort_by', { defaultValue: 'Sort by' }),
                    icon: SortAsc,
                    submenu: [
                        { label: t('context.sort_default', { defaultValue: 'Default' }), active: sortBy === 'default', action: () => setSortBy('default') },
                        { label: t('context.sort_name', { defaultValue: 'Name' }), icon: ArrowDownAZ, active: sortBy === 'name', action: () => setSortBy('name') },
                    ],
                    action: () => { }
                },
                { divider: true },
                { label: t('context.refresh', { defaultValue: 'Refresh' }), icon: RefreshCw, action: () => window.location.reload(), shortcut: 'F5' },
                { divider: true },
                { label: t('context.new_folder', { defaultValue: 'New Folder' }), icon: FolderPlus, action: () => launchApp('explorer', t('apps.explorer')) },
                { label: t('context.open_terminal', { defaultValue: 'Open Terminal' }), icon: Terminal, action: () => launchApp('terminal', t('apps.terminal')), shortcut: 'Ctrl+T' },
                { divider: true },
                { label: t('context.display_settings', { defaultValue: 'Display Settings' }), icon: Monitor, action: () => launchApp('settings', t('apps.settings')) },
                {
                    label: t('context.personalize', { defaultValue: 'Personalize' }),
                    icon: Brush,
                    action: () => launchApp('aura', t('apps.aura'))
                },
            ];

            // Lock Terminal option
            if (isAuthenticated) {
                options.push({ divider: true });
                options.push({ label: t('context.lock', { defaultValue: 'Lock Terminal' }), icon: Lock, action: () => useOSStore.getState().logout(), color: 'text-red-400' });
            }
        } else {
            return; // Don't show context menu on windows
        }

        if (options.length > 0) {
            setContextMenu({
                isOpen: true,
                x: e.clientX,
                y: e.clientY,
                options
            });
        }
    };

    const closeContextMenu = () => {
        setContextMenu(prev => ({ ...prev, isOpen: false }));
    };

    const handleDesktopClick = () => {
        closeStartMenu();
        setSelectedNode(null);
        closeContextMenu();
    };

    // ── Desktop Drop Zone (Phase 67) ──
    const handleDesktopDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'link';
    };

    const handleDesktopDrop = (e) => {
        e.preventDefault();
        try {
            const raw = e.dataTransfer.getData('application/nexus-file');
            if (!raw) return;
            const fileData = JSON.parse(raw);
            addDesktopShortcut({
                name: fileData.name,
                path: fileData.path,
                isDirectory: fileData.isDirectory,
                extension: fileData.extension || '',
            });
        } catch (err) {
            console.error('[Desktop] Drop error:', err);
        }
    };

    return (
        <div
            className="h-screen w-screen overflow-hidden bg-[#020617] relative select-none cursor-default font-sans"
            onClick={handleDesktopClick}
            onContextMenu={handleContextMenu}
        >
            {/* Wallpaper Layer */}
            <div className="absolute inset-0 nexus-wallpaper pointer-events-none"></div>

            {/* Desktop UI conditionally rendered if Authenticated */}
            <AnimatePresence>
                {!isAuthenticated && (
                    <div className="absolute inset-0 z-[200]">
                        <AegisLockScreen />
                    </div>
                )}
            </AnimatePresence>

            {/* Hyper-Evolved Widgets Layer */}
            <DesktopWidgets />

            {/* Desktop Nodes Layer — Windows-style grid: columns top-to-bottom, left-to-right */}
            <div className="absolute inset-0 z-10 p-6 pb-20 pointer-events-none text-white">
                <div
                    className="pointer-events-auto h-full w-full"
                    style={{
                        display: 'grid',
                        gridAutoFlow: 'column',
                        gridTemplateRows: `repeat(auto-fill, ${iconSize === 'large' ? '110px' : iconSize === 'medium' ? '95px' : '80px'})`,
                        gridAutoColumns: iconSize === 'large' ? '105px' : iconSize === 'medium' ? '92px' : '82px',
                        gap: '4px',
                        alignContent: 'start',
                    }}
                    onContextMenu={handleContextMenu}
                    onDragOver={handleDesktopDragOver}
                    onDrop={handleDesktopDrop}
                >
                    {getSortedNodes().map(node => (
                        <DesktopNode
                            key={node.id}
                            node={node}
                            launchApp={launchApp}
                            t={t}
                            isSelected={selectedNode === node.id}
                            onSelect={setSelectedNode}
                            size={iconSize}
                        />
                    ))}
                    {/* ── Desktop Shortcuts (Phase 67) ── */}
                    {desktopShortcuts.map(shortcut => {
                        const s = ICON_SIZES[iconSize];
                        return (
                            <div
                                key={shortcut.id}
                                className={`flex flex-col items-center justify-center p-2 rounded-lg cursor-pointer group transition-all duration-150 desktop-node ${s.cell}
                                    ${selectedNode === shortcut.id ? 'bg-white/10 ring-1 ring-cyan-500/40' : 'hover:bg-white/[0.04]'}`}
                                onClick={(e) => { e.stopPropagation(); setSelectedNode(shortcut.id); }}
                                onDoubleClick={() => launchApp('explorer', shortcut.name, { initialPath: shortcut.path })}
                                data-id={shortcut.id}
                                data-name={shortcut.name}
                                data-shortcut-path={shortcut.path}
                            >
                                <div className={`${s.box} rounded-xl bg-black/20 border border-white/[0.06] flex items-center justify-center mb-1.5 shadow-lg group-hover:shadow-[0_0_20px_rgba(255,255,255,0.08)] group-hover:border-white/15 transition-all relative overflow-hidden`}>
                                    <div className="absolute inset-0 opacity-0 group-hover:opacity-15 transition-opacity bg-current" style={{ filter: 'blur(8px)' }}></div>
                                    <IconRenderer item={shortcut} size={s.iconSizeInt || 32} isShortcut={true} />
                                </div>
                                <span className={`${s.text} font-medium text-gray-300 text-center drop-shadow-md group-hover:text-white transition-colors leading-tight max-w-full truncate`}>
                                    {shortcut.name}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>


            {/* Window Layer (Floating App Windows) */}
            <div className="absolute inset-0 z-20 overflow-hidden pointer-events-none">
                <AnimatePresence>
                    {openApps.map(app => (
                        <div key={app.id} className="pointer-events-none absolute inset-0">
                            <WindowFrame app={app} />
                        </div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Floating Architect Widget (Proactive AI Overlay) */}
            <div className="absolute inset-0 z-30 pointer-events-none">
                <FloatingArchitectWidget className="pointer-events-auto" />
            </div>

            {/* Global Toast Notification Manager */}
            <div className="fixed inset-0 z-[100] pointer-events-none">
                <ToastManager />
                <NotificationCenter />
            </div>

            {/* Thermal Sentinel Alert Listener (Audio + Toast) */}
            <ThermalAlertListener />

            {/* Ghost Developer (Vision AI) Background Service Listener */}
            <GhostListener />

            {/* Start Menu Overlay */}
            <div className="absolute inset-0 z-40 pointer-events-none">
                <StartMenu />
            </div>

            {/* Taskbar (Always on top) */}
            <div className="absolute inset-x-0 bottom-0 z-50 pointer-events-none">
                <div className="pointer-events-auto text-white">
                    <Taskbar />
                </div>
            </div>

            {/* Global Context Menu — fixed positioning for correct z-index stacking */}
            <AnimatePresence>
                {contextMenu.isOpen && (
                    <ContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        options={contextMenu.options}
                        onClose={closeContextMenu}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
