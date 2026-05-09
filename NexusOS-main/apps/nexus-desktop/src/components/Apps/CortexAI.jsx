import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useOSStore } from '../../store/osStore';
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

// Smart URL: use Vite proxy in browser mode to bypass CORS, direct URL in Electron mode
const IS_ELECTRON = !!window.nexusAPI;
const LM_STUDIO_BASE = IS_ELECTRON ? 'http://127.0.0.1:1234' : '/lmstudio';
const LM_STUDIO_URL = `${LM_STUDIO_BASE}/v1/chat/completions`;
const LM_STUDIO_MODELS_URL = `${LM_STUDIO_BASE}/v1/models`;

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

// Markdown Renderers and MessageBubble extracted to src/components/Chat/

// ═══════════════════════════════════════════════════
//  MAIN COMPONENT — Unified Chat Engine
// ═══════════════════════════════════════════════════
export default function CortexAI() {
    const { t } = useTranslation();
    const { systemLanguage } = useOSStore();
    const isRtl = systemLanguage === 'ar';

    // ── State ──
    const [conversations, setConversations] = useState([]);

    // Async LocalStorage Loading
    useEffect(() => {
        setTimeout(() => {
            try {
                const s = localStorage.getItem('nexus_chat_history');
                if (s) {
                    console.log(`[CortexAI] Lazy-loaded history: ${(s.length / 1024).toFixed(2)} KB`);
                    setConversations(JSON.parse(s));
                }
            } catch { }
        }, 100); // slight delay to free up main thread rendering
    }, []);
    const [activeConvId, setActiveConvId] = useState(null);
    const [inputValue, setInputValue] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [searchDepth, setSearchDepth] = useState('Normal');
    const [isDepthOpen, setIsDepthOpen] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [connectionMode, setConnectionMode] = useState('auto');
    const [isSearchEnabled, setIsSearchEnabled] = useState(false);

    // ── LM Studio Models ──
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState('');
    const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
    const [modelStatus, setModelStatus] = useState('offline'); // 'online', 'offline', 'loading'

    // ── Folders / Projects ──
    const [folders, setFolders] = useState(() => {
        try {
            const s = localStorage.getItem('nexus_chat_folders');
            return s ? JSON.parse(s) : [{ id: 'default', name: 'General', color: 'cyan', systemPrompt: '', expanded: true }];
        } catch { return [{ id: 'default', name: 'General', color: 'cyan', systemPrompt: '', expanded: true }]; }
    });
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

    // Persistence
    useEffect(() => { localStorage.setItem('nexus_chat_history', JSON.stringify(conversations)); }, [conversations]);
    useEffect(() => { localStorage.setItem('nexus_chat_folders', JSON.stringify(folders)); }, [folders]);
    // Auto-scroll
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conversations, activeConvId]);

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

    // ── Fetch LM Studio Models ──
    const fetchModels = useCallback(async () => {
        setModelStatus('loading');
        try {
            // Try direct fetch first
            const res = await fetch(LM_STUDIO_MODELS_URL, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            const modelList = (data.data || []).filter(m => !m.id.includes('embedding')).map(m => ({ id: m.id, name: m.id }));
            setModels(modelList);
            setModelStatus('online');
            setSelectedModel(prev => {
                if (!prev && modelList.length > 0) return modelList[0].id;
                if (prev && !modelList.some(m => m.id === prev)) return modelList.length > 0 ? modelList[0].id : '';
                return prev;
            });
        } catch {
            // Fallback: Try via nexusBridge IPC (Electron context)
            try {
                const bridgeRes = await nexusBridge.invoke('chat:getModels');
                if (bridgeRes?.models?.length) {
                    const modelList = bridgeRes.models.filter(m => !m.id?.includes('embedding')).map(m => ({ id: m.id || m, name: m.id || m }));
                    setModels(modelList);
                    setModelStatus('online');
                    setSelectedModel(prev => {
                        if (!prev && modelList.length > 0) return modelList[0].id;
                        if (prev && !modelList.some(m => m.id === prev)) return modelList.length > 0 ? modelList[0].id : '';
                        return prev;
                    });
                    return;
                }
            } catch { /* bridge not available */ }
            setModels([]);
            setModelStatus('offline');
        }
    }, []);

    useEffect(() => { fetchModels(); const t = setInterval(fetchModels, 30000); return () => clearInterval(t); }, [fetchModels]);

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

    const getFolderColor = (colorId) => FOLDER_COLORS.find(c => c.id === colorId) || FOLDER_COLORS[0];

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

        const userMsg = { role: 'user', content: inputValue.trim(), timestamp: new Date().toISOString(), done: true };
        const assistantMsg = { role: 'assistant', content: '', timestamp: new Date().toISOString(), done: false };

        setConversations(prev => prev.map(c =>
            c.id === convId
                ? { ...c, title: c.messages.length === 0 ? inputValue.substring(0, 40) : c.title, messages: [...c.messages, userMsg, assistantMsg] }
                : c
        ));
        const msgText = inputValue.trim();
        setInputValue('');
        setIsStreaming(true);
        setStatusMessage(t('chat.status.connecting', { defaultValue: 'Connecting...' }));

        // Build history
        const currentConv = conversations.find(c => c.id === convId);
        const history = (currentConv?.messages || []).slice(-8).map(m => ({ role: m.role, content: m.content }));

        // ── Strategy 1: Try nexusBridge first (Electron IPC or HTTP backend) ──
        if (connectionMode === 'auto' || connectionMode === 'bridge') {
            try {
                setStatusMessage('Routing through Nexus Bridge...');
                const res = await nexusBridge.invoke('hive:orchestrateTask', {
                    text: msgText,
                    context: 'Mode: General Intelligence',
                    model: selectedModel
                });

                if (res.success && res.response) {
                    const cleanText = res.response.replace(/\[\[(OPEN|CLOSE|WALLPAPER):[^\]]+\]\]/g, '').trim();
                    setConversations(prev => prev.map(c =>
                        c.id === convId
                            ? { ...c, messages: c.messages.map((m, i) => i === c.messages.length - 1 ? { ...m, content: cleanText, done: true } : m) }
                            : c
                    ));
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
        // Detect if user wrote in Arabic
        const userLangIsArabic = /[\u0600-\u06FF]/.test(msgText);
        const languageRule = userLangIsArabic
            ? `\nLANGUAGE RULE (ABSOLUTE): The user is writing in Arabic. You MUST reply ENTIRELY in Arabic. Not a single word in English, Chinese, Korean, Japanese, or any other language. If you need to mention a technical term, write it in Arabic script (transliterate it). For example: write "شات جي بي تي" not "ChatGPT". NEVER mix languages in your response.`
            : '';

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
3. If the user writes in Arabic, reply 100% in Arabic. If in English, reply in English.${languageRule}${searchInstructions}${activeProfile}${vaultContext}`;

        let maxTokens = 1500;
        if (searchDepth === 'Fastest') maxTokens = 400;
        if (searchDepth === 'Fast') maxTokens = 800;
        if (searchDepth === 'Think & Search') maxTokens = 2500;
        if (searchDepth === 'Deep Search') maxTokens = 4000;

        // Inject per-folder system prompt
        const activeFolder = getActiveFolder();
        const folderPrompt = activeFolder?.systemPrompt ? `\n\n[PROJECT CONTEXT]\n${activeFolder.systemPrompt}` : '';

        const payload = {
            model: selectedModel || 'local-model',
            messages: [{ role: 'system', content: systemPrompt + folderPrompt }, ...history, { role: 'user', content: msgText }],
            temperature: 0.6,
            max_tokens: maxTokens,
            stream: true,
        };

        console.log(`[CortexAI] Sending request to LM Studio. Model: ${payload.model}`);

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
                if (done) { if (isThinking && tokenBuffer) fullThought += tokenBuffer; break; }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const cleanLine = line.replace(/^data: /, '').trim();
                    if (!cleanLine || cleanLine === '[DONE]') continue;
                    try {
                        const json = JSON.parse(cleanLine);
                        const content = json.choices?.[0]?.delta?.content || '';
                        if (!content) continue;
                        tokenBuffer += content;

                        // Parse <think> tags in stream
                        let processing = true;
                        while (processing) {
                            if (isThinking) {
                                const endIdx = tokenBuffer.indexOf('</think>');
                                if (endIdx !== -1) {
                                    fullThought += tokenBuffer.substring(0, endIdx);
                                    tokenBuffer = tokenBuffer.substring(endIdx + 8);
                                    isThinking = false;
                                    setStatusMessage(t('chat.status.answering', { defaultValue: 'Answering...' }));
                                } else { if (tokenBuffer.length > 20 && !tokenBuffer.includes('<')) { fullThought += tokenBuffer; tokenBuffer = ''; } processing = false; }
                            } else {
                                const startIdx = tokenBuffer.indexOf('<think>');
                                if (startIdx !== -1) {
                                    if (startIdx > 0) fullReply += tokenBuffer.substring(0, startIdx);
                                    tokenBuffer = tokenBuffer.substring(startIdx + 7);
                                    isThinking = true;
                                    setStatusMessage(t('chat.status.reasoning', { defaultValue: 'Deep reasoning...' }));
                                } else {
                                    const lastAngle = tokenBuffer.lastIndexOf('<');
                                    if (lastAngle !== -1 && lastAngle > tokenBuffer.length - 8) {
                                        fullReply += tokenBuffer.substring(0, lastAngle);
                                        tokenBuffer = tokenBuffer.substring(lastAngle);
                                    } else { fullReply += tokenBuffer; tokenBuffer = ''; }
                                    processing = false;
                                }
                            }
                        }

                        setConversations(prev => prev.map(c =>
                            c.id === convId
                                ? { ...c, messages: c.messages.map((m, i) => i === c.messages.length - 1 ? { ...m, content: fullReply, thinking: fullThought } : m) }
                                : c
                        ));
                    } catch { /* skip malformed */ }
                }
            }

            if (tokenBuffer) { fullReply += tokenBuffer; }

            // ── System 1: Fact-Checker (post-generation verification) ──
            if (isSearchEnabled && fullReply.length > 100) {
                try {
                    setStatusMessage('🔍 Verifying response...');
                    const verification = await verifyResponse(msgText, fullReply, searchContext, selectedModel);
                    const correction = formatVerification(verification, userLangIsArabic);
                    if (correction) fullReply += correction;
                } catch { /* fact-check failed, continue */ }
            }

            setConversations(prev => prev.map(c =>
                c.id === convId
                    ? { ...c, messages: c.messages.map((m, i) => i === c.messages.length - 1 ? { ...m, content: fullReply, thinking: fullThought, done: true } : m) }
                    : c
            ));

            // Play the UI completion sound
            systemAudio.playNotification();

            // ── System 3: Memory Cortex tracking & Citadel Update ──
            try {
                const currentConvNow = conversations.find(c => c.id === convId);
                const allMsgs = currentConvNow?.messages || [];
                trackMessage(allMsgs, selectedModel);

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
            const errorMsg = err.name === 'AbortError'
                ? t('chat.status.cancelled', { defaultValue: 'Cancelled.' })
                : `⚠️ **Connection Failed**\n\nCouldn't reach LM Studio or the Nexus backend.\n\n**Checklist:**\n1. Is **LM Studio** running?\n2. Is a **chat model** loaded? (Embedding models won't work)\n3. Is the model server on \`localhost:1234\`?\n\n\`Error: ${err.message}\``;
            setConversations(prev => prev.map(c =>
                c.id === convId
                    ? { ...c, messages: c.messages.map((m, i) => i === c.messages.length - 1 ? { ...m, content: errorMsg, done: true } : m) }
                    : c
            ));
        } finally {
            setIsStreaming(false);
            setStatusMessage('');
            abortRef.current = null;
        }
    }, [inputValue, isStreaming, activeConvId, conversations, searchDepth, connectionMode, isSearchEnabled, isRtl, t]);

    const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
    const currentDepth = SEARCH_DEPTHS.find(d => d.id === searchDepth);

    return (
        <div className={`flex h-full bg-[#050810] text-slate-200 overflow-hidden font-sans ${isRtl ? 'flex-row-reverse' : ''}`} dir={isRtl ? 'rtl' : 'ltr'}>

            {/* ─── Sidebar ─── */}
            <ChatSidebar
                isRtl={isRtl} t={t} sidebarSearch={sidebarSearch} setSidebarSearch={setSidebarSearch}
                createConversation={createConversation} createFolder={createFolder} folders={folders}
                conversations={conversations} editingFolderId={editingFolderId} folderNameRef={folderNameRef}
                renameFolder={renameFolder} folderMenuOpen={folderMenuOpen} setFolderMenuOpen={setFolderMenuOpen}
                setEditingFolderId={setEditingFolderId} deleteFolder={deleteFolder} activeConvId={activeConvId}
                toggleFolderExpand={toggleFolderExpand} setActiveConvId={setActiveConvId} movingConvId={movingConvId}
                setMovingConvId={setMovingConvId} deleteConversation={deleteConversation} moveConversation={moveConversation}
                getFolderColor={getFolderColor}
            />

            {/* ─── Main Chat Area ─── */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar bg-[radial-gradient(circle_at_50%_50%,_rgba(6,182,212,0.03)_0%,_transparent_100%)]">
                    {!activeConvId ? (
                        <div className="h-full flex flex-col items-center justify-center text-center">
                            <div className="relative mb-6">
                                <div className="absolute inset-0 bg-cyan-500/20 blur-2xl rounded-full animate-pulse"></div>
                                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-cyan-500/10 to-purple-500/10 border border-white/5 flex items-center justify-center relative">
                                    <Cpu className="w-10 h-10 text-cyan-400/40" />
                                </div>
                            </div>
                            <h2 className="text-lg font-black text-white/80 mb-2 uppercase tracking-wider">
                                {t('chat.welcome_title', { defaultValue: 'Nexus Intelligence Engine' })}
                            </h2>
                            <p className="text-sm text-gray-500 max-w-md mb-8">
                                {t('chat.welcome_subtitle', { defaultValue: 'AI-powered conversations with real-time streaming, deep reasoning, and voice input.' })}
                            </p>
                            <button onClick={() => createConversation()}
                                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-all font-bold text-sm">
                                <Plus className="w-4 h-4" />
                                {t('chat.start_conversation', { defaultValue: 'Start Conversation' })}
                            </button>
                        </div>
                    ) : (
                        <>
                            {messages.map((msg, i) => <MessageBubble key={i} message={msg} isRtl={isRtl} />)}
                            {isStreaming && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`flex items-center gap-3 py-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                    <div className="w-8 h-8 rounded-xl bg-cyan-950 border border-cyan-500/30 text-cyan-400 flex items-center justify-center animate-pulse">
                                        <Loader2 size={14} className="animate-spin" />
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-cyan-500/60 font-bold tracking-wider uppercase">
                                        <span>{statusMessage}</span>
                                        <div className="flex gap-1">
                                            <span className="w-1.5 h-1.5 bg-cyan-500/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                            <span className="w-1.5 h-1.5 bg-cyan-500/50 rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></span>
                                            <span className="w-1.5 h-1.5 bg-cyan-500/50 rounded-full animate-bounce" style={{ animationDelay: '400ms' }}></span>
                                        </div>
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
                    kbFileRef={kbFileRef} handleKBUpload={handleKBUpload} kbStatus={kbStatus}
                    ttsEnabled={ttsEnabled} setTtsEnabled={setTtsEnabled} startRecording={startRecording}
                    stopRecording={stopRecording} abortRef={abortRef} sendMessage={sendMessage}
                    isModelDropdownOpen={isModelDropdownOpen} setIsModelDropdownOpen={setIsModelDropdownOpen}
                    modelStatus={modelStatus} selectedModel={selectedModel} fetchModels={fetchModels}
                    models={models} setSelectedModel={setSelectedModel} isDepthOpen={isDepthOpen}
                    setIsDepthOpen={setIsDepthOpen} currentDepth={currentDepth} SEARCH_DEPTHS={SEARCH_DEPTHS}
                    searchDepth={searchDepth} setSearchDepth={setSearchDepth}
                />
            </div>
        </div>
    );
}
