import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { authService } from '../../services/authService';

export default function AdminPanel() {
    const { t } = useTranslation();
    const [users, setUsers] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);
    const currentUser = authService.getUser() || { role: 'standard' };

    useEffect(() => {
        if (currentUser.role === 'admin' || currentUser.role === 'master_admin') {
            fetchUsers();
        }
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        setError('');
        try {
            const token = authService.getToken();
            const response = await window.nexusAPI.invoke('cloud:request', {
                endpoint: '/admin/users',
                method: 'GET',
                token
            });
            if (response.status === 'success') {
                setUsers(response.data);
            } else {
                setError(response.message || 'Access Denied');
            }
        } catch (err) {
            setError(t('os.error_fetch_users') || 'Failed to sync with Atlas network.');
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (userId, endpoint, method, data = {}) => {
        setActionLoading(userId);
        try {
            const token = authService.getToken();
            const response = await window.nexusAPI.invoke('cloud:request', {
                endpoint,
                method,
                data,
                token
            });
            if (response.status === 'success') {
                await fetchUsers();
            } else {
                setError(response.message);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setActionLoading(null);
        }
    };

    if (currentUser.role === 'standard') {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-black/40 text-center">
                <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center text-4xl mb-6 border border-red-500/30">
                    🚫
                </div>
                <h2 className="text-2xl font-bold text-red-400 mb-2">Access Restricted</h2>
                <p className="text-gray-400 max-w-md">
                    This sector is reserved for OS Administrators. Your credentials lack the necessary clearance level.
                </p>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col bg-gray-950/50 backdrop-blur-xl relative overflow-hidden group">
            {/* Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                        <span className="text-cyan-400">🛡️</span> Admin Control Center
                    </h2>
                    <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-semibold">User Management & System Security</p>
                </div>
                <button
                    onClick={fetchUsers}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-cyan-400"
                    title="Refresh Data"
                >
                    🔄
                </button>
            </div>

            {/* Error Message */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="bg-red-500/10 border-b border-red-500/20 px-6 py-3 flex items-center justify-between"
                    >
                        <span className="text-sm text-red-300 font-medium">{error}</span>
                        <button onClick={() => setError('')} className="text-red-400 hover:text-white">✕</button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Content Container */}
            <div className="flex-1 overflow-auto p-6 custom-scrollbar">
                {loading ? (
                    <div className="w-full h-64 flex flex-col items-center justify-center text-gray-500">
                        <div className="w-12 h-12 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-4"></div>
                        <p className="text-sm animate-pulse tracking-widest uppercase">Decryption in progress...</p>
                    </div>
                ) : (
                    <table className="w-full border-separate border-spacing-y-3">
                        <thead>
                            <tr className="text-left text-xs font-bold text-gray-500 uppercase tracking-widest px-4">
                                <th className="pb-2 pl-4">Identification</th>
                                <th className="pb-2">Authorization</th>
                                <th className="pb-2">Security Status</th>
                                <th className="pb-2 text-right pr-4">Directives</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <motion.tr
                                    layout
                                    key={user._id}
                                    className="bg-white/[0.03] hover:bg-white/[0.08] transition-colors border border-white/5 shadow-sm rounded-xl"
                                >
                                    <td className="py-4 pl-4 rounded-l-xl">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-lg border border-white/10">
                                                {user.email.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold text-white">{user.email}</div>
                                                <div className="text-[10px] text-gray-500 font-mono">ID: {user._id.substring(0, 10)}...</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${user.role === 'master_admin' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                                user.role === 'admin' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                                                    'bg-white/10 text-gray-400 border border-white/10'
                                            }`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="py-4">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${user.isActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`}></div>
                                            <span className={`text-[11px] font-medium ${user.isActive ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {user.isActive ? 'OPERATIONAL' : 'TERMINATED'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-4 pr-4 text-right rounded-r-xl">
                                        <div className="flex justify-end gap-2 items-center">
                                            {/* Ban/Unban */}
                                            {user.role !== 'master_admin' && (
                                                <button
                                                    onClick={() => handleAction(user._id, `/admin/users/${user._id}/status`, 'PUT', { isActive: !user.isActive })}
                                                    disabled={actionLoading === user._id}
                                                    className={`p-2 rounded-lg border transition-all ${user.isActive
                                                            ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
                                                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                                                        }`}
                                                    title={user.isActive ? 'Revoke Access' : 'Restore Access'}
                                                >
                                                    {user.isActive ? '🚫' : '🔓'}
                                                </button>
                                            )}

                                            {/* Promote */}
                                            {currentUser.role === 'master_admin' && user.role === 'standard' && (
                                                <button
                                                    onClick={() => handleAction(user._id, `/admin/users/${user._id}/promote`, 'PUT')}
                                                    disabled={actionLoading === user._id}
                                                    className="p-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 rounded-lg"
                                                    title="Elevate Authorization"
                                                >
                                                    ⬆️
                                                </button>
                                            )}

                                            {/* Delete */}
                                            {currentUser.role === 'master_admin' && user.role !== 'master_admin' && (
                                                <button
                                                    onClick={() => {
                                                        if (confirm(`Security Protocol: Are you sure you want to PERMANENTLY delete user ${user.email}?`)) {
                                                            handleAction(user._id, `/admin/users/${user._id}`, 'DELETE');
                                                        }
                                                    }}
                                                    disabled={actionLoading === user._id}
                                                    className="p-2 bg-red-900/20 border border-red-500/20 text-red-500 hover:bg-red-500/30 rounded-lg"
                                                    title="Purge Identity"
                                                >
                                                    🗑️
                                                </button>
                                            )}

                                            {user.role === 'master_admin' && (
                                                <span className="text-[10px] text-gray-600 italic px-2">IMMUTABLE</span>
                                            )}
                                        </div>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {!loading && users.length === 0 && (
                    <div className="w-full py-20 flex flex-col items-center justify-center text-gray-500">
                        <span className="text-4xl mb-4 opacity-20">📡</span>
                        <p>No external user data detected on Atlas.</p>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/5 bg-black/20 flex justify-between items-center text-[10px] text-gray-500 font-mono tracking-tighter">
                <div>NEXUS OS v2.0 - CORE SECURITY MODULE</div>
                <div>SECURE LINK: ACTIVE // LATENCY: LOW</div>
            </div>
        </div>
    );
}
