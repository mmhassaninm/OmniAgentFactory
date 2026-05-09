import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const VAULT_ROOT = path.join(PROJECT_ROOT, 'my-files', 'Knowledge_Vault');
const GRAPH_FILE = path.join(VAULT_ROOT, 'Graph_Memory.json');
const FACTS_DIR = path.join(VAULT_ROOT, 'Profiles');
const CONVERSATIONS_DIR = path.join(VAULT_ROOT, 'Conversations');
const DRAFTS_DIR = path.join(PROJECT_ROOT, 'backend', '.vibelab_drafts');
const LLM_API = 'http://127.0.0.1:1234/v1/chat/completions';

if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });

// ─────────────────────────────────────────────
// Phase 1: Gather User Intelligence
// ─────────────────────────────────────────────
function gatherUserProfile() {
    console.log('🔍 [PREDICT] Gathering user intelligence from Knowledge Vault...\n');
    const intel = { graph: null, facts: [], recentConversations: [] };

    // 1. Load Knowledge Graph
    try {
        if (fs.existsSync(GRAPH_FILE)) {
            const graphData = JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8'));
            const nodeCount = Object.keys(graphData.nodes || {}).length;
            const edgeCount = (graphData.edges || []).length;

            // Extract key triples for context
            const triples = (graphData.edges || []).slice(-20).map(edge => {
                const fromNode = graphData.nodes?.[edge.from];
                const toNode = graphData.nodes?.[edge.to];
                return `${fromNode?.label || edge.from} —[${edge.relationship}]→ ${toNode?.label || edge.to}`;
            });

            intel.graph = { nodeCount, edgeCount, triples };
            console.log(`   🕸️ Graph: ${nodeCount} nodes, ${edgeCount} edges`);
        }
    } catch (e) {
        console.warn(`   ⚠️ Could not read Graph_Memory.json: ${e.message}`);
    }

    // 2. Load Core Facts from all profiles
    try {
        if (fs.existsSync(FACTS_DIR)) {
            const profiles = fs.readdirSync(FACTS_DIR).filter(f =>
                fs.statSync(path.join(FACTS_DIR, f)).isDirectory()
            );

            for (const profile of profiles) {
                const factsFile = path.join(FACTS_DIR, profile, 'Core_Facts.json');
                if (fs.existsSync(factsFile)) {
                    const factsData = JSON.parse(fs.readFileSync(factsFile, 'utf8'));
                    const factValues = Object.values(factsData).filter(v => typeof v === 'string').slice(-15);
                    intel.facts.push(...factValues);
                }
            }
            console.log(`   🧠 Facts: ${intel.facts.length} core facts loaded`);
        }
    } catch (e) {
        console.warn(`   ⚠️ Could not read Core_Facts: ${e.message}`);
    }

    // 3. Load recent conversation summaries
    try {
        if (fs.existsSync(CONVERSATIONS_DIR)) {
            const files = fs.readdirSync(CONVERSATIONS_DIR)
                .filter(f => f.endsWith('.txt'))
                .sort()
                .slice(-5); // Last 5 conversation summaries

            for (const file of files) {
                const content = fs.readFileSync(path.join(CONVERSATIONS_DIR, file), 'utf8');
                intel.recentConversations.push(content.substring(0, 500));
            }
            console.log(`   💬 Recent conversations: ${intel.recentConversations.length} summaries loaded`);
        }
    } catch (e) {
        console.warn(`   ⚠️ Could not read conversations: ${e.message}`);
    }

    return intel;
}

