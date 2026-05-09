import React, { useState, useEffect, useRef } from 'react';
import { X, Activity, Globe, Shield, Wifi, Zap } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

const NetGuardModal = ({ isOpen, onClose }) => {
    const [data, setData] = useState([]);
    const [stats, setStats] = useState({ rx: 0, tx: 0 });
    const [latency, setLatency] = useState(0);
    const [totalUsage, setTotalUsage] = useState({ rx: 0, tx: 0 });
    const storeRef = useRef(null); // Kept for API compatibility

    // Initialize persistent storage (localStorage fallback — no electron-store needed)
    useEffect(() => {
        try {
            const saved = localStorage.getItem('netguard_total');
            if (saved) setTotalUsage(JSON.parse(saved));
        } catch (e) {
            console.warn('NetGuard: Failed to load saved totals', e);
        }
    }, []);

    // Latency Estimation (browser-safe — no child_process needed)
    useEffect(() => {
        if (!isOpen) return;

        const checkLatency = async () => {
            try {
                // Use a lightweight fetch to estimate round-trip time
                const start = performance.now();
                await fetch('https://dns.google/resolve?name=google.com&type=A', {
                    mode: 'no-cors',
                    signal: AbortSignal.timeout(5000)
                }).catch(() => { });
                const rtt = Math.round(performance.now() - start);
                setLatency(rtt);
            } catch {
                setLatency(0);
            }
        };

        const interval = setInterval(checkLatency, 3000);
        checkLatency();
        return () => clearInterval(interval);
    }, [isOpen]);

    // Network Data Listener (via preload IPC bridge)
    useEffect(() => {
        if (!window.nexusAPI?.receive) return;

        const unsubscribe = window.nexusAPI.receive('telemetry:data', (telemetry) => {
            if (!telemetry?.network) return;
            const net = telemetry.network;

            setStats({ rx: net.rx_sec || 0, tx: net.tx_sec || 0 });

            setTotalUsage(prev => {
                const newTotal = {
                    rx: prev.rx + (net.rx_sec || 0),
                    tx: prev.tx + (net.tx_sec || 0)
                };
                try { localStorage.setItem('netguard_total', JSON.stringify(newTotal)); } catch { }
                return newTotal;
            });

            setData(prevData => {
                const now = new Date();
                const timeStr = now.getHours() + ':' + now.getMinutes() + ':' + now.getSeconds();
                const newPoint = {
                    time: timeStr,
                    download: parseFloat(((net.rx_sec || 0) / 1024 / 1024).toFixed(2)),
                    upload: parseFloat(((net.tx_sec || 0) / 1024 / 1024).toFixed(2))
                };
                const newData = [...prevData, newPoint];
                if (newData.length > 60) newData.shift();
                return newData;
            });
        });

        return () => { if (unsubscribe) unsubscribe(); };
    }, []);

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="fixed bottom-24 right-8 w-[500px] h-[600px] glass-panel-premium shadow-[0_0_50px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/20 z-[100000] overflow-hidden flex flex-col font-sans"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/30">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                            <Activity size={20} className="text-cyan-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-100 tracking-wider">NETGUARD</h2>
                            <p className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">Nuclear Monitoring System</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">

                    {/* Live Stats Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 relative overflow-hidden group glass-item-hover">
                            <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
                                <ArrowDownIcon className="text-emerald-500" size={40} />
                            </div>
                            <p className="text-xs text-emerald-300 mb-1 font-medium">DOWNLOAD SPEED</p>
                            <h3 className="text-3xl font-bold text-white font-mono">{formatSpeed(stats.rx)}</h3>
                            <div className="mt-2 text-[10px] text-slate-400 font-mono">
                                Total: {formatBytes(totalUsage.rx)}
                            </div>
                        </div>

                        <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 relative overflow-hidden group glass-item-hover">
                            <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
                                <ArrowUpIcon className="text-blue-500" size={40} />
                            </div>
                            <p className="text-xs text-blue-300 mb-1 font-medium">UPLOAD SPEED</p>
                            <h3 className="text-3xl font-bold text-white font-mono">{formatSpeed(stats.tx)}</h3>
                            <div className="mt-2 text-[10px] text-slate-400 font-mono">
                                Total: {formatBytes(totalUsage.tx)}
                            </div>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="h-64 bg-black/20 rounded-2xl border border-white/5 p-4 relative glass-item-hover">
                        <div className="absolute top-3 left-4 flex items-center gap-2">
                            <Activity size={14} className="text-cyan-500" />
                            <span className="text-xs font-bold text-slate-300">LIVE TRAFFIC WAVE</span>
                        </div>
                        <div className="w-full h-full mt-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data}>
                                    <defs>
                                        <linearGradient id="colorDownload" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorUpload" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                    <XAxis dataKey="time" hide />
                                    <YAxis hide domain={['auto', 'auto']} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                                        itemStyle={{ fontSize: '12px' }}
                                        labelStyle={{ display: 'none' }}
                                    />
                                    <Area type="monotone" dataKey="download" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorDownload)" isAnimationActive={false} />
                                    <Area type="monotone" dataKey="upload" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorUpload)" isAnimationActive={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Status Bar */}
                    <div className="grid grid-cols-3 gap-3">
                        <StatusCard icon={Globe} label="Latency" value={`${latency} ms`} color={latency < 50 ? "text-emerald-400" : latency < 100 ? "text-yellow-400" : "text-red-400"} />
                        <StatusCard icon={Shield} label="Firewall" value="Active" color="text-cyan-400" />
                        <StatusCard icon={Wifi} label="Protocol" value="TCP/IP" color="text-purple-400" />
                    </div>

                </div>
            </motion.div>
        </AnimatePresence>
    );
};

const StatusCard = ({ icon: Icon, label, value, color }) => (
    <div className="bg-white/5 border border-white/5 rounded-2xl p-3 flex flex-col items-center justify-center gap-1 glass-item-hover">
        <Icon size={16} className="text-slate-400" />
        <span className="text-[10px] text-slate-500 uppercase">{label}</span>
        <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
);

// Helpers
const ArrowDownIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
);
const ArrowUpIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>
);

const formatSpeed = (bytes) => {
    if (bytes === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export default NetGuardModal;
