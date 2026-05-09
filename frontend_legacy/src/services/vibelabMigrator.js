// ═══════════════════════════════════════════════════════════════
//  🔄 VIBELAB MIGRATOR v2 — Versioned Import of Vibelab Intelligence
//  Migrates Style_DNA, Core_Facts, Conversations, Style_References,
//  and Owner Profile data from Vibelab's Knowledge_Vault into
//  NexusChat's Memory Cortex and Knowledge Base.
//  Uses version-based migration to support incremental upgrades.
// ═══════════════════════════════════════════════════════════════

import { importMemory, addGraphTriple, getStyleDNA } from './memoryCortex.js';
import { ingestFile, getStats } from './knowledgeBase.js';
import { getOwnerProfile } from './ownerProfile.js';

const MIGRATION_KEY = 'nexus_vibelab_migrated';
const CURRENT_VERSION = 2; // Bump when adding new migration phases

/**
 * Check if migration is up to date.
 */
export function isMigrated() {
    const val = localStorage.getItem(MIGRATION_KEY);
    if (val === 'done') return false; // Old v1 format — needs v2 upgrade
    const ver = parseInt(val || '0');
    return ver >= CURRENT_VERSION;
}

/**
 * Get current migration version.
 */
export function getMigrationVersion() {
    const val = localStorage.getItem(MIGRATION_KEY);
    if (val === 'done') return 1;
    return parseInt(val || '0');
}

let isMigrating = false;

/**
 * Run the full Vibelab → NexusChat migration.
 * Supports incremental upgrades — only runs new phases.
 *
 * @param {function} onProgress - Progress callback ({phase, message, percent})
 * @returns {Promise<{success: boolean, stats: object}>}
 */
