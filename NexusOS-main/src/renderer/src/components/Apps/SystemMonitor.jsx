import React, { useState, useEffect } from 'react';
import { Activity, Cpu, HardDrive, Thermometer, Database } from 'lucide-react';
import { useOSStore } from '../../store/osStore';
import { useTranslation } from 'react-i18next';

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
        uptime: '00:00:00'
    });
    const [history, setHistory] = useState(Array(20).fill(0));

    useEffect(() => {
        let mounted = true;

        if (window.nexusAPI) {
            // Start the telemetry daemon
            window.nexusAPI.invoke('telemetry:start');

            // Listen for telemetry data ticks
            window.nexusAPI.receive('telemetry:data', (data) => {
                if (mounted) {
                    setTelemetry(prev => ({
                        ...prev,
                        ...data
                    }));
                    setHistory(prev => {
                        const newHistory = [...prev.slice(1), parseFloat(data.cpu) || 0];
                        return newHistory;
                    });
                }
            });
        }

        return () => {
            mounted = false;
            if (window.nexusAPI) {
                // Shut down external polling to save memory/CPU
                window.nexusAPI.invoke('telemetry:stop');
            }
        };
    }, []);

    // Visual calculations
    const cpuHeight = (val) => `${Math.max(5, val)}%`;
    const memPercentColor = parseInt(telemetry.memPercent) > 85 ? 'text-red-500' : 'text-emerald-500';

    return (
        <div className={`flex flex-col h-full bg-slate-950 text-slate-200 font-mono p-6 gap-6 overflow-y-auto ${isRtl ? 'rtl' : 'ltr'}`}>

            {/* Header */}
            <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
                <Activity className="text-emerald-500 animate-pulse" size={28} />
                <h1 className="text-xl font-bold tracking-widest text-emerald-400">
                    {t('apps.monitor', { defaultValue: 'SYSTEM_TELEMETRY_MONITOR' })}
                </h1>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

                {/* CPU Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-10 -mt-10"></div>
                    <div className="flex items-start justify-between mb-4">
                        <Cpu className="text-slate-400 group-hover:text-emerald-400 transition-colors" size={20} />
                        <span className="text-xs text-slate-500 uppercase tracking-wider">{t('monitor_cpu', { defaultValue: 'Cores' })}</span>
                    </div>
                    <div className="flex items-end gap-2">
                        <span className="text-4xl font-bold text-slate-100">{telemetry.cpu}</span>
                        <span className="text-sm text-slate-500 mb-1">%</span>
                    </div>
                </div>

                {/* RAM Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -mr-10 -mt-10"></div>
                    <div className="flex items-start justify-between mb-4">
                        <Database className="text-slate-400 group-hover:text-blue-400 transition-colors" size={20} />
                        <span className="text-xs text-slate-500 uppercase tracking-wider">{t('monitor_mem', { defaultValue: 'Memory' })}</span>
                    </div>
                    <div className="flex items-end gap-2">
                        <span className={`text-4xl font-bold \${memPercentColor}`}>{telemetry.memUsed}</span>
                        <span className="text-sm text-slate-500 mb-1">/ {telemetry.memTotal} GB</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 mt-4 rounded-full overflow-hidden">
                        <div
                            className={`h-full \${parseInt(telemetry.memPercent) > 85 ? 'bg-red-500' : 'bg-blue-500'} transition-all`}
                            style={{ width: `${telemetry.memPercent}%` }}
                        ></div>
                    </div>
                </div>

                {/* Temp Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl -mr-10 -mt-10"></div>
                    <div className="flex items-start justify-between mb-4">
                        <Thermometer className="text-slate-400 group-hover:text-orange-400 transition-colors" size={20} />
                        <span className="text-xs text-slate-500 uppercase tracking-wider">{t('monitor_temp', { defaultValue: 'Therm' })}</span>
                    </div>
                    <div className="flex items-end gap-2">
                        <span className="text-4xl font-bold text-slate-100">{telemetry.temp}</span>
                        <span className="text-sm text-slate-500 mb-1">°C</span>
                    </div>
                </div>

                {/* Storage Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl -mr-10 -mt-10"></div>
                    <div className="flex items-start justify-between mb-4">
                        <HardDrive className="text-slate-400 group-hover:text-purple-400 transition-colors" size={20} />
                        <span className="text-xs text-slate-500 uppercase tracking-wider">{t('monitor_io', { defaultValue: 'I/O' })}</span>
                    </div>
                    <div className="flex items-end gap-2">
                        <span className="text-xl font-bold text-slate-400">{t('monitor_stable', { defaultValue: 'STABLE' })}</span>
                    </div>
                </div>
            </div>

            {/* Live CPU Graphing */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl flex-1 flex flex-col min-h-[200px]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">{t('monitor_graph', { defaultValue: 'Live Core Mapping' })}</h3>
                    <div className="flex gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="text-xs text-emerald-500">LIVE</span>
                    </div>
                </div>

                <div className="flex-1 flex items-end justify-between gap-1 overflow-hidden relative border-b border-l border-slate-800/50 pb-2 pl-2">
                    {/* Y-Axis visual lines */}
                    <div className="absolute top-0 left-0 w-full border-t border-slate-800/50 border-dashed opacity-50"></div>
                    <div className="absolute top-1/2 left-0 w-full border-t border-slate-800/50 border-dashed opacity-50"></div>

                    {history.map((val, i) => (
                        <div key={i} className="flex-1 flex justify-center items-end h-full">
                            <div
                                className="w-full bg-gradient-to-t from-emerald-900/40 to-emerald-500/80 rounded-t-sm transition-all duration-500 ease-out"
                                style={{ height: cpuHeight(val) }}
                            ></div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-slate-600 font-bold">
                    <span>-40s</span>
                    <span>-20s</span>
                    <span>NOW</span>
                </div>
            </div>

        </div>
    );
};

export default SystemMonitor;
