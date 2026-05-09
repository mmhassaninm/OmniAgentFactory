// ═══════════════════════════════════════════════════════════════
//  🧠 NEXUS MEMORY CORTEX — Client-Side Intelligence System
//  Adapted from Vibelab's memoryArchiver.js + graphMemory.js
//  Stores: facts, style DNA, knowledge graph, training data
//  All in localStorage — no backend required.
//  v2: Integrated with Owner Profile for deep personalization.
// ═══════════════════════════════════════════════════════════════
import { getOwnerContextForPrompt } from './ownerProfile.js';

const STORAGE_KEYS = {
    FACTS: 'nexus_cortex_facts',           // Extracted facts about the user
    STYLE_DNA: 'nexus_cortex_style_dna',   // User's communication style
    GRAPH: 'nexus_cortex_graph',           // Knowledge Graph (nodes + edges)
    MSG_COUNTER: 'nexus_cortex_msg_count', // Messages since last archival
    CONV_SUMMARIES: 'nexus_cortex_summaries', // Conversation summaries
};

const IS_ELECTRON = typeof window !== 'undefined' && !!window.nexusAPI;
const LM_STUDIO_BASE = IS_ELECTRON ? 'http://127.0.0.1:1234' : '/lmstudio';
const LM_STUDIO_URL = `${LM_STUDIO_BASE}/v1/chat/completions`;

// ─── Storage Helpers ──────────────────────────────────────────
function loadJSON(key, fallback) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : fallback;
    } catch { return fallback; }
}

function saveJSON(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.warn(`[MemoryCortex] Storage write failed for ${key}:`, e.message);
    }
}

// ═══════════════════════════════════════════════════════════════
//  🧬 STYLE DNA — Tracks user communication patterns
// ═══════════════════════════════════════════════════════════════
export function getStyleDNA() {
    return loadJSON(STORAGE_KEYS.STYLE_DNA, {
        idioms: [],           // User's favorite phrases/expressions
        expertise: [],        // Topics the user knows well
        preferredLanguage: 'ar',
        averageMessageLength: 0,
        totalMessages: 0,
        lastUpdated: null,
    });
}

function updateStyleDNA(updates) {
    const dna = getStyleDNA();
    if (updates.idioms) {
        dna.idioms = [...new Set([...dna.idioms, ...updates.idioms])].slice(-50);
    }
    if (updates.expertise) {
        dna.expertise = [...new Set([...dna.expertise, ...updates.expertise])].slice(-30);
    }
    if (updates.preferredLanguage) dna.preferredLanguage = updates.preferredLanguage;
    if (updates.messageLength) {
        dna.totalMessages++;
        dna.averageMessageLength = Math.round(
            (dna.averageMessageLength * (dna.totalMessages - 1) + updates.messageLength) / dna.totalMessages
        );
    }
    dna.lastUpdated = new Date().toISOString();
    saveJSON(STORAGE_KEYS.STYLE_DNA, dna);
    return dna;
}

// ═══════════════════════════════════════════════════════════════
//  🕸️ KNOWLEDGE GRAPH — Entity-Relationship Memory
// ═══════════════════════════════════════════════════════════════
function getGraph() {
    return loadJSON(STORAGE_KEYS.GRAPH, { nodes: {}, edges: [] });
}

function saveGraph(graph) {
    saveJSON(STORAGE_KEYS.GRAPH, graph);
}

export function addGraphTriple(subject, predicate, object) {
    const graph = getGraph();
    const s = subject.toLowerCase().replace(/\s+/g, '_');
    const o = object.toLowerCase().replace(/\s+/g, '_');

    // Add nodes if missing
    if (!graph.nodes[s]) graph.nodes[s] = { label: subject, createdAt: new Date().toISOString() };
    if (!graph.nodes[o]) graph.nodes[o] = { label: object, createdAt: new Date().toISOString() };

    // Check for duplicate edges
    const isDup = graph.edges.some(e => e.from === s && e.to === o && e.rel === predicate.toUpperCase());
    if (!isDup) {
        graph.edges.push({ from: s, to: o, rel: predicate.toUpperCase(), at: new Date().toISOString() });
    }
    saveGraph(graph);
}