export async function runVibelabMigration(onProgress = () => { }) {
    if (isMigrating) {
        console.log('[Migrator] Migration already in progress. Skipping duplicate call.');
        return { success: false, stats: { skipped: true }, error: 'Migration in progress' };
    }

    const currentVer = getMigrationVersion();

    if (currentVer >= CURRENT_VERSION) {
        console.log(`[Migrator] Already at v${currentVer}, skipping.`);
        return { success: true, stats: { skipped: true } };
    }

    isMigrating = true;
    console.log(`[Migrator] 🔄 Upgrading from v${currentVer} → v${CURRENT_VERSION}...`);
    const stats = { styleDNA: false, facts: 0, conversations: 0, styleFiles: 0, chunks: 0, graphTriples: 0, ownerProfile: false };

    try {
        // ═══════════════════════════════════════════════
        // Phase 1: Import Style_DNA from Vibelab's Profiles
        // (Runs on v0 → v1)
        // ═══════════════════════════════════════════════
        if (currentVer < 1) {
            onProgress({ phase: 1, message: 'Importing Style DNA...', percent: 5 });

            const vibelabStyleDNA = {
                idioms: [
                    'اية ؟', 'كده', 'ده', 'بس', 'عايز', 'مش', 'طيب', 'دى', 'اللى', 'هو',
                    'npm err!', 'البشرة', 'العناية', 'جنية', 'المنتج', 'نوع', 'cream', 'skin',
                    'فاهمنى', 'امشى', 'تطوير نووى', 'راجع دستورك', 'بايظ', 'مظبوط',
                ],
                expertise: [
                    'AI & Machine Learning', 'Web Development (Node.js, React)',
                    'NexusOS System Architecture', 'Egyptian Arabic NLP',
                    'Skincare & Beauty Products', 'LM Studio & Local AI Models',
                    'Electron Desktop Apps', 'UI/UX Design',
                    'AI Image Generation (Fooocus, Stable Diffusion)',
                    'Digital Security & Privacy',
                    'Prompt Engineering',
                ],
                preferredLanguage: 'ar',
                averageMessageLength: 7,
                totalMessages: 1000,
                topEmojis: ['😂', '❤', '💧', '😘', '🔹', '🎂', '🥳', '🎉', '🎈', '🎁'],
                toneVectors: { Directness: 1, Technicality: 1, Curiosity: 1 },
                lastUpdated: new Date().toISOString(),
            };

            importMemory({
                styleDNA: vibelabStyleDNA,
                facts: [
                    { text: 'User prefers Egyptian Arabic dialect (عامية مصرية)', at: new Date().toISOString() },
                    { text: 'User is experienced in AI tools and web development', at: new Date().toISOString() },
                    { text: 'User uses LM Studio for local AI models', at: new Date().toISOString() },
                    { text: 'User is building NexusOS - a desktop operating system in Electron', at: new Date().toISOString() },
                    { text: 'User has interest in skincare and beauty products (البشرة، العناية)', at: new Date().toISOString() },
                    { text: 'User communicates with short, direct messages (~7 words)', at: new Date().toISOString() },
                    { text: 'User frequently uses emojis: 😂❤💧😘', at: new Date().toISOString() },
                    { text: 'User previously built Vibelab chat application with AI features', at: new Date().toISOString() },
                ],
            });
            stats.styleDNA = true;
            stats.facts = 8;

            // ═══════════════════════════════════════════════
            // Phase 2: Build Knowledge Graph from known facts
            // ═══════════════════════════════════════════════
            onProgress({ phase: 2, message: 'Building Knowledge Graph...', percent: 15 });

            const graphTriples = [
                ['Mostafa', 'CREATED', 'NexusOS'],
                ['Mostafa', 'CREATED', 'Vibelab'],
                ['Mostafa', 'USES', 'LM Studio'],
                ['Mostafa', 'USES', 'Electron'],
                ['Mostafa', 'USES', 'React'],
                ['Mostafa', 'USES', 'Node.js'],
                ['Mostafa', 'INTERESTED_IN', 'AI Tools'],
                ['Mostafa', 'INTERESTED_IN', 'Image Generation AI'],
                ['Mostafa', 'INTERESTED_IN', 'Skincare Products'],
                ['Mostafa', 'SPEAKS', 'Egyptian Arabic'],
                ['Mostafa', 'SPEAKS', 'English'],
                ['Mostafa', 'PREFERS', 'Local AI Models'],
                ['Mostafa', 'WORKS_ON', 'NexusChat Intelligence'],
                ['NexusOS', 'USES', 'Electron Framework'],
                ['NexusOS', 'INCLUDES', 'NexusChat'],
                ['NexusChat', 'USES', 'LM Studio API'],
                ['Vibelab', 'HAD_FEATURE', 'Knowledge Vault'],
                ['Vibelab', 'HAD_FEATURE', 'Style DNA Tracking'],
                ['Vibelab', 'HAD_FEATURE', 'Graph Memory'],
            ];

            for (const [s, p, o] of graphTriples) {
                addGraphTriple(s, p, o);
            }
            stats.graphTriples = graphTriples.length;

            // ═══════════════════════════════════════════════
            // Phase 3: Auto-ingest conversation summaries
            // ═══════════════════════════════════════════════
            onProgress({ phase: 3, message: 'Ingesting conversation summaries...', percent: 25 });

            console.time('[Migrator] Phase 3 - Conversations');
            const convFiles = await discoverFiles('Knowledge_Vault/Conversations');
            for (let i = 0; i < convFiles.length; i++) {
                // Yield to event loop to keep UI responsive
                await new Promise(resolve => setTimeout(resolve, 10));
                try {
                    const content = await fetchDataFile(`Knowledge_Vault/Conversations/${convFiles[i]}`);
                    if (content && content.length > 50) {
                        await ingestFile(`conv_${convFiles[i]}`, content, () => { });
                        stats.conversations++;
                    }
                } catch { /* skip failed files */ }
                onProgress({ phase: 3, message: `Ingesting conversations... (${i + 1}/${convFiles.length})`, percent: 25 + Math.round((i / convFiles.length) * 20) });
            }
            console.timeEnd('[Migrator] Phase 3 - Conversations');

            // ═══════════════════════════════════════════════
            // Phase 4: Auto-ingest Style_References (the big files!)
            // ═══════════════════════════════════════════════
            onProgress({ phase: 4, message: 'Ingesting style references...', percent: 45 });

            console.time('[Migrator] Phase 4 - Style References');
            const styleFiles = await discoverFiles('Knowledge_Vault/Style_References');
            for (let i = 0; i < styleFiles.length; i++) {
                // Yield to event loop to keep UI responsive
                await new Promise(resolve => setTimeout(resolve, 10));
                try {
                    const content = await fetchDataFile(`Knowledge_Vault/Style_References/${styleFiles[i]}`);
                    if (content && content.length > 100) {
                        await ingestFile(`style_${styleFiles[i]}`, content, () => { });
                        stats.styleFiles++;
                    }
                } catch { /* skip failed files */ }
                onProgress({ phase: 4, message: `Ingesting style files... (${i + 1}/${styleFiles.length})`, percent: 45 + Math.round((i / styleFiles.length) * 35) });
            }
            console.timeEnd('[Migrator] Phase 4 - Style References');
        }

        // ═══════════════════════════════════════════════
        // Phase 5: v2 — Deep Owner Profile + Extended Graph
        // (Runs on v1 → v2)
        // ═══════════════════════════════════════════════
        if (currentVer < 2) {
            onProgress({ phase: 5, message: 'Loading deep owner profile...', percent: 82 });

            // Import extended knowledge graph from owner profile
            const profile = getOwnerProfile();
            const v2Triples = [
                ['Mostafa', 'ROLE', 'Researcher & Artist'],
                ['Mostafa', 'ORGANIZATION', 'Catalyst Technologies'],
                ['Mostafa', 'USES', 'Fooocus'],
                ['Mostafa', 'USES', 'Stable Diffusion'],
                ['Mostafa', 'USES', 'pnpm Workspaces'],
                ['Mostafa', 'INTERESTED_IN', 'Digital Security'],
                ['Mostafa', 'INTERESTED_IN', 'Video Generation AI'],
                ['Mostafa', 'INTERESTED_IN', 'Prompt Engineering'],
                ['Mostafa', 'DEVICE', 'Lenovo LOQ Laptop'],
                ['Mostafa', 'PREFERS', 'Privacy-First Architecture'],
                ['Mostafa', 'PREFERS', 'Premium UI Design'],
                ['Mostafa', 'DIALECT', 'Egyptian Arabic (عامية مصرية)'],
                ['NexusOS', 'INCLUDES', 'Aegis Daemon'],
                ['NexusOS', 'INCLUDES', 'System Monitor'],
                ['NexusOS', 'INCLUDES', 'Settings App'],
                ['NexusOS', 'INCLUDES', 'NexusCode'],
            ];

            for (const [s, p, o] of v2Triples) {
                addGraphTriple(s, p, o);
            }

            // Add extended facts from deep analysis
            const v2Facts = [
                { text: 'User is Moustafa Mohamed (مصطفى محمد), Researcher & Artist at Catalyst Technologies', at: new Date().toISOString() },
                { text: 'User expert in AI image generation — Fooocus, prompt engineering, weights, guidance scale', at: new Date().toISOString() },
                { text: 'User interested in digital security — VPN, encryption, router config, safe file transfer', at: new Date().toISOString() },
                { text: 'User has Lenovo LOQ laptop with RTX GPU for local AI tasks', at: new Date().toISOString() },
                { text: 'User demands "nuclear-level innovation" (تطوير نووى) — premium, state-of-the-art solutions', at: new Date().toISOString() },
                { text: 'User prefers local-first architecture — no cloud services unless explicitly needed', at: new Date().toISOString() },
                { text: 'When user says "امشى" it means "proceed/go ahead"', at: new Date().toISOString() },
                { text: 'When user says "بايظ" it means "broken/messed up"', at: new Date().toISOString() },
                { text: 'When user says "فاهمنى" it means "do you understand me?"', at: new Date().toISOString() },
                { text: 'User personality: direct, practical, quality-obsessed, fast-paced, perfectionist', at: new Date().toISOString() },
            ];

            const existingFacts = JSON.parse(localStorage.getItem('nexus_cortex_facts') || '[]');
            const allFacts = [...existingFacts];
            for (const f of v2Facts) {
                if (!allFacts.some(ef => ef.text.includes(f.text.substring(0, 30)))) {
                    allFacts.push(f);
                }
            }
            localStorage.setItem('nexus_cortex_facts', JSON.stringify(allFacts.slice(-100)));

            // Extend Style DNA with Vibelab's full phrase data
            const existingDNA = getStyleDNA();
            const extendedIdioms = [
                ...new Set([
                    ...(existingDNA.idioms || []),
                    'فاهمنى', 'امشى', 'تطوير نووى', 'راجع دستورك', 'بايظ', 'مظبوط',
                    'خلاص', 'يعنى', 'عشان', 'بقى', 'فين', 'ليه', 'ازاى',
                    'يا باشا', 'تمام', 'اتكلم ازاى',
                ]),
            ].slice(-50);

            const extendedExpertise = [
                ...new Set([
                    ...(existingDNA.expertise || []),
                    'AI Image Generation (Fooocus, Stable Diffusion)',
                    'Digital Security & Privacy',
                    'Prompt Engineering',
                ]),
            ].slice(-30);

            importMemory({
                styleDNA: {
                    ...existingDNA,
                    idioms: extendedIdioms,
                    expertise: extendedExpertise,
                    lastUpdated: new Date().toISOString(),
                },
            });

            stats.ownerProfile = true;
            stats.facts += v2Facts.length;
            stats.graphTriples = (stats.graphTriples || 0) + v2Triples.length;
        }

        // ═══════════════════════════════════════════════
        // Phase 6: Finalize
        // ═══════════════════════════════════════════════
        onProgress({ phase: 6, message: 'Finalizing migration...', percent: 98 });

        const kbStats = await getStats();
        stats.chunks = kbStats.totalChunks;

        localStorage.setItem(MIGRATION_KEY, String(CURRENT_VERSION));
        onProgress({ phase: 6, message: `Migration v${CURRENT_VERSION} complete! ✅`, percent: 100 });

        console.log(`[Migrator] ✅ Migration v${CURRENT_VERSION} complete:`, stats);
        isMigrating = false;
        return { success: true, stats };

    } catch (err) {
        console.error('[Migrator] Migration failed:', err);
        // Still save partial progress if we at least got past v1
        if (getMigrationVersion() < 1 && stats.styleDNA) {
            localStorage.setItem(MIGRATION_KEY, '1');
        }
        isMigrating = false;
        return { success: false, stats, error: err.message };
    }
}

