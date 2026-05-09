/**
 * ============================================================
 *  🐳 Docker Sandbox: Isolated Code Execution Service
 * ============================================================
 *  Executes AI-generated code in ephemeral Docker containers
 *  with strict resource limits and no network access.
 *  Supports Node.js and Python runtimes.
 * ============================================================
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '@nexus/logger';

const execAsync = promisify(exec);

// ── Configuration ───────────────────────────────────────────
const DOCKER_TIMEOUT_MS = 30_000; // 30 seconds max execution
const MAX_OUTPUT_CHARS = 10_000;  // Truncate output to prevent memory bloat

/** Docker image map per runtime environment */
const RUNTIME_IMAGES = {
    node: 'node:18-alpine',
    python: 'python:3.9-alpine',
};

/** Runtime execution commands */
const RUNTIME_COMMANDS = {
    node: 'node -e',
    python: 'python -c',
};

/**
 * Escapes a code string for safe injection into a Docker exec command.
 * Handles double quotes, backslashes, dollar signs, and backticks.
 * @param {string} code - Raw code string
 * @returns {string} Shell-safe escaped string
 */
function escapeForShell(code) {
    return code
        .replace(/\\/g, '\\\\')    // Backslashes first
        .replace(/"/g, '\\"')      // Double quotes
        .replace(/\$/g, '\\$')     // Dollar signs (prevent interpolation)
        .replace(/`/g, '\\`')      // Backticks
        .replace(/\n/g, '\\n')     // Newlines → literal \n
        .replace(/\r/g, '');        // Strip carriage returns
}

/**
 * Truncates output to prevent memory issues with large stdout/stderr.
 * @param {string} output - Raw output string
 * @returns {string} Truncated output
 */
function truncateOutput(output) {
    if (!output) return '';
    if (output.length <= MAX_OUTPUT_CHARS) return output;
    return output.slice(0, MAX_OUTPUT_CHARS) + `\n... [TRUNCATED: ${output.length} total chars]`;
}

/**
 * Checks if Docker daemon is available and running.
 * @returns {Promise<{ available: boolean, version?: string, error?: string }>}
 */
async function isDockerAvailable() {
    try {
        const { stdout } = await execAsync('docker version --format "{{.Server.Version}}"', { timeout: 5000 });
        const version = stdout.trim();
        logger.info(`[SANDBOX] 🐳 Docker available: v${version}`);
        return { available: true, version };
    } catch (err) {
        logger.warn(`[SANDBOX] Docker not available: ${err.message}`);
        return { available: false, error: err.message };
    }
}

/**
 * Executes a code string inside an ephemeral Docker container.
 * 
 * Security constraints:
 *  - --rm: Container is removed after execution
 *  - --network=none: No network access
 *  - --memory=128m: Max 128MB RAM
 *  - --cpus=0.5: Half a CPU core max
 *  - --read-only: Filesystem is read-only (no writes to container FS)
 *  - --no-new-privileges: Prevent privilege escalation
 *
 * @param {string} codeString - The code to execute
 * @param {'node'|'python'} env - Runtime environment (default: 'node')
 * @returns {Promise<{ success: boolean, stdout: string, stderr: string, exitCode: number|null, executionTime: number, error?: string }>}
 */
async function executeInSandbox(codeString, env = 'node') {
    const startTime = Date.now();

    // Validate inputs
    if (!codeString || typeof codeString !== 'string') {
        return {
            success: false,
            stdout: '',
            stderr: 'Error: No code provided to execute.',
            exitCode: null,
            executionTime: 0,
            error: 'INVALID_INPUT'
        };
    }

    const image = RUNTIME_IMAGES[env];
    const runtimeCmd = RUNTIME_COMMANDS[env];
    if (!image || !runtimeCmd) {
        return {
            success: false,
            stdout: '',
            stderr: `Error: Unsupported runtime "${env}". Supported: ${Object.keys(RUNTIME_IMAGES).join(', ')}`,
            exitCode: null,
            executionTime: 0,
            error: 'UNSUPPORTED_RUNTIME'
        };
    }

    // Check Docker availability
    const docker = await isDockerAvailable();
    if (!docker.available) {
        return {
            success: false,
            stdout: '',
            stderr: `Docker is not available: ${docker.error}. Install Docker Desktop and ensure it is running.`,
            exitCode: null,
            executionTime: 0,
            error: 'DOCKER_UNAVAILABLE'
        };
    }

    // Escape code for shell injection
    const escapedCode = escapeForShell(codeString);

    // Build the Docker command with strict security constraints
    const dockerCmd = [
        'docker run',
        '--rm',                    // Auto-remove container after exit
        '--network=none',          // No network access
        '--memory=128m',           // Memory limit
        '--cpus=0.5',              // CPU limit
        '--read-only',             // Read-only filesystem
        '--no-new-privileges',     // Prevent privilege escalation
        `-i ${image}`,             // Image
        `${runtimeCmd} "${escapedCode}"` // Execute the code
    ].join(' ');

    logger.info(`[SANDBOX] 🐳 Executing ${env} code (${codeString.length} chars) in container...`);

    try {
        const { stdout, stderr } = await execAsync(dockerCmd, {
            timeout: DOCKER_TIMEOUT_MS,
            maxBuffer: 1024 * 1024, // 1MB buffer
            windowsHide: true       // Hide cmd window on Windows
        });

        const executionTime = Date.now() - startTime;
        const hasErrors = stderr && stderr.trim().length > 0;

        logger.info(`[SANDBOX] ✅ Execution complete (${executionTime}ms) — ${hasErrors ? 'WITH WARNINGS' : 'CLEAN'}`);

        return {
            success: !hasErrors,
            stdout: truncateOutput(stdout),
            stderr: truncateOutput(stderr),
            exitCode: 0,
            executionTime
        };
    } catch (err) {
        const executionTime = Date.now() - startTime;

        // Timeout detection
        if (err.killed || err.signal === 'SIGTERM') {
            logger.warn(`[SANDBOX] ⏰ Execution timed out after ${DOCKER_TIMEOUT_MS}ms`);
            return {
                success: false,
                stdout: truncateOutput(err.stdout || ''),
                stderr: `Execution timed out after ${DOCKER_TIMEOUT_MS / 1000}s. The code may have an infinite loop or be too computationally expensive.`,
                exitCode: null,
                executionTime,
                error: 'TIMEOUT'
            };
        }

        // Normal error (non-zero exit code)
        logger.warn(`[SANDBOX] ❌ Execution failed (${executionTime}ms): ${(err.stderr || err.message).slice(0, 200)}`);
        return {
            success: false,
            stdout: truncateOutput(err.stdout || ''),
            stderr: truncateOutput(err.stderr || err.message),
            exitCode: err.code || 1,
            executionTime,
            error: 'EXECUTION_ERROR'
        };
    }
}

/**
 * Get the current status of the Docker sandbox service.
 * @returns {Promise<object>}
 */
async function getStatus() {
    const docker = await isDockerAvailable();
    return {
        dockerAvailable: docker.available,
        dockerVersion: docker.version || null,
        supportedRuntimes: Object.keys(RUNTIME_IMAGES),
        timeoutMs: DOCKER_TIMEOUT_MS,
        maxOutputChars: MAX_OUTPUT_CHARS,
        securityConstraints: {
            network: 'none',
            memory: '128m',
            cpus: '0.5',
            readOnly: true,
            noNewPrivileges: true
        }
    };
}

export { executeInSandbox, isDockerAvailable, getStatus };
export default { executeInSandbox, isDockerAvailable, getStatus };
