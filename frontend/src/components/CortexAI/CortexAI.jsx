import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useOSStore } from '../../store/osStore';
import { useChatStore } from '../../store/chatStore';
import nexusBridge from '../../services/bridge.js';
import { performSearch } from '../../services/searchEngine.js';
import { verifyResponse, formatVerification } from '../../services/factChecker.js';
import { trackMessage, buildPersonalizationContext, getStyleDNA, getGraphStats, getFacts } from '../../services/memoryCortex.js';
import { searchKnowledge, ingestFile, listFiles, deleteFile, getStats as getKBStats } from '../../services/knowledgeBase.js';
import { runVibelabMigration, isMigrated } from '../../services/vibelabMigrator.js';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { systemAudio } from '../../utils/audioController.js';
import toastBus from '../../services/toastBus';
import {
    Send, Search, Zap, Brain, Globe, Rocket, Sparkles, Cpu,
    Plus, MessageSquare, Trash2, ChevronDown, Activity,
    Copy, Check, RotateCcw, Bot, User, Loader2, Signal,
    Mic, MicOff, Volume2, VolumeX, Languages,
    FolderOpen, FolderPlus, ChevronRight, Pencil, MoreVertical,
    ArrowRightLeft, Boxes, CircleDot, Server, RefreshCw, X
} from 'lucide-react';
import ChatSidebar from '../Chat/ChatSidebar';
import ChatInput from '../Chat/ChatInput';
import MessageBubble from '../Chat/MessageBubble';
import NeuroMonitor from './NeuroMonitor';
import SettingsModal from '../Settings/SettingsModal';
import ToolCallCard from '../Tools/ToolCallCard';
import AgentThoughtBubble from '../Tools/AgentThoughtBubble';
import ToolSelector from '../Tools/ToolSelector';
import PersonaSelector from '../Agent/PersonaSelector';
import AgentReplayer from '../Agent/AgentReplayer';

// ═══════════════════════════════════════════════════
//  🧠 NEXUS CHAT — Unified Intelligence Engine
//  Merged from CortexAI + Vibelab Chat Evolution.
//  Features: SSE streaming, 5-speed search, RTL,
//  think-tag parsing, voice STT/TTS, ReactMarkdown,
//  conversation management, nexusBridge + LM Studio.
// ═══════════════════════════════════════════════════

