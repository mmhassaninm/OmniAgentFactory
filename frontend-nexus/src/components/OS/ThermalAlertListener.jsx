/**
 * ============================================================
 *  🔥 Thermal Alert Listener — Global IPC Event Handler
 * ============================================================
 *  Mounted once in App.jsx. Listens for `sentinel:thermal-alert`
 *  events from the backend Thermal Sentinel, plays a futuristic
 *  warning beep via Web Audio API, and fires a red toast.
 *
 *  60-second audio debounce to prevent alert fatigue.
 * ============================================================
 */

import { useEffect, useRef } from 'react';
import nexusBridge from '../../services/bridge';
import toastBus from '../../services/toastBus';

/**
 * Play a descending futuristic warning beep (880Hz → 440Hz) via
 * Web Audio API — no external files needed.
 */
function playWarningBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();

        // First tone: high-pitched alert (880Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'square';
        osc1.frequency.setValueAtTime(880, ctx.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
        gain1.gain.setValueAtTime(0.15, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc1.connect(gain1).connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.2);

        // Second tone: confirmation pulse after a tiny gap
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(660, ctx.currentTime + 0.25);
        osc2.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.4);
        gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.25);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
        osc2.connect(gain2).connect(ctx.destination);
        osc2.start(ctx.currentTime + 0.25);
        osc2.stop(ctx.currentTime + 0.45);

        // Cleanup
        setTimeout(() => ctx.close(), 600);
    } catch {
        // Web Audio not available — silent fallback
    }
}

export default function ThermalAlertListener() {
    const lastBeepRef = useRef(0);
    const DEBOUNCE_MS = 60_000; // 1 minute

    useEffect(() => {
        const unsubscribe = nexusBridge.receive('sentinel:thermal-alert', (data) => {
            const { component, temp, threshold } = data || {};

            // Always fire toast (toastBus has its own visual queue)
            toastBus.error(
                '🔥 THERMAL ALERT',
                `⚠️ ${component || 'Unknown'} is at ${temp}°C! (Limit: ${threshold}°C)`,
                { autoDismissMs: 10000 }
            );

            // Debounced audio beep
            const now = Date.now();
            if (now - lastBeepRef.current > DEBOUNCE_MS) {
                lastBeepRef.current = now;
                playWarningBeep();
            }
        });

        return () => {
            if (typeof unsubscribe === 'function') unsubscribe();
        };
    }, []);

    // Renders nothing — pure side-effect component
    return null;
}