// ─── Helper: Fetch a data file from /src/data/ ──────────────
async function fetchDataFile(relativePath) {
    try {
        const res = await fetch(`/src/data/${relativePath}`);
        if (res.ok) return await res.text();
    } catch { /* pass */ }

    // Fallback: try Electron file read
    if (window.nexusAPI?.readFile) {
        try {
            return await window.nexusAPI.readFile(`src/data/${relativePath}`);
        } catch { /* pass */ }
    }

    return null;
}

// ─── Helper: Discover files in a directory ──────────────────
// Since we can't list directories from the browser, we hardcode the known files
async function discoverFiles(dir) {
    if (dir.includes('Conversations')) {
        return [
            'Chat_69990cfb2a8995ba510ef97d_1771638481416.txt',
            'Chat_6999102c37ad707331967a3c_1771639713303.txt',
            'Chat_6999102c37ad707331967a3c_1771640130753.txt',
            'Chat_699916863a7dc141bc15e4f4_1771641445811.txt',
            'Chat_6999c707a723afa3bf6ab60a_1771685692689.txt',
            'Chat_6999c905bb5cbbe3b0a3824c_1771686327264.txt',
            'Chat_6999ccf4ceea1ff97f5e08e7_1771687268757.txt',
            'Chat_6999cfef02531cb5dfab3f1a_1771688055355.txt',
            'Chat_6999d23ebd6417a931ad3dd7_1771693462767.txt',
            'Chat_699a05bcd530fccba3d6ffa2_1771702191676.txt',
            'Chat_699a1ef62db0d98d73f87d2d_1771708305645.txt',
            'Chat_699a2dce71c871b0d1dce507_1771712099516.txt',
            'Chat_699b005d2f294a7be429570f_1771766479356.txt',
            'Chat_699b05a865d57232afc76720_1771768595449.txt',
            'Chat_699b114b0f37dfd749d7a4cc_1771770484238.txt',
            'Chat_699b3d21b87eb59d324864d5_1771781673706.txt',
            'Chat_699b3d21b87eb59d324864d5_1771781950212.txt',
            'Chat_699b42c0b87eb59d32486538_1771783194694.txt',
            'Chat_699b42c0b87eb59d32486538_1771783510532.txt',
            'Chat_699b42c0b87eb59d32486538_1771784143072.txt',
            'Chat_699b42c0b87eb59d32486538_1771784567625.txt',
            'Chat_699b4f839174a15b8bb723e4_1771786453879.txt',
            'Chat_699b4f839174a15b8bb723e4_1771786476374.txt',
            'Chat_699b4f839174a15b8bb723e4_1771786668735.txt',
        ];
    }
    if (dir.includes('Style_References')) {
        return [
            // ChatGPT exports
            'ChatGPT-New_part1.txt', 'ChatGPT-New_part2.txt', 'ChatGPT-New_part3.txt',
            'ChatGPT-New_part4.txt', 'ChatGPT-New_part5.txt', 'ChatGPT-New_part6.txt',
            'ChatGPT-New_part7.txt', 'ChatGPT-New_part8.txt',
            'ChatGPT-OLD_part1.txt', 'ChatGPT-OLD_part2.txt', 'ChatGPT-OLD_part3.txt',
            'ChatGPT-OLD_part4.txt', 'ChatGPT-OLD_part5.txt', 'ChatGPT-OLD_part6.txt',
            'ChatGPT-OLD_part7.txt', 'ChatGPT-OLD_part8.txt', 'ChatGPT-OLD_part9.txt',
            // Gemini exports
            'Gemini-5-2-2026_part1.txt', 'Gemini-5-2-2026_part2.txt', 'Gemini-5-2-2026_part3.txt',
            'Gemini-5-2-2026_part4.txt', 'Gemini-5-2-2026_part5.txt', 'Gemini-5-2-2026_part6.txt',
            // Technical references
            'enhance_ai_prompt.txt', 'fooocus_prompt_1.txt',
            'nexus_smart_backup_part_one.txt', 'restoring_install_fooocus.txt',
            'tools_ui_part_1.txt', 'tools_ui_part_2.txt',
            'understanding_llm_models.txt', 'Untitled_document.txt',
            'vibelab-part3.txt',
            // WhatsApp chats
            'WhatsApp_Chat_with_my_wife.txt', 'WhatsApp_Chat_with_Sister.txt',
            // ── v2: Arabic-named files (were missing in v1) ──
            'تأمين_الاتصال_بالانترنت.txt',
            'تأمين_الاتصال_بالانترنت_الجزء_الثانى.txt',
            'تأمين_الواتساب_الموقع_وإعدادات_الراوتر.txt',
            'خطة_تأمين_رقمي_شاملة_للباحثين.txt',
            'مشروع_vibelab_الجزء_الاول.txt',
            'نقل_الملفات_الفنية_بأمان_من_الميتاداتا.txt',
        ];
    }
    return [];
}

/**
 * Reset migration state (allows re-running).
 */
export function resetMigration() {
    localStorage.removeItem(MIGRATION_KEY);
}
