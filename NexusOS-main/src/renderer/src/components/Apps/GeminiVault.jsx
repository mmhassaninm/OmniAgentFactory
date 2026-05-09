import React, { useState, useEffect } from 'react';
import { Lock, Unlock, ShieldAlert, KeyRound, Loader2 } from 'lucide-react';
import { useOSStore } from '../../store/osStore';

const GeminiVault = () => {
    const { systemLanguage } = useOSStore();
    const isRtl = systemLanguage === 'ar';
    const [isLocked, setIsLocked] = useState(true);
    const [passkey, setPasskey] = useState('');
    const [statusMsg, setStatusMsg] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    // Initial Vault Status Check
    useEffect(() => {
        const unsub = checkVaultStatus();
        return () => {
            if (unsub) unsub();
        };
    }, []);

    const checkVaultStatus = () => {
        setIsLoading(true);
        const vaultUnsub = window.nexusAPI.receive('python:stdout', handleResponse);

        // Command python to check status
        window.nexusAPI.invoke('vault:command', { command: 'vault', action: 'status' });

        return vaultUnsub;
    };

    const handleResponse = (data) => {
        try {
            // Because our basic stub chat streams strings, we verify if it is JSON first
            const parsed = typeof data.output === 'string' ? JSON.parse(data.output) : data.output;
            if (parsed.status === 'success' && parsed.locked !== undefined) {
                setIsLocked(parsed.locked);
                setIsLoading(false);
            } else if (parsed.message) {
                setStatusMsg(parsed.message);
                setIsLoading(false);
                // Refresh status after lock/unlock
                if (parsed.status === 'success') {
                    setIsLocked(!isLocked);
                    setPasskey('');
                    setTimeout(() => setStatusMsg(''), 3000);
                }
            }
        } catch (e) {
            // Ignore non-vault JSON outputs (like chat stream) for now
            if (data.output && !data.output.includes('Python Core Daemon')) {
                // Silently ignore
            }
        }
    };

    const handleVaultAction = async (e) => {
        e.preventDefault();
        if (!passkey.trim()) return;

        setIsLoading(true);
        setStatusMsg('');

        const action = isLocked ? 'unlock' : 'lock';
        window.nexusAPI.invoke('vault:command', {
            command: 'vault',
            action: action,
            passkey: passkey
        });
    };

    return (
        <div className={`flex flex-col h-full bg-slate-900 text-slate-100 rounded-b-xl overflow-hidden font-sans p-6 items-center justify-center ${isRtl ? 'rtl' : 'ltr'}`}>

            <div className="max-w-md w-full bg-slate-800 border border-slate-700/50 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
                {/* Background glow */}
                <div className={`absolute -top-20 -right-20 w-40 h-40 bg-${isLocked ? 'red' : 'emerald'}-500/10 rounded-full blur-3xl pointer-events-none`}></div>

                <div className="flex flex-col items-center mb-8 relative z-10">
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${isLocked ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                        {isLoading ? <Loader2 size={32} className="animate-spin" /> :
                            isLocked ? <Lock size={32} /> : <Unlock size={32} />}
                    </div>
                    <h2 className="text-2xl font-bold tracking-wide">
                        {isRtl ? 'خزنة جيميناي الرقمية' : 'Gemini Vault'}
                    </h2>
                    <p className="text-sm text-slate-400 mt-2 text-center">
                        {isLocked
                            ? (isRtl ? 'الخزنة مغلقة تماماً ومخفية من النظام. أدخل مفتاح المرور لفك التشفير.' : 'Vault is locked and hidden from OS. Enter Passkey to decrypt.')
                            : (isRtl ? 'الخزنة مفتوحة والملفات مرئية. لا تنسى تشفيرها قبل المغادرة.' : 'Vault is unlocked and files are visible. Remember to lock before leaving.')
                        }
                    </p>
                </div>

                <form onSubmit={handleVaultAction} className="space-y-4 relative z-10">
                    <div className="relative">
                        <div className={`absolute inset-y-0 flex items-center pointer-events-none ${isRtl ? 'right-4' : 'left-4'}`}>
                            <KeyRound size={18} className="text-slate-500" />
                        </div>
                        <input
                            type="password"
                            value={passkey}
                            onChange={(e) => setPasskey(e.target.value)}
                            placeholder={isRtl ? "مفتاح المرور السري..." : "Secret Passkey..."}
                            className={`w-full bg-slate-900 border border-slate-700 rounded-xl py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-${isLocked ? 'emerald' : 'red'}-500 transition-colors ${isRtl ? 'pr-12 pl-4' : 'pl-12 pr-4'
                                }`}
                            dir="ltr" // Passwords generally LTR
                            disabled={isLoading}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={!passkey.trim() || isLoading}
                        className={`w-full py-3 px-4 rounded-xl flex justify-center items-center gap-2 font-medium transition-all shadow-lg ${passkey.trim() && !isLoading
                            ? (isLocked
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/50'
                                : 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/50')
                            : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                            }`}
                    >
                        {isLoading ? <Loader2 size={18} className="animate-spin" /> : (isLocked ? <Unlock size={18} /> : <Lock size={18} />)}
                        {isLocked ? (isRtl ? 'فك التشفير' : 'Decrypt & Unlock') : (isRtl ? 'تشفير وإغلاق' : 'Encrypt & Lock')}
                    </button>

                    {statusMsg && (
                        <div className={`flex items-center gap-2 mt-4 text-xs justify-center ${statusMsg.includes('error') || statusMsg.includes('Invalid') ? 'text-red-400' : 'text-emerald-400'
                            }`}>
                            <ShieldAlert size={14} />
                            <span>{statusMsg}</span>
                        </div>
                    )}
                </form>

            </div>
        </div>
    );
};

export default GeminiVault;
