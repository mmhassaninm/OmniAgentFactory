import axios from 'axios';
import fs from 'fs';
import path from 'path';
import Docker from 'dockerode';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const SANDBOX_DIR = path.join(PROJECT_ROOT, '.vibelab_sandbox');
const DRAFTS_DIR = path.join(PROJECT_ROOT, 'backend', '.vibelab_drafts');
const LLM_API = 'http://127.0.0.1:1234/v1/chat/completions';
const MAX_TDD_RETRIES = 3;

// Default target repo (overridable via CLI args)
const TARGET_OWNER = process.argv[2] || 'expressjs';
const TARGET_REPO = process.argv[3] || 'express';

if (!fs.existsSync(SANDBOX_DIR)) fs.mkdirSync(SANDBOX_DIR, { recursive: true });
if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });

// ─────────────────────────────────────────────
// Phase 1: Fetch a "good first issue" from GitHub
// ─────────────────────────────────────────────
async function fetchBountyIssue() {
    console.log(`\n🔍 [BOUNTY] Searching for open "good first issue" in ${TARGET_OWNER}/${TARGET_REPO}...`);

    const url = `https://api.github.com/repos/${TARGET_OWNER}/${TARGET_REPO}/issues?labels=good%20first%20issue&state=open&per_page=10&sort=created&direction=desc`;

    try {
        const res = await axios.get(url, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'VibeLab-BountyHunter/1.0'
            },
            timeout: 15000
        });

        const issues = res.data;
        if (!issues || issues.length === 0) {
            console.log('🛑 [BOUNTY] No open "good first issue" found.');
            return null;
        }

        // Pick the first unassigned issue
        const unassigned = issues.find(issue => !issue.assignee && !issue.pull_request);
        if (!unassigned) {
            console.log('🛑 [BOUNTY] All matching issues are already assigned.');
            return null;
        }

        console.log(`🎯 [BOUNTY] Found Issue #${unassigned.number}: "${unassigned.title}"`);
        console.log(`   URL: ${unassigned.html_url}`);

        return {
            number: unassigned.number,
            title: unassigned.title,
            body: (unassigned.body || 'No description provided.').substring(0, 4000),
            labels: unassigned.labels.map(l => l.name).join(', '),
            url: unassigned.html_url
        };

    } catch (err) {
        console.error(`🛑 [BOUNTY] GitHub API error: ${err.message}`);
        return null;
    }
}

