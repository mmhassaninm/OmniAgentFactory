import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useOSStore } from '../../store/osStore';

export default function Settings() {
    const { t } = useTranslation();
    const { systemLanguage, setSystemLanguage } = useOSStore();

    // Phase 28: Zero-Tolerance Secrets Manager State
    const [secrets, setSecrets] = useState({
        openAiKey: '',
        geminiKey: '',
        githubToken: ''
    });

    const [saveStatus, setSaveStatus] = useState('');

    useEffect(() => {
        // Load existing settings on mount
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const data = await window.nexusAPI.invoke('settings:getSettings');
            if (data && data.secrets) {
                setSecrets(data.secrets);
            }
        } catch (error) {
            console.error('Failed to load settings', error);
        }
    };

    const handleSaveSecrets = async () => {
        setSaveStatus('Saving...');
        try {
            // Send to Main Process for AES Encryption before hitting SQLite
            await window.nexusAPI.invoke('settings:updateSettings', { secrets });
            setSaveStatus('Secrets Encrypted & Saved Successfully.');
            setTimeout(() => setSaveStatus(''), 3000);
        } catch (error) {
            setSaveStatus('Failed to save secrets.');
        }
    };

    const handleLanguageChange = async (lang) => {
        setSystemLanguage(lang);
        // Persist language via IPC
        await window.nexusAPI.invoke('settings:updateSettings', { systemLanguage: lang });
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full bg-gray-900/80 backdrop-blur-3xl text-white p-8 overflow-y-auto custom-scrollbar"
        >
            <h1 className="text-3xl font-bold mb-8 bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-500">
                {t('os.settings')}
            </h1>

            {/* General Settings */}
            <section className="mb-10">
                <h2 className="text-xl font-semibold mb-4 text-emerald-400 border-b border-emerald-500/20 pb-2">
                    System Preferences
                </h2>

                <div className="bg-black/30 p-5 rounded-xl border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="font-medium">System Language</div>
                            <div className="text-sm text-gray-400">Requires a restart of Background AI Daemons to fully take effect.</div>
                        </div>
                        <select
                            value={systemLanguage}
                            onChange={(e) => handleLanguageChange(e.target.value)}
                            className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
                        >
                            <option value="en">English (LTR)</option>
                            <option value="ar">العربية (RTL)</option>
                        </select>
                    </div>
                </div>
            </section>

            {/* Phase 28: Secrets Manager */}
            <section className="mb-10">
                <h2 className="text-xl font-semibold mb-4 text-rose-400 border-b border-rose-500/20 pb-2 flex items-center gap-2">
                    🔐 Zero-Tolerance Secrets Manager
                </h2>
                <p className="text-sm text-gray-400 mb-4">
                    WARNING: Never hardcode these keys in project files. Keys entered here are violently encrypted via AES-256 before being written to the offline Local SQLite Vault.
                </p>

                <div className="bg-black/30 p-5 rounded-xl border border-white/5 space-y-5">

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">OpenAI API Key (GPT-4)</label>
                        <input
                            type="password"
                            value={secrets.openAiKey}
                            onChange={(e) => setSecrets({ ...secrets, openAiKey: e.target.value })}
                            placeholder="sk-..."
                            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-rose-500 transition-colors placeholder-gray-600 font-mono"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Google Gemini API Key</label>
                        <input
                            type="password"
                            value={secrets.geminiKey}
                            onChange={(e) => setSecrets({ ...secrets, geminiKey: e.target.value })}
                            placeholder="AIza..."
                            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-rose-500 transition-colors placeholder-gray-600 font-mono"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">GitHub Personal Access Token</label>
                        <input
                            type="password"
                            value={secrets.githubToken}
                            onChange={(e) => setSecrets({ ...secrets, githubToken: e.target.value })}
                            placeholder="ghp_..."
                            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-rose-500 transition-colors placeholder-gray-600 font-mono"
                        />
                    </div>

                    <div className="pt-4 flex items-center justify-between border-t border-white/5">
                        <span className={`text-sm ${saveStatus.includes('Failed') ? 'text-red-400' : 'text-emerald-400'}`}>
                            {saveStatus}
                        </span>
                        <button
                            onClick={handleSaveSecrets}
                            className="px-6 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white rounded-lg font-semibold shadow-lg shadow-rose-900/20 transition-all active:scale-95"
                        >
                            Encrypt & Save Vault
                        </button>
                    </div>

                </div>
            </section>

        </motion.div>
    );
}
