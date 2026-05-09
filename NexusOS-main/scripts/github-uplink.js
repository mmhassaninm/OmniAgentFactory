#!/usr/bin/env node
import { execSync } from 'child_process';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// --- SECRET SCANNER STRATEGIES ---
const SECRET_PATTERNS = [
    { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{20,}/ },
    { name: 'Google API Key', regex: /AIza[0-9A-Za-z-_]{35}/ },
    { name: 'Hardcoded Password', regex: /password\s*:\s*['"](?![^'"]*process\.env)[^'"]+['"]/i },
    { name: 'Generic Secret/Token', regex: /(secret|token|api_key)\s*['"]?\s*[:=]\s*['"](?![^'"]*process\.env)[a-zA-Z0-9\-_]{16,}['"]/i }
];

const SCAN_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.json', '.env', '.md', '.py', '.cjs', '.mjs'];

function scanDirectoryForSecrets(dirPath) {
    let hasSecrets = false;
    if (!fs.existsSync(dirPath)) return false;

    const items = fs.readdirSync(dirPath);

    for (const item of items) {
        // Skip ignored directories
        if (['node_modules', 'dist', 'build', '.git', '.temp', 'venv', 'env', '.venv', '__pycache__'].includes(item)) continue;

        // Skip hidden folders except environments
        if (item.startsWith('.') && !item.startsWith('.env')) continue;

        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (scanDirectoryForSecrets(fullPath)) {
                hasSecrets = true;
            }
        } else if (stat.isFile()) {
            const ext = path.extname(item).toLowerCase();
            if (SCAN_EXTENSIONS.includes(ext) || item.startsWith('.env')) {
                const content = fs.readFileSync(fullPath, 'utf8');
                const lines = content.split('\n');

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    for (const pattern of SECRET_PATTERNS) {
                        if (pattern.regex.test(line)) {
                            // Suppress false positive warning for example usages in README or template files
                            if (fullPath.includes('README.md') && line.includes('example')) continue;

                            console.error(`\x1b[31m[CRITICAL ALERT] Local Git Guardian detected a potential secret:\x1b[0m`);
                            console.error(`\x1b[31m  -> Type: ${pattern.name}\x1b[0m`);
                            console.error(`\x1b[31m  -> File: ${fullPath}\x1b[0m`);
                            console.error(`\x1b[31m  -> Line ${i + 1}: ${line.trim().substring(0, 100)}...\x1b[0m\n`);
                            hasSecrets = true;
                        }
                    }
                }
            }
        }
    }
    return hasSecrets;
}

async function startUplink() {
    console.log(`\x1b[36m\n======================================================\x1b[0m`);
    console.log(`\x1b[36m=== 🚀 NEXUS OS GITHUB SECURE UPLINK SUBSYSTEM 🚀 ====\x1b[0m`);
    console.log(`\x1b[36m======================================================\x1b[0m\n`);

    console.log('\x1b[35m[1/3] Initiating Local Git Guardian Secret Sweep...\x1b[0m');

    // Scan Source and App directories
    const srcSecrets = scanDirectoryForSecrets(path.join(ROOT_DIR, 'src'));
    const appsSecrets = scanDirectoryForSecrets(path.join(ROOT_DIR, 'apps'));

    if (srcSecrets || appsSecrets) {
        console.error(`\n\x1b[41;37m[ABORT] UPLINK TERMINATED BY SENTINEL.\x1b[0m`);
        console.error(`\x1b[31mHardcoded secrets detected in the codebase. You MUST wipe them from the files before uploading your repository.\x1b[0m\n`);
        process.exit(1);
    }

    console.log(`\x1b[32m[OK] Zero secrets detected. Codebase is hermetically sealed.\x1b[0m\n`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log('\x1b[35m[2/3] Establishing Remote Connection...\x1b[0m');
    rl.question('Please paste your empty GitHub Repository URL: ', (repoUrl) => {
        rl.close();
        if (!repoUrl.trim()) {
            console.error('\x1b[31mError: No URL provided. Aborting Pipeline.\x1b[0m');
            process.exit(1);
        }

        try {
            console.log('\n\x1b[35m[3/3] Executing Git Automation Matrix...\x1b[0m');

            console.log('   \x1b[33m> Initializing git repository...\x1b[0m');
            if (!fs.existsSync(path.join(ROOT_DIR, '.git'))) {
                execSync('git init', { cwd: ROOT_DIR, stdio: 'inherit' });
            } else {
                console.log('   (Git already initialized)');
            }

            console.log('   \x1b[33m> Staging core files...\x1b[0m');
            execSync('git add .', { cwd: ROOT_DIR, stdio: 'inherit' });

            console.log('   \x1b[33m> Committing snapshot...\x1b[0m');
            try {
                execSync('git commit -m "🚀 Initial secure commit of NexusOS Core"', { cwd: ROOT_DIR, stdio: 'inherit' });
            } catch (commitErr) {
                console.log('   (Snapshot already up to date)');
            }

            console.log('   \x1b[33m> Forging main branch...\x1b[0m');
            execSync('git branch -M main', { cwd: ROOT_DIR, stdio: 'inherit' });

            console.log('   \x1b[33m> Binding remote uplink payload...\x1b[0m');
            try {
                execSync(`git remote add origin ${repoUrl}`, { cwd: ROOT_DIR, stdio: 'inherit' });
            } catch (remoteErr) {
                execSync(`git remote set-url origin ${repoUrl}`, { cwd: ROOT_DIR, stdio: 'inherit' });
            }

            console.log('   \x1b[33m> Pushing telemetry out of atmosphere...\x1b[0m');
            execSync('git push -u origin main', { cwd: ROOT_DIR, stdio: 'inherit' });

            console.log(`\n\x1b[32;1m=== MILITARY-GRADE UPLINK COMPLETE ===\x1b[0m`);
            console.log(`\x1b[36mNexusOS Source Code successfully vaulted to:\x1b[0m \x1b[37m${repoUrl}\x1b[0m\n`);

        } catch (error) {
            console.error('\n\x1b[31m[CRITICAL ERROR] Git Uplink Sequence Failed:\x1b[0m', error.message);
            process.exit(1);
        }
    });
}

startUplink();