export function queryGraph(keyword) {
    if (!keyword || keyword.trim().length < 2) return [];
    const graph = getGraph();
    const kws = keyword.toLowerCase().split(/\s+/).filter(k => k.length > 2);
    const matched = new Set();

    // Find matching nodes
    for (const [id, node] of Object.entries(graph.nodes)) {
        const text = `${id} ${node.label}`.toLowerCase();
        if (kws.some(k => text.includes(k))) matched.add(id);
    }

    // 1-hop traversal
    const connected = new Set(matched);
    for (const edge of graph.edges) {
        if (matched.has(edge.from)) connected.add(edge.to);
        if (matched.has(edge.to)) connected.add(edge.from);
    }

    // Build triples
    const results = [];
    for (const edge of graph.edges) {
        if (connected.has(edge.from) || connected.has(edge.to)) {
            const fn = graph.nodes[edge.from];
            const tn = graph.nodes[edge.to];
            if (fn && tn) results.push({ subject: fn.label, predicate: edge.rel, object: tn.label });
        }
    }

    // Deduplicate
    const seen = new Set();
    return results.filter(r => {
        const key = `${r.subject}|${r.predicate}|${r.object}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 10);
}

export function getGraphStats() {
    const graph = getGraph();
    return { nodes: Object.keys(graph.nodes).length, edges: graph.edges.length };
}

// ═══════════════════════════════════════════════════════════════
//  💾 FACTS STORE — Extracted knowledge about the user
// ═══════════════════════════════════════════════════════════════
export function getFacts() {
    return loadJSON(STORAGE_KEYS.FACTS, []);
}

function addFact(fact) {
    if (!fact || fact.trim().length < 5) return;
    const facts = getFacts();
    // Improved deduplication: check for high similarity in first 50 chars
    const factSlug = fact.toLowerCase().trim().substring(0, 50);
    const isDup = facts.some(f => f.text.toLowerCase().includes(factSlug));

    if (!isDup) {
        facts.push({ text: fact.trim(), at: new Date().toISOString() });
        // Prune facts to keep only the most recent/relevant (Limit: 50)
        if (facts.length > 50) facts.shift();
        saveJSON(STORAGE_KEYS.FACTS, facts);
    }
}

// ═══════════════════════════════════════════════════════════════
//  🧠 ARCHIVAL ENGINE — Background Processing after N messages
// ═══════════════════════════════════════════════════════════════
const ARCHIVE_EVERY = 10; // Archive every 10 messages

/**
 * Track a new message and trigger archival when threshold is reached.
 * @param {Array} messagesChunk - Recent conversation messages [{role, content}]
 * @param {string} model - LM Studio model to use for extraction
 */
export async function trackMessage(messagesChunk, model = 'local-model') {
    let count = parseInt(localStorage.getItem(STORAGE_KEYS.MSG_COUNTER) || '0');
    count++;
    localStorage.setItem(STORAGE_KEYS.MSG_COUNTER, String(count));

    // Update basic style stats from user messages
    const userMsgs = messagesChunk.filter(m => m.role === 'user');
    for (const msg of userMsgs) {
        const isArabic = /[\u0600-\u06FF]/.test(msg.content);
        updateStyleDNA({
            preferredLanguage: isArabic ? 'ar' : 'en',
            messageLength: msg.content.length,
        });
    }

    // Trigger archival every ARCHIVE_EVERY messages
    if (count >= ARCHIVE_EVERY) {
        localStorage.setItem(STORAGE_KEYS.MSG_COUNTER, '0');
        // Run in background — don't block the UI
        archiveChunk(messagesChunk, model).catch(err =>
            console.warn('[MemoryCortex] Background archival failed:', err.message)
        );
    }
}

/**
 * Process a conversation chunk: extract facts, style, and graph triples.
 */
async function archiveChunk(messages, model) {
    const recent = messages.slice(-8);
    let conversationText = recent.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n');
    if (conversationText.length > 6000) conversationText = conversationText.substring(conversationText.length - 6000);

    console.log('[MemoryCortex] 🧠 Archiving conversation chunk...');

    // ── Three parallel LLM extraction tasks ──
    const [factsResult, profileResult, graphResult] = await Promise.allSettled([
        llmExtract(model, 'You are a memory archiver. Extract the key facts and decisions from this conversation. Output a JSON array of strings: ["fact1", "fact2", ...]', conversationText),
        llmExtract(model, `You are a Psychological Profiler. Analyze the user's prompts and extract:
1. expertise: Topics the user knows about
2. idioms: Unique phrases or slang they use (especially Egyptian Arabic)
Output STRICTLY JSON: {"expertise": ["Topic1"], "idioms": ["phrase1"]}`, conversationText),
        llmExtract(model, `You are a Knowledge Graph Builder. Extract entity relationships.
Output ONLY a JSON array: [{"subject": "Name", "predicate": "RELATIONSHIP", "object": "Name"}]
Use predicates like: INTERESTED_IN, USES, KNOWS_ABOUT, PREFERS, WORKS_ON. Return [] if none found.`, conversationText),
    ]);

    // Process facts
    if (factsResult.status === 'fulfilled' && factsResult.value) {
        try {
            const facts = JSON.parse(factsResult.value.match(/\[[\s\S]*\]/)?.[0] || '[]');
            if (Array.isArray(facts)) facts.forEach(f => typeof f === 'string' && addFact(f));
        } catch { /* skip */ }
    }

    // Process profile
    if (profileResult.status === 'fulfilled' && profileResult.value) {
        try {
            const profile = JSON.parse(profileResult.value.match(/\{[\s\S]*\}/)?.[0] || '{}');
            if (profile.expertise || profile.idioms) updateStyleDNA(profile);
        } catch { /* skip */ }
    }

    // Process graph triples
    if (graphResult.status === 'fulfilled' && graphResult.value) {
        try {
            const triples = JSON.parse(graphResult.value.match(/\[[\s\S]*\]/)?.[0] || '[]');
            if (Array.isArray(triples)) {
                for (const t of triples) {
                    if (t.subject && t.predicate && t.object) addGraphTriple(t.subject, t.predicate, t.object);
                }
            }
        } catch { /* skip */ }
    }

    console.log('[MemoryCortex] ✅ Archival complete.');
}

/**
 * Make a non-streaming LLM call for extraction.
 */
async function llmExtract(model, systemPrompt, userContent) {
    const res = await fetch(LM_STUDIO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Conversation Chunk:\n${userContent}` }
            ],
            temperature: 0.1,
            max_tokens: 512,
            stream: false,
        }),
        signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
}