// ─────────────────────────────────────────────
// Phase 2: Ask LLM to write the fix + test
// ─────────────────────────────────────────────
async function generateFixAndTest(issue) {
    console.log(`\n🧠 [BOUNTY] Asking LLM to write the fix and test for Issue #${issue.number}...`);

    const prompt = `You are an elite Open Source Contributor. Read this GitHub Issue and write the exact code to fix it.

REPOSITORY: ${TARGET_OWNER}/${TARGET_REPO}
ISSUE #${issue.number}: ${issue.title}
LABELS: ${issue.labels}

ISSUE BODY:
${issue.body}

You must output EXACTLY this JSON format (no markdown fences, just raw JSON):
{
    "analysis": "Brief analysis of what needs to be fixed",
    "file_name": "the_module_name",
    "language": "node",
    "implementation_code": "// The complete fixed implementation code here",
    "test_code": "// The complete Jest unit test code here"
}

RULES:
- The test_code must import from the implementation using require('./file_name')
- Write tests that specifically verify the fix
- Export all relevant functions from the implementation using module.exports
- Output ONLY the JSON object, nothing else`;

    try {
        const res = await axios.post(LLM_API, {
            model: 'qwen2.5-coder-7b-instruct',
            messages: [
                { role: 'system', content: 'You are a world-class open source developer. Output only valid JSON.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 4000
        }, { timeout: 90000 });

        let reply = res.data?.choices?.[0]?.message?.content?.trim();
        if (!reply) throw new Error('Empty LLM response');

        // Strip markdown fences
        if (reply.startsWith('```json')) reply = reply.substring(7);
        if (reply.startsWith('```')) reply = reply.substring(3);
        if (reply.endsWith('```')) reply = reply.substring(0, reply.length - 3);
        reply = reply.trim();

        const parsed = JSON.parse(reply);

        if (!parsed.implementation_code || !parsed.test_code) {
            throw new Error('LLM response missing implementation_code or test_code');
        }

        console.log(`✅ [BOUNTY] LLM generated fix for: ${parsed.file_name || 'unknown'}`);
        console.log(`   Analysis: ${parsed.analysis || 'N/A'}`);

        return {
            fileName: parsed.file_name || `bounty_fix_${issue.number}`,
            language: parsed.language || 'node',
            implCode: parsed.implementation_code,
            testCode: parsed.test_code
        };

    } catch (err) {
        console.error(`🛑 [BOUNTY] LLM failed to generate fix: ${err.message}`);
        return null;
    }
}

// ─────────────────────────────────────────────
// Phase 3: TDD Docker Sandbox (reused logic)
// ─────────────────────────────────────────────
async function runTDDSandbox(fileName, testCode, implCode, language) {
    const docker = new Docker();
    let currentImpl = implCode;

    for (let attempt = 1; attempt <= MAX_TDD_RETRIES; attempt++) {
        console.log(`\n🧪 [BOUNTY-TDD] Attempt ${attempt}/${MAX_TDD_RETRIES} for "${fileName}"...`);

        let container = null;

        try {
            const isJS = language === 'node' || language === 'javascript' || language === 'js';
            const ext = isJS ? '.js' : '.py';
            const testExt = isJS ? '.test.js' : '_test.py';

            const implPath = path.join(SANDBOX_DIR, `${fileName}${ext}`);
            const testPath = path.join(SANDBOX_DIR, `${fileName}${testExt}`);

            fs.writeFileSync(implPath, currentImpl, 'utf8');
            fs.writeFileSync(testPath, testCode, 'utf8');

            if (isJS) {
                fs.writeFileSync(path.join(SANDBOX_DIR, 'package.json'), JSON.stringify({
                    name: 'bounty-tdd-sandbox',
                    version: '1.0.0',
                    scripts: { test: 'npx jest --forceExit --no-cache' },
                    devDependencies: { jest: '^29.7.0' }
                }, null, 2), 'utf8');
            }

            const image = isJS ? 'node:18-alpine' : 'python:3.11-alpine';
            const testCmd = isJS
                ? 'cd /sandbox && npm install --silent 2>/dev/null && npm test 2>&1'
                : 'cd /sandbox && pip install pytest --quiet 2>/dev/null && pytest -v 2>&1';

            container = await docker.createContainer({
                Image: image,
                Cmd: ['sh', '-c', testCmd],
                HostConfig: {
                    Binds: [`${SANDBOX_DIR}:/sandbox`],
                    Memory: 256 * 1024 * 1024,
                    CpuPeriod: 100000,
                    CpuQuota: 50000
                },
                WorkingDir: '/sandbox',
                NetworkDisabled: true
            });

            await container.start();
            const waitResult = await container.wait();
            const exitCode = waitResult.StatusCode;

            const logBuffer = await container.logs({ stdout: true, stderr: true });
            const logs = logBuffer.toString('utf8').replace(/[\x00-\x08]/g, '').trim();

            try { await container.remove({ force: true }); } catch (e) { /* */ }
            container = null;

            if (exitCode === 0) {
                console.log(`\n✅ [BOUNTY-TDD] ALL TESTS PASSED on attempt ${attempt}!`);

                // Cleanup sandbox
                try { fs.unlinkSync(implPath); } catch (e) { /* */ }
                try { fs.unlinkSync(testPath); } catch (e) { /* */ }
                try { fs.unlinkSync(path.join(SANDBOX_DIR, 'package.json')); } catch (e) { /* */ }

                return { success: true, code: currentImpl, testOutput: logs };
            }

            console.log(`❌ [BOUNTY-TDD] Tests failed on attempt ${attempt}.`);

            if (attempt < MAX_TDD_RETRIES) {
                // Ask LLM to fix
                console.log(`🧠 [BOUNTY-TDD] Asking LLM to fix...`);
                try {
                    const fixRes = await axios.post(LLM_API, {
                        model: 'qwen2.5-coder-7b-instruct',
                        messages: [
                            { role: 'system', content: 'Fix the code so all tests pass. Output ONLY raw code, no markdown.' },
                            { role: 'user', content: `TEST (DO NOT MODIFY):\n${testCode}\n\nIMPLEMENTATION (FIX THIS):\n${currentImpl}\n\nERROR:\n${logs.substring(0, 3000)}\n\nOutput ONLY fixed implementation code.` }
                        ],
                        temperature: 0.2,
                        max_tokens: 4000
                    }, { timeout: 60000 });

                    let fixed = fixRes.data?.choices?.[0]?.message?.content?.trim();
                    if (fixed) {
                        if (fixed.startsWith('```')) fixed = fixed.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
                        currentImpl = fixed;
                    }
                } catch (e) {
                    console.error(`🧠 [BOUNTY-TDD] LLM fix failed: ${e.message}`);
                }
            }

        } catch (err) {
            console.error(`🧪 [BOUNTY-TDD] Docker error: ${err.message}`);
            if (container) {
                try { await container.remove({ force: true }); } catch (e) { /* */ }
            }
        }
    }

    return { success: false, code: currentImpl, testOutput: 'Tests failed after all retries.' };
}

// ─────────────────────────────────────────────
// Phase 4: Save patch file
// ─────────────────────────────────────────────
function savePatch(issue, code, testOutput) {
    const patchFileName = `BOUNTY_FIX_${issue.number}.patch`;
    const patchPath = path.join(DRAFTS_DIR, patchFileName);

    const patchContent = `# Auto-Bounty Hunter Fix
# Issue: #${issue.number} - ${issue.title}
# URL: ${issue.url}
# Generated: ${new Date().toISOString()}
# Status: ✅ ALL TESTS PASSED
# ─────────────────────────────────────────

${code}

# ─── Test Output ───
# ${testOutput.substring(0, 1000).split('\n').join('\n# ')}
`;

    fs.writeFileSync(patchPath, patchContent, 'utf8');
    console.log(`\n📝 [BOUNTY] Patch saved: ${patchFileName}`);
    return patchPath;
}

// ─────────────────────────────────────────────
// Main Orchestrator
// ─────────────────────────────────────────────
async function runBountyHunter() {
    console.log('═══════════════════════════════════════════════');
    console.log('  💰 VibeLab Auto-Bounty Hunter v1.0');
    console.log(`  🎯 Target: ${TARGET_OWNER}/${TARGET_REPO}`);
    console.log('═══════════════════════════════════════════════');

    // Phase 1: Fetch issue
    const issue = await fetchBountyIssue();
    if (!issue) {
        console.log('\n🏁 No bounty-eligible issues found. Exiting.');
        return;
    }

    // Phase 2: Generate fix
    const fix = await generateFixAndTest(issue);
    if (!fix) {
        console.log('\n🏁 LLM could not generate a fix. Exiting.');
        return;
    }

    // Phase 3: TDD Sandbox
    console.log(`\n🧪 [BOUNTY] Running TDD sandbox for "${fix.fileName}"...`);
    const result = await runTDDSandbox(fix.fileName, fix.testCode, fix.implCode, fix.language);

    // Phase 4: Save or report
    if (result.success) {
        savePatch(issue, result.code, result.testOutput);
        console.log('\n═══════════════════════════════════════════════');
        console.log(`  ✅ BOUNTY CLAIMED: Issue #${issue.number}`);
        console.log('  📁 Check .vibelab_drafts/ for the patch file');
        console.log('═══════════════════════════════════════════════');
    } else {
        console.log('\n═══════════════════════════════════════════════');
        console.log(`  ❌ BOUNTY MISSED: Issue #${issue.number}`);
        console.log('  Tests could not pass after 3 attempts.');
        console.log('═══════════════════════════════════════════════');
    }
}

runBountyHunter();
