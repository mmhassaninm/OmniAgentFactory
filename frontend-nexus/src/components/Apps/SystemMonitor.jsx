import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Cpu, Database, Thermometer, HardDrive, Gauge, Globe, Zap, Network, ShieldCheck } from 'lucide-react';
import { useOSStore } from '../../store/osStore';
import { useTranslation } from 'react-i18next';
import nexusBridge from '../../services/bridge.js';

const HISTORY_SIZE = 40;

// High-fidelity Sparkline Component
const Sparkline = ({ data, color, label, value, unit, icon: Icon }) => {
    const max = Math.max(...data, 1);
    const points = data.map((v, i) => {
        const x = (i / (HISTORY_SIZE - 1)) * 300;
        const y = 60 - (v / max) * 55;
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className="bg-black/20 rounded-2xl border border-white/5 p-4 flex flex-col gap-3 group hover:border-cyan-500/30 transition-all duration-500">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-white/5 text-slate-400 group-hover:bg-cyan-500/10 group-hover:text-cyan-400 transition-all">
                        <Icon size={14} />
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{label}</span>
                </div>
                <div className="flex items-baseline gap-1">
                    <span className="font-mono text-xl font-bold tracking-tighter" style={{ color }}>{value}</span>
                    <span className="text-[9px] text-slate-600 font-bold uppercase">{unit}</span>
                </div>
            </div>
            <div className="relative h-16 w-full overflow-hidden rounded-lg">
                <svg viewBox="0 0 300 65" className="w-full h-full" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                            <stop offset="100%" stopColor={color} stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <polygon
                        points={`0,65 ${points} 300,65`}
                        fill={`url(#grad-${label})`}
                    />
                    <polyline
                        points={points}
                        fill="none"
                        stroke={color}
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        className="drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]"
                    />
                </svg>
            </div>
        </div>
    );
};

const SystemMonitor = () => {
    const { systemLanguage } = useOSStore();
    const { t } = useTranslation();
    const isRtl = systemLanguage === 'ar';

    const [telemetry, setTelemetry] = useState({
        cpu: '0.0',
        memTotal: '0.0',
        memUsed: '0.0',
        memPercent: '0',
        temp: 'N/A',
        netIn: '0.0',
        netOut: '0.0',
        uptime: '00:00:00'
    });

    const [shieldStatus, setShieldStatus] = useState({
        metrics: { healthScore: 100, crashesCaught: 0, healsApplied: 0, zombiesKilled: 0 },
        prediction: { threat_level: 'LOW', prediction: 'Initializing...' },
        isHealing: false
    });
    const [events, setEvents] = useState([]);

    const [cpuHistory, setCpuHistory] = useState(Array(HISTORY_SIZE).fill(0));
    const [memHistory, setMemHistory] = useState(Array(HISTORY_SIZE).fill(0));
    const [netInHistory, setNetInHistory] = useState(Array(HISTORY_SIZE).fill(0));
    const [netOutHistory, setNetOutHistory] = useState(Array(HISTORY_SIZE).fill(0));

    const [currentFps, setCurrentFps] = useState(60);
    const fpsFramesRef = useRef([]);
    const frameRef = useRef(null);

    useEffect(() => {
        let mounted = true;
        nexusBridge.invoke('telemetry:start');

        const fetchShield = async () => {
            const status = await nexusBridge.invoke('omnishield:get-status');
            const evtList = await nexusBridge.invoke('omnishield:get-events');
            if (mounted) {
                setShieldStatus(status);
                setEvents(evtList);
            }
        };
        fetchShield();
        const shieldInterval = setInterval(fetchShield, 3000);

        // FPS Monitoring
        const measureFps = (now) => {
            if (!mounted) return;
            fpsFramesRef.current.push(now);
            const cutoff = now - 1000;
            fpsFramesRef.current = fpsFramesRef.current.filter(t => t > cutoff);
            setCurrentFps(fpsFramesRef.current.length);
            frameRef.current = requestAnimationFrame(measureFps);
        };
        frameRef.current = requestAnimationFrame(measureFps);

        if (window.nexusAPI?.receive) {
            window.nexusAPI.receive('telemetry:data', (data) => {
                if (!mounted) return;
                setTelemetry(data);
                setCpuHistory(prev => [...prev.slice(1), parseFloat(data.cpu) || 0]);
                setMemHistory(prev => [...prev.slice(1), parseFloat(data.memPercent) || 0]);
                setNetInHistory(prev => [...prev.slice(1), parseFloat(data.netIn) || 0]);
                setNetOutHistory(prev => [...prev.slice(1), parseFloat(data.netOut) || 0]);
            });
        }

        return () => {
            mounted = false;
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            clearInterval(shieldInterval);
            nexusBridge.invoke('telemetry:stop');
        };
    }, []);

    const getHealthColor = (score) => {
        if (score > 80) return 'text-emerald-400';
        if (score > 50) return 'text-amber-400';
        return 'text-red-400';
    };

    return (
        <div className={`flex flex-col h-full bg-[#05080a] text-slate-300 font-mono p-6 gap-6 overflow-y-auto custom-scrollbar ${isRtl ? 'rtl' : 'ltr'}`}>

            {/* Header: OmniShield Interface */}
            <div className="flex items-center justify-between pb-6 border-b border-white/5">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <div className={`absolute inset-0 blur-xl rounded-full animate-pulse ${shieldStatus.metrics.healthScore > 80 ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}></div>
                        <div className={`w-12 h-12 rounded-2xl bg-black border flex items-center justify-center relative ${shieldStatus.metrics.healthScore > 80 ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
                            <ShieldCheck className={shieldStatus.metrics.healthScore > 80 ? 'text-emerald-400' : 'text-red-400'} size={24} />
                        </div>
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-[0.3em] text-white uppercase italic">OmniShield v1.0</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <div className={`w-2 h-2 rounded-full animate-pulse ${shieldStatus.isHealing ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${shieldStatus.isHealing ? 'text-amber-500/70' : 'text-emerald-500/70'}`}>
                                {shieldStatus.isHealing ? 'Active Remediation' : 'Neural Watchdog Monitoring'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center min-w-[100px]">
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Health Score</span>
                        <span className={`font-bold text-sm ${getHealthColor(shieldStatus.metrics.healthScore)}`}>{shieldStatus.metrics.healthScore}%</span>
                    </div>
                    <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center min-w-[100px]">
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Threat Level</span>
                        <span className={`font-bold text-sm uppercase ${shieldStatus.prediction.threat_level === 'CRITICAL' ? 'text-red-500' : shieldStatus.prediction.threat_level === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {shieldStatus.prediction.threat_level}
                        </span>
                    </div>
                </div>
            </div>

            {/* OmniShield Intelligence Summary */}
            <div className="bg-black/40 border border-white/5 rounded-2xl p-5 hover:border-cyan-500/30 transition-all group">
                <div className="flex items-center gap-2 mb-2">
                    <Zap size={14} className="text-cyan-400" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Predictive Intelligence</span>
                </div>
                <p className="text-sm text-cyan-100/80 mb-2 leading-relaxed">{shieldStatus.prediction.prediction}</p>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="font-bold text-cyan-400/60 uppercase">Action Plan:</span>
                    <span>{shieldStatus.prediction.recommended_action}</span>
                </div>
            </div>

            {/* Neural Matrix Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-black/40 border border-white/5 rounded-2xl p-5 group">
                    <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Crashes Deflected</div>
                    <div className="text-2xl font-bold text-white tracking-tighter">{shieldStatus.metrics.crashesCaught}</div>
                </div>
                <div className="bg-black/40 border border-white/5 rounded-2xl p-5 group">
                    <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Neural Heals</div>
                    <div className="text-2xl font-bold text-white tracking-tighter">{shieldStatus.metrics.healsApplied}</div>
                </div>
                <div className="bg-black/40 border border-white/5 rounded-2xl p-5 group">
                    <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Port Snipes</div>
                    <div className="text-2xl font-bold text-white tracking-tighter">{shieldStatus.metrics.zombiesKilled}</div>
                </div>
                <div className="bg-black/40 border border-white/5 rounded-2xl p-5 group">
                    <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Uptime</div>
                    <div className="text-lg font-bold text-slate-300 truncate">{telemetry.uptime}</div>
                </div>
            </div>

            {/* Advanced Graphing Suite */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Sparkline data={cpuHistory} color="#22d3ee" label="System Load" value={telemetry.cpu} unit="%" icon={Cpu} />
                <Sparkline data={memHistory} color="#a855f7" label="Memory Load" value={telemetry.memPercent} unit="%" icon={Database} />
                <Sparkline data={netInHistory} color="#34d399" label="Network In" value={telemetry.netIn} unit="KB/S" icon={Globe} />
                <Sparkline data={netOutHistory} color="#f43f5e" label="Network Out" value={telemetry.netOut} unit="KB/S" icon={Activity} />
            </div>

            {/* Security Events Ledger */}
            <div className="bg-black/60 border border-white/5 rounded-2xl p-5 flex-1 min-h-[250px] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Activity size={14} className="text-cyan-400" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Protection Ledger</span>
                    </div>
                    <span className="text-[9px] text-slate-600 uppercase">{events.length} Recent Events</span>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                    {events.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-[10px] text-slate-700 uppercase italic">Ledger Clean – No critical anomalies.</div>
                    ) : (
                        events.map(ev => (
                            <div key={ev.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/5 border border-white/5 text-[10px]">
                                <span className={`font-bold px-1.5 py-0.5 rounded text-[8px] ${ev.type === 'HEAL' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-500/20 text-slate-400'}`}>{ev.type}</span>
                                <span className="text-slate-300 flex-1">{ev.message}</span>
                                <span className="text-slate-600 font-mono text-[8px]">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default SystemMonitor;

