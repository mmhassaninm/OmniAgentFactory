import si from 'systeminformation';
import logger from '@nexus/logger';

/**
 * Hardware Oracle Skill: Allows OpenClaw Cortex agents to read real-time 
 * local system diagnostics, enforcing the Hardware-Aware Mandate autonomously.
 */
export async function getSystemHardwareStats() {
    try {
        const [cpu, mem, graphics] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.graphics()
        ]);

        const totalRamGb = (mem.total / 1024 / 1024 / 1024).toFixed(2);
        const usedRamGb = (mem.used / 1024 / 1024 / 1024).toFixed(2);
        const freeRamGb = (mem.free / 1024 / 1024 / 1024).toFixed(2);

        let gpuStats = 'No GPU Array detected.';
        if (graphics.controllers && graphics.controllers.length > 0) {
            const gpu = graphics.controllers[0]; // Assuming primary Nvidia/AMD
            gpuStats = `GPU Model: ${gpu.model}, VRAM: ${gpu.vram || 'Unknown'} MB`;
        }

        const report = {
            status: "SUCCESS",
            timestamp: new Date().toISOString(),
            cpuUsage: `${cpu.currentLoad.toFixed(2)}%`,
            ram: {
                totalGB: totalRamGb,
                usedGB: usedRamGb,
                availableGB: freeRamGb
            },
            gpu: gpuStats,
            hardwareMandateCompliant: parseFloat(usedRamGb) < 8.0 // Enforcing the 8GB node daemon limit rule
        };

        logger.info('🧠 [SYSTEM SKILL] Cortex AI requested hardware diagnostic. Returning stats.');
        return JSON.stringify(report, null, 2);

    } catch (error) {
        logger.error(`❌ [SYSTEM SKILL] Failed to read hardware: ${error.message}`);
        return JSON.stringify({ status: "ERROR", message: error.message });
    }
}
