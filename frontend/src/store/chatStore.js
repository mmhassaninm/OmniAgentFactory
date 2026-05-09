import { create } from 'zustand';

const FOLDER_COLORS = ['cyan', 'purple', 'emerald', 'amber', 'rose', 'blue'];

const getStoredFolders = () => {
    try {
        const s = localStorage.getItem('nexus_chat_folders');
        return s ? JSON.parse(s) : [{ id: 'default', name: 'General', color: 'cyan', systemPrompt: '', expanded: true }];
    } catch { return [{ id: 'default', name: 'General', color: 'cyan', systemPrompt: '', expanded: true }]; }
};

const getStoredHistory = () => {
    try {
        const s = localStorage.getItem('nexus_chat_history');
        return s ? JSON.parse(s) : [];
    } catch { return []; }
};

const ALL_TOOL_NAMES = ['web_search', 'calculator', 'get_datetime', 'fetch_url', 'run_python',
    'code_interpreter', 'run_in_sandbox', 'list_files', 'read_file', 'run_command', 'write_draft', 'web_scraper'];

export const useChatStore = create((set, get) => ({
    conversations: getStoredHistory(),
    activeConvId: null,
    folders: getStoredFolders(),
    isStreaming: false,
    statusMessage: '',
    streamingMessage: { reply: '', thought: '' },

    // ── Tool Calling & Agent Mode ──────────────────────────────────────────────
    toolsEnabled: false,
    enabledTools: ['web_search', 'calculator', 'get_datetime', 'fetch_url', 'run_python'],
    agentMode: false,
    agentMaxIterations: 8,

    setToolsEnabled: (val) => set({ toolsEnabled: val }),
    setEnabledTools: (tools) => set({ enabledTools: tools }),
    toggleTool: (toolName) => set((state) => ({
        enabledTools: state.enabledTools.includes(toolName)
            ? state.enabledTools.filter(t => t !== toolName)
            : [...state.enabledTools, toolName]
    })),
    setAgentMode: (val) => set({ agentMode: val }),
    setAgentMaxIterations: (n) => set({ agentMaxIterations: Math.max(1, Math.min(15, n)) }),

    // ── Folders ────────────────────────────────────────────────────────────────
    setFolders: (updater) => set((state) => {
        const newFolders = typeof updater === 'function' ? updater(state.folders) : updater;
        localStorage.setItem('nexus_chat_folders', JSON.stringify(newFolders));
        return { folders: newFolders };
    }),

    // ── Conversations ──────────────────────────────────────────────────────────
    setConversations: (updater) => set((state) => {
        const newConvs = typeof updater === 'function' ? updater(state.conversations) : updater;
        localStorage.setItem('nexus_chat_history', JSON.stringify(newConvs));
        return { conversations: newConvs };
    }),

    setActiveConvId: (id) => set({ activeConvId: id }),
    setIsStreaming: (bool) => set({ isStreaming: bool, streamingMessage: { reply: '', thought: '' } }),
    setStatusMessage: (msg) => set({ statusMessage: msg }),
    setStreamingMessage: (reply, thought) => set({ streamingMessage: { reply, thought } }),

    getActiveFolder: () => {
        const { activeConvId, conversations, folders } = get();
        if (!activeConvId) return folders[0];
        const conv = conversations.find(c => c.id === activeConvId);
        return folders.find(f => f.id === (conv?.folderId || 'default')) || folders[0];
    },

    appendTokenToLastMessage: (convId, replyChunk, thoughtChunk, isDone = false) => set((state) => {
        const newConvs = state.conversations.map(c => {
            if (c.id !== convId) return c;
            return {
                ...c,
                messages: c.messages.map((m, i) => {
                    if (i !== c.messages.length - 1) return m;
                    return {
                        ...m,
                        content: (m.content || '') + (replyChunk || ''),
                        thinking: (m.thinking || '') + (thoughtChunk || ''),
                        done: isDone
                    };
                })
            };
        });
        localStorage.setItem('nexus_chat_history', JSON.stringify(newConvs));
        return { conversations: newConvs };
    }),

    finalizeLastMessage: (convId, finalReply, finalThought, isError = false) => set((state) => {
        const newConvs = state.conversations.map(c => {
            if (c.id !== convId) return c;
            return {
                ...c,
                messages: c.messages.map((m, i) => {
                    if (i !== c.messages.length - 1) return m;
                    return {
                        ...m,
                        content: finalReply !== undefined ? finalReply : m.content,
                        thinking: finalThought !== undefined ? finalThought : m.thinking,
                        done: true,
                        isError: isError
                    };
                })
            };
        });
        localStorage.setItem('nexus_chat_history', JSON.stringify(newConvs));
        return { conversations: newConvs, streamingMessage: { reply: '', thought: '' } };
    })
}));