// ═══════════════════════════════════════════════════════════════
//  📊 BUILD PERSONALIZATION CONTEXT — Injected into system prompt
// ═══════════════════════════════════════════════════════════════
/**
 * Build a personalization context string from all memory sources.
 * Combines: Owner Profile (static) + Style DNA (evolving) + Facts + Knowledge Graph
 * @param {string} currentQuery - The user's current message (for graph search)
 * @returns {string} Context string for system prompt injection
 */
export function buildPersonalizationContext(currentQuery = '') {
    const parts = [];
    const dna = getStyleDNA();
    const facts = getFacts();

    // ── Deep Owner Profile (Static intelligence from Vibelab analysis) ──
    try {
        const ownerCtx = getOwnerContextForPrompt();
        if (ownerCtx) parts.push(ownerCtx.trim());
    } catch { /* ownerProfile not available */ }

    // ── Evolving Style DNA (Updated from ongoing conversations) ──
    if (dna.idioms.length > 0 || dna.expertise.length > 0) {
        let styleSection = '[LEARNED USER PATTERNS]';
        if (dna.expertise.length > 0) styleSection += `\nExpertise: ${dna.expertise.join(', ')}`;
        if (dna.idioms.length > 0) styleSection += `\nRecent speech patterns: ${dna.idioms.slice(-15).join(', ')}`;
        if (dna.preferredLanguage) styleSection += `\nPreferred language: ${dna.preferredLanguage === 'ar' ? 'Arabic (Egyptian dialect)' : 'English'}`;
        if (dna.totalMessages) styleSection += `\nTotal messages tracked: ${dna.totalMessages}`;
        parts.push(styleSection);
    }

    // ── Recent facts (Extracted by background archival engine) ──
    if (facts.length > 0) {
        const recentFacts = facts.slice(-15).map(f => `- ${f.text}`).join('\n');
        parts.push(`[KNOWN FACTS ABOUT USER]\n${recentFacts}`);
    }

    // ── Knowledge graph (Context-relevant relationships) ──
    if (currentQuery) {
        const triples = queryGraph(currentQuery);
        if (triples.length > 0) {
            const graphCtx = triples.map(t => `${t.subject} → ${t.predicate} → ${t.object}`).join('\n');
            parts.push(`[KNOWLEDGE GRAPH CONTEXT]\n${graphCtx}`);
        }
    }

    return parts.length > 0 ? '\n\n' + parts.join('\n\n') : '';
}

/**
 * Export all memory data for backup.
 */
export function exportMemory() {
    return {
        facts: getFacts(),
        styleDNA: getStyleDNA(),
        graph: getGraph(),
        exportedAt: new Date().toISOString(),
    };
}

/**
 * Import memory data from backup.
 */
export function importMemory(data) {
    if (data.facts) saveJSON(STORAGE_KEYS.FACTS, data.facts);
    if (data.styleDNA) saveJSON(STORAGE_KEYS.STYLE_DNA, data.styleDNA);
    if (data.graph) saveGraph(data.graph);
}

/**
 * Clear all memory data (reset).
 */
export function clearMemory() {
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
}
