const { ipcMain } = require('electron');
const si = require('systeminformation');

let monitorInterval = null;

function initTelemetry() {
    console.log('[NexusOS] Telemetry Module Initialized');

    // Phase 17: We start broadcasting telemetry only when the UI requests it
    ipcMain.handle('telemetry:start', async (event) => {
        if (monitorInterval) return { status: 'already_running' };

        console.log('[Telemetry] Starting broadcast loop');

        monitorInterval = setInterval(async () => {
            try {
                const cpuLoad = await si.currentLoad();
                const mem = await si.mem();
                const temps = await si.cpuTemperature();
                const netStats = await si.networkStats();

                let rx_sec = 0;
                let tx_sec = 0;
                if (Array.isArray(netStats)) {
                    netStats.forEach(iface => {
                        if (iface.operstate === 'up' && iface.rx_sec >= 0 && iface.tx_sec >= 0) {
                            rx_sec += iface.rx_sec;
                            tx_sec += iface.tx_sec;
                        }
                    });
                }

                const packet = {
                    cpu: cpuLoad.currentLoad.toFixed(1),
                    memTotal: (mem.total / 1073741824).toFixed(1), // GB
                    memUsed: (mem.active / 1073741824).toFixed(1), // GB
                    memPercent: ((mem.active / mem.total) * 100).toFixed(0),
                    temp: temps.main > 0 ? temps.main.toFixed(0) : 'N/A',
                    netIn: (rx_sec / 1024).toFixed(1), // KB/s
                    netOut: (tx_sec / 1024).toFixed(1) // KB/s
                };

                event.sender.send('telemetry:data', packet);
            } catch (error) {
                console.error('[Telemetry] Fetch Error:', error);
            }
        }, 1000); // Poll every 1 second for high-fidelity graphs

        return { status: 'started' };
    });

    ipcMain.handle('telemetry:stop', () => {
        if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
            logger.debug('Telemetry', 'Broadcast stopped');
        }
        return { status: 'stopped' };
    });
}

module.exports = { initTelemetry };
