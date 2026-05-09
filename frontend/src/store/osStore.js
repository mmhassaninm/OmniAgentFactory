import { create } from 'zustand';
import toastBus from '../services/toastBus';

const BACKEND = 'http://localhost:3001';

// Global OS State Management
export const useOSStore = create((set, get) => ({
    // Core System
    systemLanguage: 'en', // 'en' or 'ar'
    setSystemLanguage: (lang) => set({ systemLanguage: lang }),

    // ── Provider Management ────────────────────────────────────────────────────
    activeProvider: 'lm_studio',
    availableProviders: [],   // [{name, display_name, is_active, needs_api_key, available, is_custom}]
    providerConfigs: {},      // {providerName: {api_key, base_url, default_model}}

    fetchProviders: async () => {
        try {
            const res = await fetch(`${BACKEND}/api/providers`);
            if (res.ok) {
                const data = await res.json();
                set({
                    availableProviders: data.providers || [],
                    activeProvider: data.active || 'lm_studio',
                });
            }
        } catch (e) {
            console.warn('[OSStore] Failed to fetch providers:', e.message);
        }
    },

    setActiveProvider: async (name) => {
        try {
            const res = await fetch(`${BACKEND}/api/providers/active`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (res.ok) {
                set({ activeProvider: name, availableModels: [], activeModel: null, selectedModelId: 'auto' });
                get().fetchModels();
                get().fetchAllModels();
                toastBus.info('Provider switched', `Now using ${name}`);
            }
        } catch (e) {
            console.warn('[OSStore] Failed to set active provider:', e.message);
            toastBus.error('Provider switch failed', e.message);
        }
    },

    updateProviderConfig: async (providerName, config) => {
        try {
            const body = {};
            if (config.api_key) body.api_key = config.api_key;
            if (config.base_url) body.base_url = config.base_url;
            if (config.default_model) body.default_model = config.default_model;

            const res = await fetch(`${BACKEND}/api/providers/${providerName}/config`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                set((state) => ({
                    providerConfigs: { ...state.providerConfigs, [providerName]: config },
                }));
                return { success: true };
            }
            const err = await res.json().catch(() => ({}));
            return { success: false, message: err.detail || 'Save failed' };
        } catch (e) {
            console.warn('[OSStore] Failed to update provider config:', e.message);
            return { success: false, message: e.message };
        }
    },

    testProvider: async (providerName) => {
        try {
            const res = await fetch(`${BACKEND}/api/providers/${providerName}/test`, {
                method: 'POST',
            });
            return res.ok ? await res.json() : { available: false, message: 'Request failed' };
        } catch (e) {
            return { available: false, message: e.message };
        }
    },

    addCustomProvider: async (displayName, baseUrl, apiKey) => {
        try {
            const res = await fetch(`${BACKEND}/api/providers/custom`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ display_name: displayName, base_url: baseUrl, api_key: apiKey || undefined }),
            });
            if (res.ok) {
                const data = await res.json();
                toastBus.success('Provider added', `${displayName} is now available`);
                get().fetchProviders();
                get().fetchAllModels();
                return { success: true, slug: data.slug };
            }
            const err = await res.json().catch(() => ({}));
            toastBus.error('Failed to add provider', err.detail || 'Unknown error');
            return { success: false };
        } catch (e) {
            toastBus.error('Failed to add provider', e.message);
            return { success: false };
        }
    },

    removeCustomProvider: async (slug) => {
        try {
            const res = await fetch(`${BACKEND}/api/providers/custom/${slug}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                toastBus.success('Provider removed', `${slug} has been deleted`);
                get().fetchProviders();
                get().fetchAllModels();
                return true;
            }
            return false;
        } catch (e) {
            toastBus.error('Failed to remove provider', e.message);
            return false;
        }
    },

    // ── All Models (grouped by provider) ───────────────────────────────────────
    allModels: [],        // [{name, display_name, available, models: [{id, name}]}]
    selectedModelId: 'auto',

    fetchAllModels: async () => {
        try {
            const res = await fetch(`${BACKEND}/api/providers/all-models`);
            if (res.ok) {
                const data = await res.json();
                set({ allModels: data.providers || [] });
            }
        } catch (e) {
            console.warn('[OSStore] Failed to fetch all models:', e.message);
        }
    },

    setSelectedModel: (modelId) => {
        set({ selectedModelId: modelId });
        if (modelId === 'auto') {
            toastBus.info('AutoDetect enabled', 'Best available model will be selected automatically');
        }
    },

    // ── AI Models (active provider only, legacy) ───────────────────────────────
    activeModel: null,
    availableModels: [],

    fetchModels: async () => {
        const { activeProvider } = get();
        try {
            const res = await fetch(`${BACKEND}/api/providers/${activeProvider}/models`);
            if (res.ok) {
                const data = await res.json();
                const models = (data.models || []).filter(
                    (m) => m.id !== 'text-embedding-bge-m3'
                );
                set({
                    availableModels: models,
                    activeModel: models.length > 0 ? models[0].id : null,
                });
            }
        } catch (e) {
            console.warn('[OSStore] Failed to sync models:', e.message);
        }
    },

    setActiveModel: (modelId) => set({ activeModel: modelId }),

    // ── Security & Aura ────────────────────────────────────────────────────────
    securityLevel: 'standard', // 'standard', 'secure', 'ghost'
    setSecurityLevel: (level) => set({ securityLevel: level }),

    // ── Personalization & Themes ───────────────────────────────────────────────
    theme: 'dark', // 'dark', 'light', 'glass', 'matrix', 'blood', 'frost'
    auraColor: 'cyan', // 'cyan', 'purple', 'emerald', 'rose', 'amber'
    setTheme: (theme) => set({ theme }),
    setAuraColor: (color) => set({ auraColor: color }),

    // ── UI States ──────────────────────────────────────────────────────────────
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
        ].slice(0, 50)
    })),
    clearNotifications: () => set({ notifications: [] }),
    removeNotification: (id) => set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id)
    })),

    launchApp: (appId, title, context = null) => set((state) => {
        const isAlreadyOpen = state.openApps.find(app => app.id === appId);
        if (isAlreadyOpen) {
            return {
                activeAppId: appId,
                openApps: state.openApps.map(app =>
                    app.id === appId ? { ...app, isActive: true, context: context || app.context } : { ...app, isActive: false }
                ),
                isStartMenuOpen: false
            };
        }
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

    // Desktop Shortcuts
    desktopShortcuts: JSON.parse(localStorage.getItem('nexus_desktop_shortcuts') || '[]'),

    addDesktopShortcut: (shortcut) => set((state) => {
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