// ─────────────────────────────────────────────
// Phase 2: Predict next feature via LLM
// ─────────────────────────────────────────────
async function predictNextFeature(intel) {
    console.log('\n🧠 [PREDICT] Asking LLM to predict the user\'s next feature request...\n');

    const graphContext = intel.graph
        ? `Knowledge Graph (${intel.graph.nodeCount} nodes, ${intel.graph.edgeCount} edges):\n${intel.graph.triples.join('\n')}`
        : 'No knowledge graph data available.';

    const factsContext = intel.facts.length > 0
        ? `Core Facts about the user:\n${intel.facts.map(f => `- ${f}`).join('\n')}`
        : 'No core facts available.';

    const convContext = intel.recentConversations.length > 0
        ? `Recent conversation summaries:\n${intel.recentConversations.join('\n---\n')}`
        : 'No recent conversation data.';

    const prompt = `You are a Predictive AI specializing in developer behavior analysis. Based on the user's profile data below, predict the NEXT feature, script, or tool the user will most likely ask for. Then, write the complete, production-ready code for that feature.

USER PROFILE DATA:
═══════════════════

${graphContext}

${factsContext}

${convContext}

═══════════════════

INSTRUCTIONS:
1. Analyze the user's tech stack, recent work patterns, and knowledge graph connections.
2. Predict ONE specific feature/script they will likely need next.
3. Write the COMPLETE, working code for that feature.
4. The code should be in Node.js/JavaScript (ESM) unless the profile clearly suggests otherwise.

OUTPUT FORMAT (raw, no markdown fences around the whole response):
---PREDICTION_START---
Feature: [name of the predicted feature]
Reasoning: [2-3 sentences explaining why this is the likely next request]
---CODE_START---
[The complete implementation code here]
---CODE_END---`;

    try {
        const response = await axios.post(LLM_API, {
            model: 'qwen2.5-coder-7b-instruct',
            messages: [
                { role: 'system', content: 'You are an elite predictive AI that anticipates developer needs. Output in the exact format requested.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.5,
            max_tokens: 4000
        }, { timeout: 90000 });

        const reply = response.data?.choices?.[0]?.message?.content?.trim();
        if (!reply) throw new Error('Empty LLM response');

        // Parse the response
        const featureMatch = reply.match(/Feature:\s*(.+)/i);
        const reasoningMatch = reply.match(/Reasoning:\s*(.+(?:\n.+)*?)(?=---CODE_START---|$)/i);
        const codeMatch = reply.match(/---CODE_START---\s*([\s\S]*?)\s*---CODE_END---/);

        const featureName = featureMatch ? featureMatch[1].trim() : 'Unknown Feature';
        const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'No reasoning provided.';
        const code = codeMatch ? codeMatch[1].trim() : reply; // Fallback: use whole reply as code

        console.log(`🎯 [PREDICT] Predicted Feature: "${featureName}"`);
        console.log(`   Reasoning: ${reasoning}\n`);

        return { featureName, reasoning, code };

    } catch (err) {
        console.error(`🛑 [PREDICT] LLM prediction failed: ${err.message}`);
        return null;
    }
}

// ─────────────────────────────────────────────
// Phase 3: Save predicted code silently
// ─────────────────────────────────────────────
function savePrediction(prediction) {
    const safeFileName = prediction.featureName
        .replace(/[^a-zA-Z0-9_\- ]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);

    const draftFileName = `PREDICTED_FEATURE_${Date.now()}_${safeFileName}.js`;
    const draftPath = path.join(DRAFTS_DIR, draftFileName);

    const fileContent = `// ═══════════════════════════════════════════════
// 🔮 Predictive Pre-fetch: ${prediction.featureName}
// Generated: ${new Date().toISOString()}
// Reasoning: ${prediction.reasoning}
// ═══════════════════════════════════════════════

${prediction.code}
`;

    fs.writeFileSync(draftPath, fileContent, 'utf8');
    console.log(`📁 [PREDICT] Draft saved: ${draftFileName}`);
    return draftPath;
}

// ─────────────────────────────────────────────
// Main Orchestrator
// ─────────────────────────────────────────────
async function runPredictiveEngine() {
    console.log('═══════════════════════════════════════════════');
    console.log('  🔮 VibeLab Predictive Pre-fetch Engine v1.0');
    console.log('═══════════════════════════════════════════════');

    // Phase 1: Gather intelligence
    const intel = gatherUserProfile();

    if (!intel.graph && intel.facts.length === 0 && intel.recentConversations.length === 0) {
        console.log('\n🛑 [PREDICT] Insufficient user data for prediction. Build more history first.');
        return;
    }

    // Phase 2: Predict
    const prediction = await predictNextFeature(intel);
    if (!prediction) {
        console.log('\n🛑 [PREDICT] Prediction engine failed. Exiting.');
        return;
    }

    // Phase 3: Save
    savePrediction(prediction);

    console.log('\n═══════════════════════════════════════════════');
    console.log('  ✅ Prediction engine generated a new draft');
    console.log('     based on user habits.');
    console.log('  📁 Check .vibelab_drafts/ for the output.');
    console.log('═══════════════════════════════════════════════');
}

runPredictiveEngine();