const SEARCH_DEPTHS = [
    { id: 'Fastest', icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-400/10', label: 'chat.speed.fastest' },
    { id: 'Fast', icon: Rocket, color: 'text-orange-400', bg: 'bg-orange-400/10', label: 'chat.speed.fast' },
    { id: 'Normal', icon: Signal, color: 'text-cyan-400', bg: 'bg-cyan-400/10', label: 'chat.speed.normal' },
    { id: 'Think & Search', icon: Brain, color: 'text-purple-400', bg: 'bg-purple-400/10', label: 'chat.speed.think' },
    { id: 'Deep Search', icon: Globe, color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'chat.speed.deep' },
];

// Proxy everything through the secure Node.js backend to LM Studio
const BACKEND_BASE = 'http://localhost:3001/api';
const LM_STUDIO_URL = `${BACKEND_BASE}/chat`;
const LM_STUDIO_MODELS_URL = `${BACKEND_BASE}/models`;

// ── Folder colors palette ──
const FOLDER_COLORS = [
    { id: 'cyan', class: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
    { id: 'purple', class: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
    { id: 'emerald', class: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    { id: 'amber', class: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    { id: 'rose', class: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
    { id: 'blue', class: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
];
const isArabicText = (text) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);

const PROVIDER_ICONS = {
    lm_studio: '\uD83D\uDDA5', openai: '\u2726', anthropic: '\u25C6',
    google: '\u2738', groq: '\u26A1', openrouter: '\uD83C\uDF10',
};

export const getFolderColor = (colorId) => FOLDER_COLORS.find(c => c.id === colorId) || FOLDER_COLORS[0];

// Markdown Renderers and MessageBubble extracted to src/components/Chat/

// ═══════════════════════════════════════════════════
//  MAIN COMPONENT — Unified Chat Engine
// ═══════════════════════════════════════════════════
export default function CortexAI() {
    const { t } = useTranslation();
    const {
        systemLanguage, activeProvider, availableProviders, setActiveProvider, fetchProviders,
        allModels, selectedModelId, setSelectedModel, fetchAllModels,
    } = useOSStore();
    const isRtl = systemLanguage === 'ar';

    // ── State (Managed via Zustand to prevent re-renders during streaming) ──
    const {
        conversations, setConversations,
        activeConvId, setActiveConvId,
        folders, setFolders,
        isStreaming, setIsStreaming,
        statusMessage, setStatusMessage,
        streamingMessage, setStreamingMessage,
        finalizeLastMessage,
        toolsEnabled, setToolsEnabled,
        enabledTools, toggleTool, setEnabledTools,
        agentMode, setAgentMode,
        agentMaxIterations,
    } = useChatStore();

    const [inputValue, setInputValue] = useState('');
    const [searchDepth, setSearchDepth] = useState('Normal');
    const [isDepthOpen, setIsDepthOpen] = useState(false);
    const [connectionMode, setConnectionMode] = useState('auto');
    const [isSearchEnabled, setIsSearchEnabled] = useState(false);
    const [isSwarmEnabled, setIsSwarmEnabled] = useState(false);
    const [isProactiveEnabled, setIsProactiveEnabled] = useState(true);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // ── Tool calling & agent mode UI state ────────────────────────────────────
    const [isToolSelectorOpen, setIsToolSelectorOpen] = useState(false);
    // activeToolCalls: {[callId]: {toolName, icon, status:'running'|'done'|'error', output, error, ms, args}}
    const [activeToolCalls, setActiveToolCalls] = useState([]);
    // agentThoughts: [{iteration, thought, streaming}]
    const [agentThoughts, setAgentThoughts] = useState([]);
    // selectedToolsIndicator: null | {selected: string[], scores: {}}
    const [selectedToolsIndicator, setSelectedToolsIndicator] = useState(null);
    // activePersona: string — which agent persona is selected
    const [activePersona, setActivePersona] = useState('general');
    // isReplayerOpen: bool — agent run replayer modal
    const [isReplayerOpen, setIsReplayerOpen] = useState(false);

    // ── Model selection ──
    const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
    const [modelStatus, setModelStatus] = useState('offline'); // 'online', 'offline', 'loading'
    const [isSwapping, setIsSwapping] = useState(false);

    // ── Folders / Projects ──
    const [editingFolderId, setEditingFolderId] = useState(null);
    const [folderMenuOpen, setFolderMenuOpen] = useState(null);
    const [sidebarSearch, setSidebarSearch] = useState('');
    const [movingConvId, setMovingConvId] = useState(null);

    // Voice / TTS
    const [isRecording, setIsRecording] = useState(false);
    const [ttsEnabled, setTtsEnabled] = useState(false);
    const mediaRecorderRef = useRef(null);
    const kbFileRef = useRef(null);
    const [kbStatus, setKbStatus] = useState(''); // '', 'uploading:45%', 'ready'

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const abortRef = useRef(null);
    const folderNameRef = useRef(null);

    // ── Knowledge Base file handler ──
    const handleKBUpload = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setKbStatus('reading...');
        try {
            const text = await file.text();
            setKbStatus('uploading:0%');
            await ingestFile(file.name, text, (pct) => setKbStatus(`uploading:${pct}%`));
            setKbStatus(`✅ ${file.name}`);
            setTimeout(() => setKbStatus(''), 3000);
        } catch (err) {
            setKbStatus(`❌ ${err.message}`);
            setTimeout(() => setKbStatus(''), 3000);
        }
        if (kbFileRef.current) kbFileRef.current.value = '';
    }, []);

    // Auto-scroll

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conversations, activeConvId]);

    // Fetch Settings
    const handleOpenSettings = useCallback(() => setIsSettingsOpen(true), []);
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await fetch('http://localhost:3001/api/settings');
                const data = await res.json();
                setIsProactiveEnabled(data.proactiveBackgroundProcessing);
            } catch (err) {
                console.error('Failed to fetch settings:', err);
            }
        };
        fetchSettings();
    }, []);

    const toggleProactive = async () => {
        const newState = !isProactiveEnabled;
        setIsProactiveEnabled(newState);
        try {
            await fetch('http://localhost:3001/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ proactiveBackgroundProcessing: newState })
            });
        } catch (err) {
            console.error('Failed to update settings:', err);
            setIsProactiveEnabled(!newState);
        }
    };

    // ── Auto-Migration: Import Vibelab intelligence on first load ──
    const [migrationStatus, setMigrationStatus] = useState('');
    useEffect(() => {
        if (!isMigrated()) {
            setMigrationStatus('🔄 Upgrading Nexus Intelligence...');
            // Wait 1.5s the let the UI animations finish smoothly before starting heavy ops
            setTimeout(() => {
                runVibelabMigration(({ message, percent }) => {
                    setMigrationStatus(`🧠 ${message} (${percent}%)`);
                }).then(result => {
                    if (result.success) {
                        const chunkCount = result.stats.chunks || 0;
                        const hasProfile = result.stats.ownerProfile ? ' | Owner Profile ✅' : '';
                        setMigrationStatus(`✅ Intelligence upgraded! ${chunkCount} chunks indexed${hasProfile}`);
                        setTimeout(() => setMigrationStatus(''), 5000);
                    } else {
                        setMigrationStatus(`⚠️ Migration partial: ${result.error || 'Some files skipped'}`);
                        setTimeout(() => setMigrationStatus(''), 8000);
                    }
                });
            }, 1500);
        }
    }, []);

    // ── Fetch Providers + all models on mount ──
    useEffect(() => { fetchProviders(); fetchAllModels(); }, []);

    // ── Fetch Models from active provider ──
    const fetchModels = useCallback(async () => {
        setModelStatus('loading');
        try {
            const res = await fetch(`${BACKEND_BASE}/providers/${activeProvider}/models`, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) throw new Error('Failed');
            setModelStatus('online');
        } catch {
            setModelStatus('offline');
        }
        // Also refresh the full grouped model list in the store
        fetchAllModels();
    }, [activeProvider, fetchAllModels]);

    useEffect(() => {
        if (isSwapping) return;
        fetchModels();
        const t = setInterval(fetchModels, 30000);
        return () => clearInterval(t);
    }, [fetchModels, isSwapping]);

    // ── Dynamic VRAM Management (LM Studio only — skip for 'auto') ──
    const prevModelRef = useRef(null);
    useEffect(() => {
        const model = selectedModelId;
        if (!model || model === 'auto' || model === prevModelRef.current || isSwapping) return;
        if (activeProvider !== 'lm_studio') { prevModelRef.current = model; return; }
        prevModelRef.current = model;

        const swapModel = async () => {
            setIsSwapping(true);
            setStatusMessage(`🧠 Swapping to ${model}...`);
            try {
                console.log(`[CortexAI] 🔄 Requesting VRAM Swap to: ${model}`);
                await fetch(`${BACKEND_BASE}/models/swap`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newModel: model })
                });
                await fetchModels();
            } catch (err) {
                console.warn('[CortexAI] ⚠️ VRAM Swap request failed:', err.message);
            } finally {
                setIsSwapping(false);
                setStatusMessage('');
            }
        };
        swapModel();
    }, [selectedModelId, activeProvider]);

    // ── Continuous Background Learning (God-Mode Assimilation) ──
    // Every hour, if idle, autonomously fetch latest tech news/updates
    // and ingest them into the Knowledge Base silently to keep NexusOS educated.
    useEffect(() => {
        const bgScraperInterval = setInterval(async () => {
            // Only run if we aren't actively streaming to save resources
            if (!isStreaming) {
                try {
                    console.log('[CortexAI] 🕸️ Running Background Autonomous Learning Cycle...');
                    const topics = [
                        "Latest advancements in local LLMs and agentic AI",
                        "Electron.js security best practices 2024",
                        "React Vite performance optimization techniques",
                        "God-Mode architecture for offline AI",
                        "Recent breakthroughs in zero-cost offline intelligence"
                    ];
                    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
                    const searchResult = await performSearch(randomTopic, 'Normal', 'en');

                    if (searchResult && searchResult.context && searchResult.context.length > 500) {
                        // Truncate to save space, but enough to learn
                        const textToIngest = searchResult.context.substring(0, 5000);
                        const fileName = `AutoIngest_${Date.now()}.txt`;
                        // Ingest silently
                        await ingestFile(fileName, `Topic: ${randomTopic}\n\n${textToIngest}`, () => { });
                        console.log(`[CortexAI] 🕸️ Autonomously ingested background knowledge: ${fileName}`);
                    }
                } catch (e) {
                    // Silently fail, it's a background process
                }
            }
        }, 1000 * 60 * 60); // Run once an hour

        return () => clearInterval(bgScraperInterval);
    }, [isStreaming]);

    // ── Folder helpers ──
    const createFolder = useCallback(() => {
        const newFolder = { id: `folder_${Date.now()}`, name: 'New Project', color: FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)].id, systemPrompt: '', expanded: true };
        setFolders(prev => [...prev, newFolder]);
        setEditingFolderId(newFolder.id);
        setTimeout(() => folderNameRef.current?.focus(), 50);
    }, []);

    const renameFolder = useCallback((folderId, newName) => {
        setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: newName || 'Untitled' } : f));
        setEditingFolderId(null);
    }, []);

    const deleteFolder = useCallback((folderId) => {
        if (folderId === 'default') return;
        // Move all conversations to 'default'
        setConversations(prev => prev.map(c => c.folderId === folderId ? { ...c, folderId: 'default' } : c));
        setFolders(prev => prev.filter(f => f.id !== folderId));
        setFolderMenuOpen(null);
    }, []);

    const toggleFolderExpand = useCallback((folderId) => {
        setFolders(prev => prev.map(f => f.id === folderId ? { ...f, expanded: !f.expanded } : f));
    }, []);

    const moveConversation = useCallback((convId, targetFolderId) => {
        setConversations(prev => prev.map(c => c.id === convId ? { ...c, folderId: targetFolderId } : c));
        setMovingConvId(null);
    }, []);

    const getActiveFolder = () => {
        if (!activeConvId) return folders[0];
        const conv = conversations.find(c => c.id === activeConvId);
        return folders.find(f => f.id === (conv?.folderId || 'default')) || folders[0];
    };

    const activeConv = conversations.find(c => c.id === activeConvId);
    const messages = activeConv?.messages || [];

    // TTS: Auto-speak last AI message
    useEffect(() => {
        if (!isStreaming && ttsEnabled && messages.length > 0) {
            const last = messages[messages.length - 1];
            if (last.role === 'assistant' && last.done && last.content) {
                const plain = last.content.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/#+\s|(\*\*|__)(.*?)\1|(\*|_)(.*?)\3|\[([^\]]+)\]\([^)]+\)|`{1,3}[^`]*`{1,3}/g, '$2$4$5');
                const utterance = new SpeechSynthesisUtterance(plain);
                utterance.lang = isArabicText(plain) ? 'ar-SA' : 'en-US';
                utterance.rate = 1.05;
                window.speechSynthesis.speak(utterance);
            }
        }
    }, [isStreaming, ttsEnabled]);

    // ── Create / Delete Conversation ──
    const createConversation = useCallback((folderId) => {
        // Guard: onClick passes Event as folderId — only accept strings
        const targetFolder = (typeof folderId === 'string' && folderId) ? folderId : (getActiveFolder()?.id || 'default');
        const newConv = { id: `conv_${Date.now()}`, title: t('chat.new_chat', { defaultValue: 'New Chat' }), messages: [], createdAt: new Date().toISOString(), folderId: targetFolder };
        setConversations(prev => [newConv, ...prev]);
        setActiveConvId(newConv.id);
        setInputValue('');
        // Auto-expand the folder
        setFolders(prev => prev.map(f => f.id === targetFolder ? { ...f, expanded: true } : f));
        setTimeout(() => inputRef.current?.focus(), 100);
    }, [t, folders]);

    const deleteConversation = useCallback((convId) => {
        setConversations(prev => prev.filter(c => c.id !== convId));
        if (activeConvId === convId) setActiveConvId(null);
    }, [activeConvId]);

    // ── Voice Recording (Web Speech API) ──
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            recorder.onstop = () => stream.getTracks().forEach(track => track.stop());
            mediaRecorderRef.current = recorder;
            recorder.start();
            setIsRecording(true);

            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognition.continuous = false;
                recognition.interimResults = false;
                recognition.lang = isRtl ? 'ar-EG' : 'en-US';
                recognition.onresult = (event) => {
                    setInputValue(event.results[0][0].transcript);
                    setIsRecording(false);
                    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current.stop();
                };
                recognition.onerror = () => { setIsRecording(false); if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current.stop(); };
                recognition.onend = () => setIsRecording(false);
                recognition.start();
            }
        } catch (err) { console.error('[CortexAI] Mic access denied:', err); }
    };
    const stopRecording = () => {
        if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current.stop();
        setIsRecording(false);
    };

    // ═══════════════════════════════════════════════════
    //  SEND MESSAGE — Dual-Mode (nexusBridge + LM Studio)
    // ═══════════════════════════════════════════════════
    const sendMessage = useCallback(async () => {
        if (!inputValue.trim() || isStreaming) return;

        let convId = activeConvId;
        if (!convId) {
            const targetFolder = getActiveFolder()?.id || 'default';
            const newConv = { id: `conv_${Date.now()}`, title: inputValue.substring(0, 40), messages: [], createdAt: new Date().toISOString(), folderId: targetFolder };
            setConversations(prev => [newConv, ...prev]);
            convId = newConv.id;
            setActiveConvId(convId);
        }

        const msgText = inputValue.trim();
        const userMsg = { role: 'user', content: msgText, timestamp: new Date().toISOString(), done: true };
        const assistantMsg = {
            role: 'assistant', content: '', timestamp: new Date().toISOString(), done: false,
            model: selectedModelId || 'auto', provider: activeProvider,
        };

        setConversations(prev => prev.map(c =>
            c.id === convId
                ? { ...c, title: c.messages.length === 0 ? msgText.substring(0, 40) : c.title, messages: [...c.messages, userMsg, assistantMsg] }
                : c
        ));
        setInputValue('');
        setIsStreaming(true);
        setStatusMessage(t('chat.status.connecting', { defaultValue: 'Connecting...' }));

        // Build history dynamically from store to avoid stale closures
        const historyConvs = useChatStore.getState().conversations;
        const currentConv = historyConvs.find(c => c.id === convId);
        const history = (currentConv?.messages || []).slice(-8).map(m => ({ role: m.role, content: m.content }));

        // ── Strategy 1: Try nexusBridge first (Electron IPC or HTTP backend) ──
        if ((connectionMode === 'auto' || connectionMode === 'bridge') && isSwarmEnabled) {
            try {
                setStatusMessage('Routing through Nexus Bridge...');
                const res = await nexusBridge.invoke('hive:orchestrateTask', {
                    text: msgText,
                    context: 'Mode: General Intelligence',
                    model: selectedModelId || 'auto'
                });

                if (res.success && res.response) {
                    const cleanText = res.response.replace(/\[\[(OPEN|CLOSE|WALLPAPER):[^\]]+\]\]/g, '').trim();
                    finalizeLastMessage(convId, cleanText, '', false);
                    setIsStreaming(false);
                    setStatusMessage('');
                    return;
                }
            } catch (bridgeErr) {
                console.warn('[CortexAI] Bridge failed, trying LM Studio direct...', bridgeErr.message);
            }
        }

        // ── Web Search (if enabled) ──
        let searchContext = '';
        if (isSearchEnabled) {
            try {
                setStatusMessage(t('chat.status.searching', { defaultValue: 'Searching the web...' }));
                const searchResult = await performSearch(msgText, searchDepth, isRtl ? 'ar' : 'en');
                if (searchResult.context) {
                    searchContext = searchResult.context;
                    console.log(`[CortexAI] Web search: ${searchResult.results.length} results in ${searchResult.duration}ms`);
                }
            } catch (searchErr) {
                console.warn('[CortexAI] Web search failed:', searchErr.message);
            }
        }

        // ── Strategy 2: Direct SSE to LM Studio ──
        let searchInstructions = '';
        if (isSearchEnabled) {
            if (searchContext) {
                searchInstructions = `\n\n[WEB SEARCH CONTEXT]\n${searchContext}\n\n[SEARCH RULE — STRICT GROUNDING]: You MUST base your answer strictly on the web search context provided above. DO NOT hallucinate future events, tools, or local capabilities that are not explicitly mentioned in the context. If the context does not contain the exact answer, explicitly state "عذراً، لم أجد معلومات مؤكدة حول ذلك في بحثي الحالي" (Sorry, I couldn't find confirmed info in my current search), then provide a logical answer based ONLY on real facts. NEVER claim a cloud tool is local. Always securely cite the provided sources.`;
            } else {
                searchInstructions = `\n\n[SEARCH RULE — STRICT GROUNDING]: A live web search was attempted but returned zero results for this query. You MUST explicitly tell the user that the search yielded no recent results, and then provide your best factual answer based strictly on your training data. Do NOT hallucinate futuristic tools or facts that you cannot verify.`;
            }
        }
        // ── Nexus V5.1 Intelligence: The Citadel & Autonomous Vault ──
        let vaultContext = '';
        try {
            const vaultRes = await nexusBridge.invoke('vault:retrieve', { query: msgText, topK: 3 });
            if (vaultRes && vaultRes.hasStrongMatch && vaultRes.text) {
                vaultContext = `\n\n[AUTONOMOUS KNOWLEDGE VAULT - PAST MEMORIES]\n${vaultRes.text}\n\n[RULE]: Use these memories to inform your response. Do not explicitly state "According to my memory", just seamlessly integrate the facts.`;
            }
        } catch (e) { console.warn('[CortexAI] Vault unavailable:', e); }

        let activeProfile = '';
        try {
            const profileMd = await nexusBridge.invoke('profile:get-active', 'User');
            if (profileMd) {
                activeProfile = `\n\n[USER PSYCHOMETRIC PROFILE]\n${profileMd}\n[RULE]: Adapt your tone and vocabulary to perfectly match the user's personality profile provided above.`;
            }
        } catch (e) { console.warn('[CortexAI] Citadel unavailable:', e); }

        const systemPrompt = `You are Nexus AI, a highly intelligent assistant integrated into NexusOS.
You think step-by-step inside <think> tags. Your final answer is ALWAYS in the SAME language the user writes in.
Current time: ${new Date().toLocaleString()}
Be concise but thorough. Use markdown formatting. Never hallucinate.
CRITICAL RULES:
1. NEVER tell the user to "search on Reddit", "visit Google", "check a website", or "look it up". YOU are the search engine. Always answer directly.
2. NEVER use Chinese (中文), Korean (한국어), or Japanese (日本語) characters in your response under ANY circumstance.
3. If the user writes in Arabic, reply 100% in Arabic. If in English, reply in English.${searchInstructions}${activeProfile}${vaultContext}`;

        let maxTokens = 1500;
        if (searchDepth === 'Fastest') maxTokens = 400;
        if (searchDepth === 'Fast') maxTokens = 800;
        if (searchDepth === 'Think & Search') maxTokens = 2500;
        if (searchDepth === 'Deep Search') maxTokens = 4000;

        // Inject per-folder system prompt
        const activeFolder = getActiveFolder();
        const folderPrompt = activeFolder?.systemPrompt ? `\n\n[PROJECT CONTEXT]\n${activeFolder.systemPrompt}` : '';

        const payload = {
            model: selectedModelId || 'auto',
            messages: [{ role: 'system', content: systemPrompt + folderPrompt }, ...history, { role: 'user', content: msgText }],
            temperature: 0.6,
            max_tokens: maxTokens,
            stream: true,
            isSearchEnabled,
            isSwarmEnabled,
            tools_enabled: toolsEnabled,
            tool_names: toolsEnabled ? enabledTools : [],
        };

        // Clear previous tool calls / agent thoughts / routing indicator
        setActiveToolCalls([]);
        setAgentThoughts([]);
        setSelectedToolsIndicator(null);

        console.log(`[CortexAI] Sending request. Model: ${payload.model}, Provider: ${activeProvider}`);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            setStatusMessage(t('chat.status.thinking', { defaultValue: 'Thinking...' }));
            const response = await fetch(LM_STUDIO_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload), signal: controller.signal,
            });

            if (!response.ok) throw new Error(`LM Studio error (${response.status}). Ensure it's running on port 1234.`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '', tokenBuffer = '', isThinking = false, fullReply = '', fullThought = '';

            setStatusMessage(t('chat.status.generating', { defaultValue: 'Generating...' }));

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    if (tokenBuffer) {
                        if (isThinking) fullThought += tokenBuffer;
                        else fullReply += tokenBuffer;
                    }
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                let currentEventType = null;

                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        currentEventType = line.substring(7).trim();
                        continue;
                    }

                    const cleanLine = line.replace(/^data: /, '').trim();
                    if (!cleanLine || cleanLine === '[DONE]') {
                        currentEventType = null;
                        continue;
                    }

                    try {
                        const json = JSON.parse(cleanLine);
                        if (currentEventType === 'status' && json.message) {
                            setStatusMessage(json.message);
                        } else if (currentEventType === 'thought' && json.token) {
                            fullThought += json.token;
                        } else if (currentEventType === 'token' && json.token) {
                            fullReply += json.token;
                        } else if (currentEventType === 'tool_routing') {
                            // Show which tools were selected by the semantic router
                            setSelectedToolsIndicator({ selected: json.selected || [], scores: json.scores || {} });
                        } else if (currentEventType === 'tool_start') {
                            // Add new tool call card in "running" state
                            setActiveToolCalls(prev => [...prev, {
                                callId: json.call_id, toolName: json.tool_name,
                                icon: json.icon, status: 'running', args: json.arguments || {}
                            }]);
                        } else if (currentEventType === 'tool_result') {
                            // Update tool card to "done"
                            setActiveToolCalls(prev => prev.map(tc =>
                                tc.callId === json.call_id
                                    ? { ...tc, status: 'done', output: json.output, executionTimeMs: json.execution_time_ms }
                                    : tc
                            ));
                        } else if (currentEventType === 'tool_error') {
                            // Update tool card to "error"
                            setActiveToolCalls(prev => prev.map(tc =>
                                tc.callId === json.call_id
                                    ? { ...tc, status: 'error', error: json.error, executionTimeMs: json.execution_time_ms }
                                    : tc
                            ));
                        } else if (currentEventType === 'agent_think') {
                            // Append token to current iteration's thought
                            setAgentThoughts(prev => {
                                const existing = prev.find(t => t.iteration === json.iteration);
                                if (existing) {
                                    return prev.map(t => t.iteration === json.iteration
                                        ? { ...t, thought: (t.thought || '') + (json.token || '') }
                                        : t
                                    );
                                }
                                return [...prev, { iteration: json.iteration, thought: json.token || '', streaming: true }];
                            });
                        } else if (currentEventType === 'agent_act') {
                            // Mark current thought as no longer streaming, add tool call
                            setAgentThoughts(prev => prev.map(t =>
                                t.iteration === json.iteration ? { ...t, streaming: false } : t
                            ));
                            setActiveToolCalls(prev => [...prev, {
                                callId: json.call_id, toolName: json.tool_name,
                                icon: json.icon, status: 'running', args: json.arguments || {}
                            }]);
                        } else if (currentEventType === 'agent_observe') {
                            // Update tool call with result
                            setActiveToolCalls(prev => prev.map(tc =>
                                tc.callId === json.call_id
                                    ? { ...tc, status: json.ok ? 'done' : 'error', output: json.output, error: json.error, executionTimeMs: json.execution_time_ms }
                                    : tc
                            ));
                        } else if (currentEventType === 'agent_reflect') {
                            // Mid-run self-reflection — append as a special thought bubble
                            setAgentThoughts(prev => [
                                ...prev,
                                { iteration: `reflect_${json.iteration}`, thought: `🔍 ${json.reflection}`, streaming: false, isReflection: true }
                            ]);
                        } else if (currentEventType === 'agent_finish') {
                            // Agent completed — inject the answer into the stream
                            if (json.answer) fullReply += json.answer;
                            setStatusMessage(json.success ? '✅ Agent completed' : '⚠️ Agent max iterations reached');
                        } else if (json.choices?.[0]?.delta?.content) {
                            const content = json.choices[0].delta.content;
                            tokenBuffer += content;

                            let processing = true;
                            while (processing) {
                                if (isThinking) {
                                    const endIdx = tokenBuffer.indexOf('</think>');
                                    if (endIdx !== -1) {
                                        fullThought += tokenBuffer.substring(0, endIdx);
                                        tokenBuffer = tokenBuffer.substring(endIdx + 8);
                                        isThinking = false;
                                        setStatusMessage(t('chat.status.answering', { defaultValue: 'Answering...' }));
                                    } else {
                                        if (tokenBuffer.length > 20 && !tokenBuffer.includes('<')) {
                                            fullThought += tokenBuffer;
                                            tokenBuffer = '';
                                        }
                                        processing = false;
                                    }
                                } else {
                                    const startIdx = tokenBuffer.indexOf('<think>');
                                    if (startIdx !== -1) {
                                        fullReply += tokenBuffer.substring(0, startIdx);
                                        tokenBuffer = tokenBuffer.substring(startIdx + 7);
                                        isThinking = true;
                                        setStatusMessage(t('chat.status.reasoning', { defaultValue: 'Deep reasoning...' }));
                                    } else {
                                        const lastAngle = tokenBuffer.lastIndexOf('<');
                                        if (lastAngle !== -1 && lastAngle > tokenBuffer.length - 8) {
                                            fullReply += tokenBuffer.substring(0, lastAngle);
                                            tokenBuffer = tokenBuffer.substring(lastAngle);
                                        } else {
                                            fullReply += tokenBuffer;
                                            tokenBuffer = '';
                                        }
                                        processing = false;
                                    }
                                }
                            }
                        }

                        setStreamingMessage(fullReply, fullThought);
                        currentEventType = null;
                    } catch (e) { /* skip malformed */ }
                }
            }

            // ── System 1: Fact-Checker (post-generation verification) ──
            if (isSearchEnabled && fullReply.length > 100) {
                try {
                    setStatusMessage('🔍 Verifying response...');
                    const verification = await verifyResponse(msgText, fullReply, searchContext, selectedModelId || 'auto');
                    const correction = formatVerification(verification, userLangIsArabic);
                    if (correction) fullReply += correction;
                } catch { /* fact-check failed, continue */ }
            }

            // Guard: empty reply → surface error bubble instead of blank message
            if (!fullReply.trim() && !fullThought.trim()) {
                finalizeLastMessage(convId, '⚠️ No response received — the model returned an empty reply.', '', true);
            } else {
                finalizeLastMessage(convId, fullReply, fullThought, false);
            }

            // Play the UI completion sound
            systemAudio.playNotification();

            // ── System 3: Memory Cortex tracking & Citadel Update ──
            try {
                const historyConvsNow = useChatStore.getState().conversations;
                const currentConvNow = historyConvsNow.find(c => c.id === convId);
                const allMsgs = currentConvNow?.messages || [];
                trackMessage(allMsgs, selectedModelId || 'auto');

                // Fire and forget: update profile every few messages
                if (allMsgs.length % 6 === 0) {
                    nexusBridge.invoke('profile:update', { messages: allMsgs, username: 'User' }).catch(() => { });
                }

                // Fire and forget: save important facts to Knowledge Vault
                if (fullReply.length > 50 && msgText.length > 20) {
                    nexusBridge.invoke('vault:save-memory', {
                        aiContent: fullReply,
                        userContent: msgText,
                        topic: currentConvNow?.title || 'Chat Memory'
                    }).catch(() => { });
                }
            } catch { /* memory tracking failed, continue */ }

        } catch (err) {
            if (err.name === 'AbortError') {
                finalizeLastMessage(convId, t('chat.status.cancelled', { defaultValue: 'Cancelled.' }), '', true);
            } else {
                const errorMsg = `⚠️ **Connection Failed**\n\nCouldn't reach the LLM provider.\n\n\`Error: ${err.message}\``;
                finalizeLastMessage(convId, errorMsg, '', true);
                // Offer graceful fallback to AutoDetect
                if (selectedModelId && selectedModelId !== 'auto') {
                    toastBus.warning(
                        'Provider unreachable',
                        'Switching to AutoDetect — it will pick the next available model.'
                    );
                    setSelectedModel('auto');
                } else {
                    toastBus.error('Connection failed', err.message);
                }
            }
        } finally {
            setIsStreaming(false);
            setStatusMessage('');
            abortRef.current = null;
        }
    }, [inputValue, isStreaming, activeConvId, searchDepth, connectionMode, isSearchEnabled, isSwarmEnabled, isRtl, selectedModelId, t]);

    const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
    const currentDepth = SEARCH_DEPTHS.find(d => d.id === searchDepth);

    return (
        <>
        <div className={`flex h-full overflow-hidden font-sans ${isRtl ? 'flex-row-reverse' : ''}`} dir={isRtl ? 'rtl' : 'ltr'} style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>

            {/* --- Sidebar --- */}
            <ChatSidebar
                isRtl={isRtl} t={t} sidebarSearch={sidebarSearch} setSidebarSearch={setSidebarSearch}
                createConversation={createConversation} createFolder={createFolder} folders={folders}
                conversations={conversations} editingFolderId={editingFolderId} folderNameRef={folderNameRef}
                renameFolder={renameFolder} folderMenuOpen={folderMenuOpen} setFolderMenuOpen={setFolderMenuOpen}
                setEditingFolderId={setEditingFolderId} deleteFolder={deleteFolder} activeConvId={activeConvId}
                toggleFolderExpand={toggleFolderExpand} setActiveConvId={setActiveConvId} movingConvId={movingConvId}
                setMovingConvId={setMovingConvId} deleteConversation={deleteConversation} moveConversation={moveConversation}
                getFolderColor={getFolderColor}
                onOpenSettings={handleOpenSettings}
            />

            {/* Settings Modal Integration */}
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                isProactiveEnabled={isProactiveEnabled}
                onToggleProactive={toggleProactive}
                isRtl={isRtl}
                t={t}
                toolsEnabled={toolsEnabled}
                setToolsEnabled={setToolsEnabled}
                enabledTools={enabledTools}
                toggleTool={toggleTool}
                setEnabledTools={setEnabledTools}
                agentMode={agentMode}
                setAgentMode={setAgentMode}
                agentMaxIterations={agentMaxIterations}
            />

            {/* Tool Selector floating panel */}
            <ToolSelector
                isOpen={isToolSelectorOpen}
                onClose={() => setIsToolSelectorOpen(false)}
                enabledTools={enabledTools}
                onToggle={toggleTool}
                onEnableAll={() => setEnabledTools(['web_search','calculator','get_datetime','fetch_url','run_python','code_interpreter','run_in_sandbox','list_files','read_file','run_command','write_draft','web_scraper'])}
                onDisableAll={() => setEnabledTools([])}
            />

            {/* Neuro-Monitor micro-widget is called inside Main Chat Area or as a top-level in child */}
            <NeuroMonitor />

            {/* --- Main Chat Area --- */}
            <div className="flex-1 flex flex-col min-w-0" style={{ background: 'var(--bg-base)' }}>

                {/* -- Chat Header (active conversation only) -- */}
                {activeConvId && (
                    <div
                        className={`flex items-center justify-between px-5 flex-shrink-0 ${isRtl ? 'flex-row-reverse' : ''}`}
                        style={{
                            height: '44px',
                            background: 'var(--bg-panel)',
                            borderBottom: '1px solid var(--border-subtle)',
                        }}
                    >
                        {/* Conversation title */}
                        <span
                            className="text-[11px] font-bold truncate max-w-[260px]"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {activeConv?.title || 'New Chat'}
                        </span>

                        {/* Provider + Model pills */}
                        <div className={`flex items-center gap-2 flex-shrink-0 ${isRtl ? 'flex-row-reverse' : ''}`}>
                            {/* Tools active indicator */}
                            {toolsEnabled && (
                                <span
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black cursor-pointer"
                                    style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}
                                    onClick={() => setIsToolSelectorOpen(true)}
                                >
                                    ⚡ Tools: {enabledTools.length}
                                </span>
                            )}
                            {agentMode && (
                                <>
                                    <span
                                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black"
                                        style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#10b981' }}
                                    >
                                        🤖 Agent
                                    </span>
                                    <PersonaSelector
                                        selectedPersona={activePersona}
                                        onSelect={setActivePersona}
                                        disabled={isStreaming}
                                    />
                                </>
                            )}
                            <span
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
                                style={{
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border-subtle)',
                                    color: 'var(--text-muted)',
                                }}
                            >
                                <span className="text-[11px]">{PROVIDER_ICONS[activeProvider] || '🤖'}</span>
                                <span className="capitalize">{(activeProvider || '').replace(/_/g, ' ')}</span>
                            </span>
                            <span
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
                                style={{
                                    background: 'var(--bg-card)',
                                    border: modelStatus === 'online' ? '1px solid var(--border-primary)' : '1px solid var(--border-subtle)',
                                    color: modelStatus === 'online' ? 'var(--accent-primary)' : 'var(--text-muted)',
                                }}
                            >
                                <span
                                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                    style={{
                                        background: modelStatus === 'online'
                                            ? 'var(--accent-success)'
                                            : modelStatus === 'loading'
                                                ? 'var(--accent-warning)'
                                                : 'var(--accent-error)',
                                    }}
                                />
                                {(!selectedModelId || selectedModelId === 'auto')
                                    ? 'AutoDetect'
                                    : selectedModelId.split('/').pop().substring(0, 20)
                                }
                            </span>
                            {/* Agent Replay button - visible when agentMode is on */}
                            {agentMode && (
                                <button
                                    onClick={() => setIsReplayerOpen(true)}
                                    title="Replay past agent runs"
                                    style={{
                                        background: 'rgba(124,58,237,0.1)',
                                        border: '1px solid rgba(124,58,237,0.25)',
                                        borderRadius: '999px',
                                        padding: '3px 8px',
                                        fontSize: '0.65rem',
                                        color: '#a78bfa',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    🎬 Replay
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Messages */}
                <div
                    className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar"
                    style={{ background: 'radial-gradient(circle at 50% 20%, rgba(0,212,255,0.022) 0%, transparent 65%)' }}
                >
                    {!activeConvId ? (
                        /* ── Welcome Screen ── */
                        <div className="h-full flex flex-col items-center justify-center text-center relative nd-grid-bg overflow-hidden">
                            {/* Animated neural network SVG */}
                            <div className="w-52 h-40 mb-6 nd-svg-float relative">
                                {/* Outer glow */}
                                <div
                                    className="absolute inset-0 rounded-full blur-3xl"
                                    style={{ background: 'radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)' }}
                                />
                                <svg viewBox="0 0 220 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                                    {/* -- Edges: L1->L2 -- */}
                                    <line className="nd-svg-edge" x1="30" y1="52" x2="90" y2="28" stroke="#00d4ff" strokeWidth="0.8" strokeOpacity="0.5" />
                                    <line className="nd-svg-edge" x1="30" y1="52" x2="90" y2="72" stroke="#00d4ff" strokeWidth="1" strokeOpacity="0.6" />
                                    <line className="nd-svg-edge" x1="30" y1="52" x2="90" y2="116" stroke="#7c3aed" strokeWidth="0.6" strokeOpacity="0.35" />
                                    <line className="nd-svg-edge" x1="30" y1="108" x2="90" y2="28" stroke="#7c3aed" strokeWidth="0.6" strokeOpacity="0.35" />
                                    <line className="nd-svg-edge" x1="30" y1="108" x2="90" y2="72" stroke="#00d4ff" strokeWidth="0.8" strokeOpacity="0.5" />
                                    <line className="nd-svg-edge" x1="30" y1="108" x2="90" y2="116" stroke="#7c3aed" strokeWidth="1" strokeOpacity="0.6" />
                                    {/* -- Edges: L2->L3 -- */}
                                    <line className="nd-svg-edge" x1="90" y1="28" x2="152" y2="44" stroke="#7c3aed" strokeWidth="0.8" strokeOpacity="0.5" />
                                    <line className="nd-svg-edge" x1="90" y1="72" x2="152" y2="44" stroke="#00d4ff" strokeWidth="1" strokeOpacity="0.6" />
                                    <line className="nd-svg-edge" x1="90" y1="116" x2="152" y2="44" stroke="#00d4ff" strokeWidth="0.6" strokeOpacity="0.35" />
                                    <line className="nd-svg-edge" x1="90" y1="28" x2="152" y2="108" stroke="#00d4ff" strokeWidth="0.6" strokeOpacity="0.35" />
                                    <line className="nd-svg-edge" x1="90" y1="72" x2="152" y2="108" stroke="#7c3aed" strokeWidth="1" strokeOpacity="0.6" />
                                    <line className="nd-svg-edge" x1="90" y1="116" x2="152" y2="108" stroke="#7c3aed" strokeWidth="0.8" strokeOpacity="0.5" />
                                    {/* -- Edges: L3->Output -- */}
                                    <line className="nd-svg-edge" x1="152" y1="44" x2="194" y2="78" stroke="#00d4ff" strokeWidth="1.2" strokeOpacity="0.7" />
                                    <line className="nd-svg-edge" x1="152" y1="108" x2="194" y2="78" stroke="#7c3aed" strokeWidth="1.2" strokeOpacity="0.7" />
                                    {/* -- Nodes: Layer 1 -- */}
                                    <circle className="nd-svg-node" cx="30" cy="52" r="5" fill="#00d4ff" fillOpacity="0.75" />
                                    <circle className="nd-svg-node" cx="30" cy="108" r="5" fill="#00d4ff" fillOpacity="0.75" />
                                    {/* -- Nodes: Layer 2 -- */}
                                    <circle className="nd-svg-node" cx="90" cy="28" r="4.5" fill="#7c3aed" fillOpacity="0.75" />
                                    <circle className="nd-svg-node" cx="90" cy="72" r="6" fill="#00d4ff" fillOpacity="0.85" />
                                    <circle className="nd-svg-node" cx="90" cy="116" r="4.5" fill="#7c3aed" fillOpacity="0.75" />
                                    {/* -- Nodes: Layer 3 -- */}
                                    <circle className="nd-svg-node" cx="152" cy="44" r="5" fill="#7c3aed" fillOpacity="0.75" />
                                    <circle className="nd-svg-node" cx="152" cy="108" r="5" fill="#7c3aed" fillOpacity="0.75" />
                                    {/* -- Output node -- */}
                                    <circle cx="194" cy="78" r="9" fill="#00d4ff" fillOpacity="0.15" stroke="#00d4ff" strokeWidth="1" strokeOpacity="0.5" className="nd-svg-node" />
                                    <circle cx="194" cy="78" r="5" fill="#00d4ff" fillOpacity="0.85" className="nd-svg-node" />
                                    {/* Outer ring on center node */}
                                    <circle cx="90" cy="72" r="11" fill="none" stroke="#00d4ff" strokeWidth="0.5" strokeOpacity="0.25" />
                                </svg>
                            </div>

                            {/* Title */}
                            <h2
                                className="text-xl font-black mb-2 uppercase tracking-widest"
                                style={{ color: 'var(--text-primary)' }}
                            >
                                {t('chat.welcome_title', { defaultValue: 'Nexus Intelligence Engine' })}
                            </h2>
                            <p className="text-sm max-w-sm mb-8" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
                                {t('chat.welcome_subtitle', { defaultValue: 'Multi-provider AI with real-time streaming, deep reasoning, and tool calling.' })}
                            </p>

                            {/* Feature pills */}
                            <div className={`flex items-center gap-2.5 mb-8 flex-wrap justify-center ${isRtl ? 'flex-row-reverse' : ''}`}>
                                {['⚡ Real-time Streaming', '🧠 Multi-Provider', '🔧 Tool Calling'].map(label => (
                                    <span key={label} className="nd-feature-pill">{label}</span>
                                ))}
                            </div>

                            {/* CTA */}
                            <button
                                onClick={() => createConversation()}
                                className="nd-btn-gradient flex items-center gap-2 px-7 py-3 rounded-2xl font-black text-sm tracking-wide transition-all"
                                style={{
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border-primary)',
                                    color: 'var(--accent-primary)',
                                    boxShadow: '0 0 18px rgba(0,212,255,0.12)',
                                }}
                            >
                                <Plus size={16} />
                                {t('chat.start_conversation', { defaultValue: 'Start Conversation' })}
                            </button>
                        </div>
                    ) : (
                        <>
                            {messages.map((msg, i) => <MessageBubble key={i} message={msg} isRtl={isRtl} />)}

                            {/* -- Semantic router indicator -- */}
                            {isStreaming && selectedToolsIndicator && selectedToolsIndicator.selected.length > 0 && (
                                <div className="px-2 mb-1 flex items-center gap-1.5 flex-wrap">
                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                        Tools selected:
                                    </span>
                                    {selectedToolsIndicator.selected.map(name => (
                                        <span
                                            key={name}
                                            style={{
                                                fontSize: '0.65rem',
                                                padding: '1px 6px',
                                                borderRadius: '999px',
                                                background: 'rgba(0,212,255,0.08)',
                                                border: '1px solid rgba(0,212,255,0.2)',
                                                color: 'var(--accent-primary)',
                                                fontFamily: 'monospace',
                                            }}
                                            title={`relevance: ${selectedToolsIndicator.scores[name] ?? '?'}`}
                                        >
                                            {name}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* -- Live tool calls + agent thoughts during streaming -- */}
                            {isStreaming && (activeToolCalls.length > 0 || agentThoughts.length > 0) && (
                                <div className="px-2 mb-1">
                                    {agentThoughts.map((t) => (
                                        <AgentThoughtBubble
                                            key={t.iteration}
                                            iteration={t.iteration}
                                            thought={t.thought}
                                            isStreaming={t.streaming}
                                        />
                                    ))}
                                    {activeToolCalls.map((tc) => (
                                        <ToolCallCard
                                            key={tc.callId}
                                            toolName={tc.toolName}
                                            callId={tc.callId}
                                            icon={tc.icon}
                                            status={tc.status}
                                            output={tc.output}
                                            error={tc.error}
                                            executionTimeMs={tc.executionTimeMs}
                                            arguments={tc.args}
                                        />
                                    ))}
                                </div>
                            )}

                            {isStreaming && streamingMessage && (streamingMessage.reply || streamingMessage.thought) && (
                                <MessageBubble message={{ role: 'assistant', content: streamingMessage.reply, thinking: streamingMessage.thought, done: false }} isRtl={isRtl} />
                            )}
                            {isStreaming && (
                                <motion.div
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.18 }}
                                    className={`flex items-center gap-3 py-2 ${isRtl ? 'flex-row-reverse' : ''}`}
                                >
                                    {/* AI avatar */}
                                    <div className="nd-avatar-ai w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <Loader2 size={13} className="animate-spin" />
                                    </div>
                                    {/* Bubble with dots + status */}
                                    <div
                                        className="nd-bubble-ai flex items-center gap-3"
                                        style={{ padding: '10px 14px' }}
                                    >
                                        <div className="flex gap-1.5 items-center">
                                            <span className="nd-dot" />
                                            <span className="nd-dot" />
                                            <span className="nd-dot" />
                                        </div>
                                        {statusMessage && (
                                            <span
                                                className="text-[9px] font-black uppercase tracking-widest"
                                                style={{ color: 'var(--text-muted)' }}
                                            >
                                                {statusMessage}
                                            </span>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>

                {/* Input Bar */}
                <ChatInput
                    isRtl={isRtl} t={t} activeConvId={activeConvId} isRecording={isRecording}
                    inputRef={inputRef} inputValue={inputValue} setInputValue={setInputValue}
                    handleKeyDown={handleKeyDown} isStreaming={isStreaming}
                    isSearchEnabled={isSearchEnabled} setIsSearchEnabled={setIsSearchEnabled}
                    isSwarmEnabled={isSwarmEnabled} setIsSwarmEnabled={setIsSwarmEnabled}
                    kbFileRef={kbFileRef} handleKBUpload={handleKBUpload} kbStatus={kbStatus}
                    ttsEnabled={ttsEnabled} setTtsEnabled={setTtsEnabled} startRecording={startRecording}
                    stopRecording={stopRecording} abortRef={abortRef} sendMessage={sendMessage}
                    isModelDropdownOpen={isModelDropdownOpen} setIsModelDropdownOpen={setIsModelDropdownOpen}
                    modelStatus={modelStatus} selectedModelId={selectedModelId} fetchAllModels={fetchAllModels}
                    allModels={allModels} setSelectedModel={setSelectedModel} isDepthOpen={isDepthOpen}
                    setIsDepthOpen={setIsDepthOpen} currentDepth={currentDepth} SEARCH_DEPTHS={SEARCH_DEPTHS}
                    searchDepth={searchDepth} setSearchDepth={setSearchDepth}
                    activeProvider={activeProvider} availableProviders={availableProviders}
                    onProviderChange={setActiveProvider}
                    toolsEnabled={toolsEnabled} setToolsEnabled={setToolsEnabled}
                    enabledTools={enabledTools} onOpenToolSelector={() => setIsToolSelectorOpen(true)}
                    agentMode={agentMode} setAgentMode={setAgentMode}
                />

                {/* Cortex Neuro-Monitor HUD */}
                <NeuroMonitor />
            </div>
        </div>

        {/* -- Agent Replayer Modal (Direction 8 - Wildcard) -- */}
        <AnimatePresence>
            {isReplayerOpen && <AgentReplayer onClose={() => setIsReplayerOpen(false)} />}
        </AnimatePresence>
        </>
    );
}
