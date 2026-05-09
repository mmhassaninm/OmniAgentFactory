import axios from 'axios';
import logger from '@nexus/logger';

// Screenshot import (graceful)
let screenshotDesktop;
try {
    screenshotDesktop = (await import('screenshot-desktop')).default;
} catch (e) {
    logger.warn('👻 [GHOST] screenshot-desktop not installed.');
}

// ─── Config ───
const LLM_API = process.env.LLM_API || 'http://127.0.0.1:1234/v1/chat/completions';
const VISION_MODEL = process.env.VIBELAB_VISION_MODEL || 'qwen2.5-vl-7b-instruct';
const SCAN_INTERVAL_MS = 15000; // 15 seconds strict ceiling

// ─── State ───
let intervalHandle = null;
let isRunning = false;
let sseClients = []; // Connected SSE listeners
let lastErrorHash = ''; // Prevent spamming same error

// ─── SSE Client Management ───
export function addGhostClient(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Express 4+ way to flush headers immediately for SSE
    if (res.flushHeaders) {
        res.flushHeaders();
    }

    sseClients.push(res);
    logger.info(`👻 [GHOST] SSE client connected (${sseClients.length} total)`);

    res.on('close', () => {
        sseClients = sseClients.filter(c => c !== res);
        logger.info(`👻 [GHOST] SSE client disconnected (${sseClients.length} remaining)`);
    });

    // Send initial heartbeat
    res.write(`data: ${JSON.stringify({ type: 'heartbeat', message: '👻 Ghost Dev connected.' })}\n\n`);
}

function broadcast(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(client => {
        try { client.write(payload); } catch (e) { /* dead client */ }
    });
}

// ─── Core Scan Logic ───
async function scanScreen() {
    if (!screenshotDesktop) {
        logger.warn('👻 [GHOST] scan aborted: screenshot-desktop not available.');
        return;
    }

    try {
        // Step 1: Screenshot
        const imgBuffer = await screenshotDesktop({ format: 'png' });
        const base64Image = imgBuffer.toString('base64');
        logger.info(`👻 [GHOST] Screenshot captured (${(imgBuffer.length / 1024).toFixed(0)} KB). Analyzing...`);

        // Step 2: Vision LLM analysis
        const prompt = `Analyze this screenshot carefully. Is the user looking at a code editor (like VS Code, Cursor, or a terminal) with a visible error? Look for:
- Red squiggly underlines
- Error messages in a terminal or console
- Red/orange error badges or indicators
- Compilation or runtime error text

Reply ONLY with a valid JSON object:
{"error_found": true, "error_description": "brief description of the error"}
or
{"error_found": false, "error_description": ""}

Do NOT include any text, explanation, or markdown. Only output the raw JSON.`;

        const visionRes = await axios.post(LLM_API, {
            model: VISION_MODEL,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
                    ]
                }
            ],
            max_tokens: 150,
            temperature: 0.1
        }, { timeout: 60000 });

        const reply = visionRes.data?.choices?.[0]?.message?.content?.trim();
        logger.info(`👻 [GHOST] Vision response: ${reply}`);

        if (!reply) return;

        // Step 3: Parse
        let result;
        try {
            const match = reply.match(/\{[^}]+\}/);
            if (!match) return;
            result = JSON.parse(match[0]);
        } catch (e) {
            logger.warn(`👻 [GHOST] Parse failed: ${e.message}`);
            return;
        }

        // Step 4: If error found, notify (but don't repeat same error)
        if (result.error_found && result.error_description) {
            const errorHash = result.error_description.substring(0, 50);
            if (errorHash === lastErrorHash) {
                logger.info(`👻 [GHOST] Same error detected, skipping duplicate notification.`);
                return;
            }
            lastErrorHash = errorHash;

            logger.info(`👻 [GHOST] Error detected! Broadcasting to clients...`);
            broadcast({
                type: 'ghost_error',
                message: `👻 [GHOST DEV]: I noticed an error on your screen: "${result.error_description}". Should I fix it for you?`,
                error_description: result.error_description,
                timestamp: new Date().toISOString()
            });
        } else {
            // Reset hash when no error is found
            lastErrorHash = '';
        }

    } catch (err) {
        // Don't crash the interval — just log
        if (err.code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED')) {
            logger.warn(`👻 [GHOST] Vision LLM not reachable on port 1234. Skipping scan.`);
        } else {
            logger.error(`👻 [GHOST] Scan error: ${err.message}`);
        }
    }
}

// ─── Start / Stop ───
export function startGhostDev() {
    if (isRunning) {
        logger.warn('👻 [GHOST] Already running.');
        return { status: 'already_running' };
    }

    if (!screenshotDesktop) {
        logger.error('👻 [GHOST] Cannot start: screenshot-desktop not installed.');
        return { status: 'error', message: 'screenshot-desktop not installed' };
    }

    isRunning = true;
    lastErrorHash = '';
    intervalHandle = setInterval(scanScreen, SCAN_INTERVAL_MS);
    logger.info(`👻 [GHOST] Ghost Developer started (scanning every ${SCAN_INTERVAL_MS / 1000}s)`);

    // Run first scan immediately
    setTimeout(scanScreen, 1000);

    return { status: 'started' };
}

export function stopGhostDev() {
    if (!isRunning) {
        logger.warn('👻 [GHOST] Not running.');
        return { status: 'not_running' };
    }

    isRunning = false;
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }
    lastErrorHash = '';
    logger.info('👻 [GHOST] Ghost Developer stopped.');

    broadcast({ type: 'ghost_stopped', message: '👻 Ghost Dev stopped.' });

    return { status: 'stopped' };
}

export function isGhostRunning() {
    return isRunning;
}
