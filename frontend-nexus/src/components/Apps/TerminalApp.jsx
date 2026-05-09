import React, { useState, useRef, useEffect } from 'react';
import { Terminal as TerminalIcon } from 'lucide-react';
import { useOSStore } from '../../store/osStore';

const TerminalApp = () => {
    const { addToast } = useOSStore();
    const [history, setHistory] = useState([
        { type: 'output', content: 'NexusOS CLI v2.0 (Cortex AI Forged).' },
        { type: 'output', content: 'Connected to local host.' },
        { type: 'output', content: 'Type "help" or standard CLI commands.' }
    ]);
    const [input, setInput] = useState('');
    const inputRef = useRef(null);
    const bottomRef = useRef(null);

    useEffect(() => {
        if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [history]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const executeNativeCommand = async (cmd) => {
        try {
            const result = await window.nexusAPI.invoke('os:terminal', cmd);
            let finalOutput = '';
            if (result.stdout) finalOutput += result.stdout;
            if (result.stderr) finalOutput += `\n[STDERR]: ${result.stderr}`;
            if (result.error) finalOutput += `\n[ERROR]: ${result.error}`;

            return finalOutput || 'Command executed silently.';
        } catch (err) {
            return `[IPC Error]: ${err.message}`;
        }
    };

    const handleCommand = async (cmd) => {
        const trimmed = cmd.trim();
        if (!trimmed) return;

        setHistory(prev => [
            ...prev,
            { type: 'command', content: cmd }
        ]);

        const main = trimmed.split(' ')[0].toLowerCase();
        let output = '';

        if (main === 'clear') {
            setHistory([]);
            return;
        } else if (main === 'exit') {
            addToast('Terminal session detached.', 'info');
            output = 'Session closed.';
        } else {
            // Forward to native OS terminal via IPC
            output = await executeNativeCommand(cmd);
        }

        if (output) {
            setHistory(prev => [
                ...prev,
                { type: 'output', content: output }
            ]);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleCommand(input);
            setInput('');
        }
    };

    return (
        <div
            className="flex flex-col h-full bg-black/95 text-green-500 font-mono text-sm p-2 overflow-hidden border border-white/10 rounded-b-lg backdrop-blur-xl"
            onClick={() => inputRef.current?.focus()}
        >
            <div className="flex-1 overflow-auto p-2 custom-scrollbar">
                {history.map((line, i) => (
                    <div key={i} className={`whitespace-pre-wrap ${line.type === 'command' ? 'text-white mt-1' : 'text-green-400/80 mb-1'}`}>
                        {line.type === 'command' && <span className="text-cyan-400 mr-2">root@nexus-os:~#</span>}
                        {line.content}
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
            <div className="flex items-center gap-2 p-2 border-t border-white/10 bg-black">
                <span className="text-cyan-400">root@nexus-os:~#</span>
                <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 bg-transparent border-none focus:outline-none text-white caret-green-500"
                    autoFocus
                    spellCheck="false"
                />
            </div>
        </div>
    );
};

export default TerminalApp;
