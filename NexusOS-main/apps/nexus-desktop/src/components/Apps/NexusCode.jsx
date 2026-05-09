import React, { useState, useEffect, useRef } from 'react';
import { Editor } from '@monaco-editor/react';
import { Search, FolderOpen, FileCode2, Command, Play, Plus, X, FolderTree, Cpu, Server, Save } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ThinkingAccordion from './ThinkingAccordion';
import ToolCallLog from './ToolCallLog';
import nexusBridge from '../../services/bridge';

const languageMap = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    css: 'css',
    html: 'html',
    py: 'python',
    md: 'markdown'
};

const getLanguageFromExt = (filename) => {
    if (!filename) return 'plaintext';
    const ext = filename.split('.').pop().toLowerCase();
    return languageMap[ext] || 'plaintext';
};

const FileTreeItem = ({ item, onClick, isSelected, level = 0 }) => {
    const paddingLeft = `${level * 16}px`;

    return (
        <div
            className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer text-sm
                ${isSelected ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-400 hover:bg-white/5 hover:text-white'}
                transition-colors duration-200 select-none group`}
            style={{ paddingLeft }}
            onClick={() => onClick(item)}
        >
            {item.isDirectory ? (
                <FolderTree className="w-4 h-4 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
            ) : (
                <FileCode2 className={`w-4 h-4 
                    ${item.name.endsWith('.js') || item.name.endsWith('.jsx') ? 'text-yellow-400' :
                        item.name.endsWith('.css') ? 'text-blue-400' :
                            item.name.endsWith('.json') ? 'text-green-400' : 'text-gray-400'}`}
                />
            )}
            <span className="truncate">{item.name}</span>
        </div>
    );
};

export default function NexusCode() {
    // ---- Editor State ----
    const [currentPath, setCurrentPath] = useState(null); // The project root being viewed
    const [fileTree, setFileTree] = useState([]);
    const [openTabs, setOpenTabs] = useState([]); // { path, name, isDirty, content }
    const [activeTab, setActiveTab] = useState(null); // path of the active tab

    // ---- AI State ----
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [brainStatus, setBrainStatus] = useState({ state: 'idle' });

    const editorRef = useRef(null);
    const chatEndRef = useRef(null);

    // Initialize File Explorer
    useEffect(() => {
        loadHomeDirectory();

        // Listen to brain status
        const cleanup = nexusBridge.receive('prime:status-update', (event, status) => {
            setBrainStatus(status);
        });

        // Initial ping for status
        nexusBridge.invoke('prime:status').then(res => {
            if (res && res.state) setBrainStatus(res);
        }).catch(err => console.error(err));

        return cleanup;
    }, []);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ---- File Operations ----
    const loadHomeDirectory = async () => {
        try {
            // By default project root (or fallback to home)
            const root = 'D:\\NexusOS-main'; // Defaulting to our known workspace
            const items = await nexusBridge.invoke('fs:list', root);
            setCurrentPath(root);
            if (Array.isArray(items)) {
                setFileTree(items);
            }
        } catch (error) {
            console.error("Failed to load directory", error);
        }
    };

    const handleFileClick = async (item) => {
        if (item.isDirectory) {
            // For phase 1, we just do flat navigation a level deep for simplicity
            // A full recursive tree would require more state management
            const items = await nexusBridge.invoke('fs:list', item.path);
            if (Array.isArray(items)) {
                setCurrentPath(item.path);
                setFileTree(items);
            }
        } else {
            // Open file
            openFile(item.path, item.name);
        }
    };

    const goUpDirectory = async () => {
        if (!currentPath) return;
        const parentPath = currentPath.split('\\').slice(0, -1).join('\\') || 'C:\\';
        const items = await nexusBridge.invoke('fs:list', parentPath);
        if (Array.isArray(items)) {
            setCurrentPath(parentPath);
            setFileTree(items);
        }
    };

    const openFile = async (filePath, fileName) => {
        // If already open, just switch to it
        if (openTabs.find(t => t.path === filePath)) {
            setActiveTab(filePath);
            return;
        }

        // Read from backend
        try {
            const content = await nexusBridge.invoke('fs:read', { path: filePath, format: 'utf8' });
            if (typeof content === 'string') {
                setOpenTabs(prev => [...prev, { path: filePath, name: fileName, isDirty: false, content }]);
                setActiveTab(filePath);
            } else if (content.error) {
                console.error("Read error:", content.error);
            }
        } catch (error) {
            console.error("Failed to read file", error);
        }
    };

    const closeTab = (e, path) => {
        e.stopPropagation();
        const tab = openTabs.find(t => t.path === path);
        if (tab?.isDirty) {
            // TODO: Proper unsaved changes dialog. For now, force close.
            if (!window.confirm(`Save changes to ${tab.name}?`)) return;
        }

        const newTabs = openTabs.filter(t => t.path !== path);
        setOpenTabs(newTabs);
        if (activeTab === path) {
            setActiveTab(newTabs.length > 0 ? newTabs[newTabs.length - 1].path : null);
        }
    };

    const handleEditorChange = (value) => {
        if (!activeTab) return;
        setOpenTabs(tabs => tabs.map(tab =>
            tab.path === activeTab ? { ...tab, content: value, isDirty: true } : tab
        ));
    };

    const handleEditorMount = (editor, monaco) => {
        editorRef.current = editor;

        // Add save command (Ctrl+S / Cmd+S)
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            saveCurrentFile();
        });
    };

    const saveCurrentFile = async () => {
        if (!activeTab) return;
        const tab = openTabs.find(t => t.path === activeTab);
        if (!tab || !tab.isDirty) return;

        try {
            const result = await nexusBridge.invoke('fs:write', { path: tab.path, content: tab.content });
            if (result.success) {
                setOpenTabs(tabs => tabs.map(t =>
                    t.path === activeTab ? { ...t, isDirty: false } : t
                ));
            } else {
                console.error("Save failed:", result.error);
                // Optionally fire a toastbus event here
            }
        } catch (error) {
            console.error("Failed to save file", error);
        }
    };

    // ---- AI Operations ----
    const sendChatMessage = async () => {
        if (!input.trim() || isThinking) return;

        const userText = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        setIsThinking(true);

        // Prepare context — inject current file if open
        let activeContent = "";
        const currentTabObj = openTabs.find(t => t.path === activeTab);
        if (currentTabObj) {
            activeContent = `\n\n[Context: The user is currently editing: ${currentTabObj.path}]\n\`\`\`${getLanguageFromExt(currentTabObj.name)}\n${currentTabObj.content}\n\`\`\`\n`;
        }

        const augmentedMessage = userText + activeContent;

        try {
            const response = await nexusBridge.invoke('prime:chat', augmentedMessage);

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: response.response,
                thinking: response.thinking,
                toolCalls: response.toolCalls,
                patches: response.patches
            }]);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', content: `[SYSTEM ERROR] Failed to connect to Nexus-Prime AI Engine: ${error.message}` }]);
        } finally {
            setIsThinking(false);
        }
    };

    const applyAIPatch = async (patch) => {
        if (!patch || !patch.file) return;
        // Re-read file just to be safe, then apply. For Phase 1, we just fetch patches state from backend.
        // Actually, Nexus-Prime handles patching via 'prime:approve-patch'.
        const result = await nexusBridge.invoke('prime:approve-patch', patch.id);
        if (result.success) {
            // Reload the file if it's currently open!
            const isOpen = openTabs.find(t => t.path === result.file);
            if (isOpen) {
                // Reload from disk
                const newContent = await nexusBridge.invoke('fs:read', { path: result.file, format: 'utf8' });
                if (typeof newContent === 'string') {
                    setOpenTabs(tabs => tabs.map(tab =>
                        tab.path === result.file ? { ...tab, content: newContent, isDirty: false } : tab
                    ));

                    // Highlight the tab
                    setActiveTab(result.file);
                }
            }
        }
    };

    const activeTabData = openTabs.find(t => t.path === activeTab);

    return (
        <div className="flex h-full w-full bg-[#0d1117] text-gray-300 font-sans overflow-hidden border border-white/5 shadow-2xl rounded-lg">

            {/* Left Sidebar - File Explorer */}
            <div className="w-64 flex-shrink-0 border-r border-white/10 bg-[#0A0D11] flex flex-col">
                <div className="h-10 border-b border-white/10 flex items-center justify-between px-3 shrink-0">
                    <span className="text-xs font-semibold tracking-wider text-gray-400 uppercase">Explorer</span>
                    <button onClick={goUpDirectory} className="p-1 hover:bg-white/10 rounded-md transition-colors" title="Go Up">
                        <FolderOpen className="w-4 h-4 text-gray-400" />
                    </button>
                </div>
                <div className="px-3 py-2 text-xs truncate text-cyan-500/70 border-b border-white/5 bg-cyan-900/10" title={currentPath}>
                    {currentPath || "No Folder Opened"}
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
                    {fileTree.map((item, i) => (
                        <FileTreeItem
                            key={i}
                            item={item}
                            onClick={handleFileClick}
                            isSelected={activeTab === item.path}
                        />
                    ))}
                    {fileTree.length === 0 && (
                        <div className="text-center text-xs text-gray-600 mt-10">Empty Directory</div>
                    )}
                </div>
            </div>

            {/* Center - Monaco Editor */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Tabs Area */}
                <div className="flex h-10 border-b border-white/10 bg-[#0d1117] overflow-x-auto custom-scrollbar shrink-0">
                    {openTabs.map(tab => (
                        <div
                            key={tab.path}
                            onClick={() => setActiveTab(tab.path)}
                            className={`flex items-center gap-2 px-4 border-r border-white/5 cursor-pointer max-w-[200px] group
                                ${activeTab === tab.path ? 'bg-[#161b22] border-t-2 border-t-cyan-500 text-cyan-50' : 'bg-[#0A0D11] text-gray-500 hover:bg-[#161b22]/50'}`}
                        >
                            <FileCode2 className={`w-4 h-4 shrink-0 ${activeTab === tab.path ? 'text-cyan-400' : 'text-gray-600'}`} />
                            <span className="truncate text-sm select-none">{tab.name}</span>
                            {tab.isDirty && <div className="w-2 h-2 rounded-full bg-yellow-500 shrink-0"></div>}
                            <button
                                onClick={(e) => closeTab(e, tab.path)}
                                className={`p-0.5 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity ${activeTab === tab.path ? 'hover:bg-cyan-500/20 text-cyan-400' : 'hover:bg-white/10'}`}
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                    {openTabs.length === 0 && (
                        <div className="flex-1 flex items-center justify-center text-xs text-gray-600">
                            NexusCode Engine
                        </div>
                    )}
                </div>

                {/* Editor Content */}
                <div className="flex-1 relative bg-[#0A0D11]">
                    {activeTabData ? (
                        <Editor
                            height="100%"
                            language={getLanguageFromExt(activeTabData.name)}
                            theme="vs-dark"
                            value={activeTabData.content}
                            onChange={handleEditorChange}
                            onMount={handleEditorMount}
                            options={{
                                minimap: { enabled: true, renderCharacters: false, scale: 0.75 },
                                fontSize: 13,
                                fontFamily: "'Fira Code', 'Menlo', 'Monaco', 'Courier New', monospace",
                                fontLigatures: true,
                                smoothScrolling: true,
                                cursorBlinking: 'smooth',
                                cursorSmoothCaretAnimation: 'on',
                                padding: { top: 16, bottom: 16 },
                                renderWhitespace: 'boundary',
                                wordWrap: 'on'
                            }}
                        />
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20 pointer-events-none">
                            <Cpu className="w-32 h-32 mb-6" />
                            <h2 className="text-2xl font-bold tracking-widest text-center">NEXUS CODE<br /><span className="text-sm font-normal tracking-[0.3em]">AI-Powered Development Environment</span></h2>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Sidebar - AI Chat Agent */}
            <div className="w-80 flex-shrink-0 border-l border-white/10 bg-[#0A0D11] flex flex-col">
                <div className="h-10 border-b border-white/10 flex items-center justify-between px-3 shrink-0 bg-gradient-to-r from-violet-900/20 to-transparent">
                    <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-violet-400" />
                        <span className="text-xs font-semibold tracking-wider text-violet-300 uppercase">Nexus Agent</span>
                    </div>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {messages.length === 0 && (
                        <div className="text-center text-xs text-gray-500 mt-4 leading-relaxed">
                            <p>Hi, I am Nexus-Prime.</p>
                            <p className="mt-2">I can read your code, execute commands, and write files.</p>
                        </div>
                    )}

                    {messages.map((msg, i) => (
                        <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${msg.role === 'user'
                                ? 'bg-violet-600/30 text-white border border-violet-500/30'
                                : 'bg-[#161b22] text-gray-300 border border-white/5'
                                }`}>
                                {msg.role === 'assistant' && msg.thinking && <ThinkingAccordion thinking={msg.thinking} />}
                                {msg.role === 'assistant' && msg.toolCalls && <ToolCallLog toolCalls={msg.toolCalls} />}

                                <div className="prose prose-invert prose-sm max-w-none text-gray-300">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>

                                {msg.patches && msg.patches.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        {msg.patches.map((p, idx) => (
                                            <div key={idx} className="p-2 bg-black/40 rounded border border-emerald-500/20">
                                                <div className="text-xs text-emerald-400 mb-2 truncate">Patch generated for: {p.file}</div>
                                                <button
                                                    onClick={() => applyAIPatch(p)}
                                                    className="w-full py-1 text-xs bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 rounded border border-emerald-500/30 transition-colors"
                                                >
                                                    Inject Patch into Editor
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {isThinking && (
                        <div className="flex items-center gap-2 text-xs text-violet-400 opacity-60">
                            <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-ping"></div>
                            Agent is reasoning...
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-3 border-t border-white/10 bg-black/20 shrink-0">
                    <div className="relative">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    sendChatMessage();
                                }
                            }}
                            placeholder={activeTab ? `Ask about ${activeTab.split('\\').pop()}...` : "Ask the AI Agent..."}
                            className="w-full bg-[#161b22] border border-white/10 rounded-lg pl-3 pr-10 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 resize-none custom-scrollbar"
                            rows={3}
                        />
                        <button
                            onClick={sendChatMessage}
                            disabled={isThinking || !input.trim()}
                            className="absolute right-2 bottom-2.5 p-1.5 rounded-md bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Play className="w-4 h-4 ml-0.5" />
                        </button>
                    </div>
                    <div className="mt-2 text-[10px] text-gray-500 flex justify-between px-1">
                        <span>Auto-includes active file context</span>
                        <span>Ctrl+S to save</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
