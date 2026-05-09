import { create } from 'zustand';

// Global OS State Management
export const useOSStore = create((set) => ({
    // Core System
    systemLanguage: 'en', // 'en' or 'ar'
    setSystemLanguage: (lang) => set({ systemLanguage: lang }),

    // UI States
    isStartMenuOpen: false,
    toggleStartMenu: () => set((state) => ({ isStartMenuOpen: !state.isStartMenuOpen })),
    closeStartMenu: () => set({ isStartMenuOpen: false }),

    // Window Management
    openApps: [], // { id: 'chat', title: 'Nexus Chat', isActive: true, zIndex: 1 }
    activeAppId: null,

    launchApp: (appId, title) => set((state) => {
        const isAlreadyOpen = state.openApps.find(app => app.id === appId);
        if (isAlreadyOpen) {
            // Just focus it
            return {
                activeAppId: appId,
                openApps: state.openApps.map(app =>
                    app.id === appId ? { ...app, isActive: true } : { ...app, isActive: false }
                ),
                isStartMenuOpen: false
            };
        }

        // Open new instance
        return {
            activeAppId: appId,
            openApps: [...state.openApps, { id: appId, title, isActive: true, zIndex: state.openApps.length + 1 }],
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
}));
