import { create } from 'zustand';

// Global OS State Management
export const useOSStore = create((set) => ({
    // Core System
    systemLanguage: 'en', // 'en' or 'ar'
    setSystemLanguage: (lang) => set({ systemLanguage: lang }),

    // AI Models
    activeModel: null,
    availableModels: [],
    fetchModels: async () => {
        try {
            const res = await fetch('http://127.0.0.1:1234/v1/models');
            if (res.ok) {
                const data = await res.json();
                const filtered = data.data.filter(m => m.id !== 'text-embedding-bge-m3');
                set({
                    availableModels: filtered,
                    activeModel: filtered.length > 0 ? filtered[0].id : null
                });
            }
        } catch (e) {
            console.warn('[OSStore] Failed to sync models from LM Studio:', e.message);
        }
    },
    setActiveModel: (modelId) => set({ activeModel: modelId }),

    // Security & Aura
    securityLevel: 'standard', // 'standard', 'secure', 'ghost'
    setSecurityLevel: (level) => set({ securityLevel: level }),

    // Personalization & Themes
    theme: 'dark', // 'dark', 'light', 'glass', 'matrix', 'blood', 'frost'
    auraColor: 'cyan', // 'cyan', 'purple', 'emerald', 'rose', 'amber'
    setTheme: (theme) => set({ theme }),
    setAuraColor: (color) => set({ auraColor: color }),

    // UI States
    isAuthenticated: true,
    agentId: 'Admin',
    login: (id) => set({ isAuthenticated: true, agentId: id }),
    logout: () => set({ isAuthenticated: false, agentId: null, openApps: [], activeAppId: null }),

    isStartMenuOpen: false,
    isNotifCenterOpen: false,
    toggleStartMenu: () => set((state) => ({ isStartMenuOpen: !state.isStartMenuOpen, isNotifCenterOpen: false })),
    closeStartMenu: () => set({ isStartMenuOpen: false }),
    toggleNotifCenter: () => set((state) => ({ isNotifCenterOpen: !state.isNotifCenterOpen, isStartMenuOpen: false })),
    closeNotifCenter: () => set({ isNotifCenterOpen: false }),

    // Window Management
    openApps: [], // { id: 'chat', title: 'Nexus Chat', isActive: true, zIndex: 1 }
    activeAppId: null,

    // Notification System
    notifications: [],
    addNotification: (notif) => set((state) => ({
        notifications: [
            { ...notif, id: Date.now() + Math.random(), timestamp: new Date() },
            ...state.notifications
        ].slice(0, 50) // Keep last 50
    })),
    clearNotifications: () => set({ notifications: [] }),
    removeNotification: (id) => set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id)
    })),

    launchApp: (appId, title, context = null) => set((state) => {
        const isAlreadyOpen = state.openApps.find(app => app.id === appId);
        if (isAlreadyOpen) {
            // Just focus it
            return {
                activeAppId: appId,
                openApps: state.openApps.map(app =>
                    app.id === appId ? { ...app, isActive: true, context: context || app.context } : { ...app, isActive: false }
                ),
                isStartMenuOpen: false
            };
        }

        // Open new instance
        return {
            activeAppId: appId,
            openApps: [...state.openApps, { id: appId, title, isActive: true, zIndex: state.openApps.length + 1, context }],
            isStartMenuOpen: false
        };
    }),

    focusApp: (appId) => set((state) => ({
        activeAppId: appId,
        openApps: state.openApps.map(app =>
            app.id === appId ? { ...app, isActive: true } : { ...app, isActive: false }
        )
    })),

    closeApp: (appId) => set((state) => {
        const remainingApps = state.openApps.filter(app => app.id !== appId);
        return {
            openApps: remainingApps,
            activeAppId: remainingApps.length > 0 ? remainingApps[remainingApps.length - 1].id : null
        };
    }),

    // ── Desktop Shortcuts (Phase 67) ──
    desktopShortcuts: JSON.parse(localStorage.getItem('nexus_desktop_shortcuts') || '[]'),

    addDesktopShortcut: (shortcut) => set((state) => {
        // Prevent duplicates
        if (state.desktopShortcuts.find(s => s.path === shortcut.path)) return state;
        const updated = [...state.desktopShortcuts, { ...shortcut, id: 'shortcut-' + Date.now() }];
        localStorage.setItem('nexus_desktop_shortcuts', JSON.stringify(updated));
        return { desktopShortcuts: updated };
    }),

    removeDesktopShortcut: (id) => set((state) => {
        const updated = state.desktopShortcuts.filter(s => s.id !== id);
        localStorage.setItem('nexus_desktop_shortcuts', JSON.stringify(updated));
        return { desktopShortcuts: updated };
    }),
}));
