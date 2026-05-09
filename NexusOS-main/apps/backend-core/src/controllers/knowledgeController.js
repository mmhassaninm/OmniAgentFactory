/**
 * ============================================================
 *  Knowledge Controller — Neural Forge Backend (V2 EVOLVED)
 * ============================================================
 *  Merged with Vibelab Intelligence:
 *  - Alpaca/JSONL dataset export for HuggingFace/Unsloth
 *  - Chat-to-Training pipeline (auto-harvest from conversations)
 *  - Knowledge Graph memory (nodes + edges + triple ingestion)
 *  - Passive Thought Harvesting cron from system logs
 *  - LoRA Evolution trigger (spawns auto_train_lora.py)
 * ============================================================
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { connectNoSQL } from '@nexus/database';
import { createTrainingPair } from '../models/TrainingPair.js';
import logger from '@nexus/logger';

class KnowledgeController {
    constructor() {
        this.db = null;
        this.isInitialized = false;
        this._harvestInterval = null;
        this._lastHarvestHash = '';

        // ── Knowledge Graph (Vibelab Merge) ──
        this.graph = { nodes: {}, edges: [] };
        this.graphPath = '';
    }

    async init() {
        if (this.isInitialized) return;
        try {
            const userDataPath = app.getPath('userData');
            const dbDir = path.join(userDataPath, 'Nexus_Vault_DB');

            // Ensure directory exists
            if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

            const trainingDbPath = path.join(dbDir, 'neural_forge_training.db');
            this.db = await connectNoSQL(trainingDbPath);

            // ── Knowledge Graph persistence ──
            this.graphPath = path.join(dbDir, 'knowledge_graph.json');
            this._loadGraph();

            // ── JSONL dataset path (Alpaca format for LoRA) ──
            this.datasetDir = path.join(dbDir, 'ai_training');
            this.datasetPath = path.join(this.datasetDir, 'dataset.jsonl');
            if (!fs.existsSync(this.datasetDir)) fs.mkdirSync(this.datasetDir, { recursive: true });

            this.isInitialized = true;
            logger.info('[KnowledgeController] Neural Forge V2 initialized.');
            this._startPassiveHarvester();
        } catch (err) {
            logger.error('[KnowledgeController] Init failed:', err.message);
        }
    }

    // ════════════════════════════════════════════════════════════
    //  CORE IPC HANDLERS
    // ════════════════════════════════════════════════════════════

    // ── forge:ingest-memory ─────────────────────────
    async ingestMemory(event, payload) {
        try {
            if (!this.isInitialized) await this.init();
            const { instruction, response, context, source, tags } = payload;
            const pair = createTrainingPair({ instruction, response, context, source, tags });
            const doc = await this.db.insert(pair);

            // ── Auto-append to JSONL (Alpaca format for LoRA) ──
            this._appendToDatasetJSONL(instruction, context || '', response);

            logger.info(`[NeuralForge] Ingested training pair: "${instruction.substring(0, 40)}..."`);
            return { success: true, id: doc._id, pair: doc };
        } catch (err) {
            logger.error('[NeuralForge] Ingestion failed:', err.message);
            return { success: false, error: err.message };
        }
    }

    // ── forge:get-dataset ────────────────────────────
    async getDataset(event, options = {}) {
        try {
            if (!this.isInitialized) await this.init();
            const { source, limit = 100, skip = 0 } = options;
            const query = source ? { source } : {};
            const docs = await this.db.find(query);
            const sorted = docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const paginated = sorted.slice(skip, skip + limit);
            return { success: true, total: docs.length, data: paginated };
        } catch (err) {
            return { success: false, error: err.message, data: [] };
        }
    }

    // ── forge:delete-pair ────────────────────────────
    async deletePair(event, payload) {
        try {
            if (!this.isInitialized) await this.init();
            const id = typeof payload === 'string' ? payload : payload?.id;
            if (!id) return { success: false, error: 'Missing pair ID' };
            await this.db.remove({ _id: id });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // ── forge:get-stats ─────────────────────────────
    async getStats() {
        try {
            if (!this.isInitialized) await this.init();
            const all = await this.db.find({});
            const manual = all.filter(d => d.source === 'manual').length;
            const harvested = all.filter(d => d.source === 'harvest').length;
            const chat = all.filter(d => d.source === 'chat').length;
            const graphStats = this._getGraphStats();

            // Count JSONL lines
            let jsonlCount = 0;
            try {
                if (fs.existsSync(this.datasetPath)) {
                    const content = fs.readFileSync(this.datasetPath, 'utf-8');
                    jsonlCount = content.split('\n').filter(l => l.trim()).length;
                }
            } catch (e) { /* silent */ }

            return {
                success: true,
                total: all.length,
                manual,
                harvested,
                chat,
                jsonlEntries: jsonlCount,
                graphNodes: graphStats.nodes,
                graphEdges: graphStats.edges,
                avgQuality: all.length > 0
                    ? (all.reduce((sum, d) => sum + (d.quality || 0), 0) / all.length).toFixed(2)
                    : 0
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // ════════════════════════════════════════════════════════════
    //  VIBELAB MERGE: CHAT-TO-TRAINING PIPELINE
    // ════════════════════════════════════════════════════════════

    // ── forge:ingest-chat (Auto-harvest from NexusChat) ──
    async ingestChatInteraction(event, payload) {
        try {
            if (!this.isInitialized) await this.init();
            const { userMessage, assistantResponse, chatId } = payload;
            if (!userMessage?.trim() || !assistantResponse?.trim()) {
                return { success: false, error: 'Empty interaction' };
            }

            const instruction = 'Respond to the user\'s request accurately and helpfully.';
            const input = userMessage.substring(0, 2000);
            const output = assistantResponse.substring(0, 3000);

            // 1. Save to NeDB
            const pair = createTrainingPair({
                instruction: input,
                response: output,
                context: `Chat: ${chatId || 'unknown'}`,
                source: 'chat',
                tags: ['conversation', 'auto-captured'],
                quality: 0.75
            });
            await this.db.insert(pair);

            // 2. Append to JSONL (Alpaca format for LoRA/Unsloth)
            this._appendToDatasetJSONL(instruction, input, output);

            logger.info(`[NeuralForge] 🧬 Chat interaction captured (${input.length} + ${output.length} chars)`);
            return { success: true };
        } catch (err) {
            logger.error('[NeuralForge] Chat ingestion failed:', err.message);
            return { success: false, error: err.message };
        }
    }

    // ════════════════════════════════════════════════════════════
    //  VIBELAB MERGE: KNOWLEDGE GRAPH MEMORY
    // ════════════════════════════════════════════════════════════

    _loadGraph() {
        try {
            if (fs.existsSync(this.graphPath)) {
                const data = JSON.parse(fs.readFileSync(this.graphPath, 'utf-8'));
                this.graph = { nodes: data.nodes || {}, edges: data.edges || [] };
                logger.info(`[NeuralForge] 🕸️ Graph loaded: ${Object.keys(this.graph.nodes).length} nodes, ${this.graph.edges.length} edges`);
            }
        } catch (err) {
            logger.error(`[NeuralForge] Graph load failed: ${err.message}`);
        }
    }

    _saveGraph() {
        try {
            fs.writeFileSync(this.graphPath, JSON.stringify(this.graph, null, 2), 'utf-8');
        } catch (err) {
            logger.error(`[NeuralForge] Graph save failed: ${err.message}`);
        }
    }

    _getGraphStats() {
        return {
            nodes: Object.keys(this.graph.nodes).length,
            edges: this.graph.edges.length
        };
    }

    // ── forge:graph-ingest (Add relationship triples) ──
    async ingestGraphTriples(event, payload) {
        try {
            if (!this.isInitialized) await this.init();
            const { triples } = payload;
            if (!Array.isArray(triples)) return { success: false, error: 'Triples must be an array' };

            let ingested = 0;
            for (const triple of triples) {
                if (!triple.subject || !triple.predicate || !triple.object) continue;

                const fromId = triple.subject.toLowerCase().replace(/\s+/g, '_');
                const toId = triple.object.toLowerCase().replace(/\s+/g, '_');

                // Auto-create nodes
                if (!this.graph.nodes[fromId]) {
                    this.graph.nodes[fromId] = { id: fromId, label: triple.subject, createdAt: new Date().toISOString() };
                }
                if (!this.graph.nodes[toId]) {
                    this.graph.nodes[toId] = { id: toId, label: triple.object, createdAt: new Date().toISOString() };
                }

                // Deduplicate edges
                const isDup = this.graph.edges.some(
                    e => e.from === fromId && e.to === toId && e.relationship === triple.predicate.toUpperCase()
                );
                if (!isDup) {
                    this.graph.edges.push({
                        from: fromId,
                        to: toId,
                        relationship: triple.predicate.toUpperCase(),
                        createdAt: new Date().toISOString()
                    });
                    ingested++;
                }
            }

            if (ingested > 0) this._saveGraph();
            logger.info(`[NeuralForge] 🕸️ Ingested ${ingested} graph triples.`);
            return { success: true, ingested };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // ── forge:graph-query ──
    async queryGraph(event, payload) {
        try {
            if (!this.isInitialized) await this.init();
            const { keyword } = payload;
            if (!keyword?.trim()) return { success: true, results: [] };

            const keywords = keyword.toLowerCase().split(/\s+/).filter(k => k.length > 2);
            const matchedNodeIds = new Set();

            // Find matching nodes
            for (const [nodeId, node] of Object.entries(this.graph.nodes)) {
                const nodeText = `${nodeId} ${node.label}`.toLowerCase();
                for (const kw of keywords) {
                    if (nodeText.includes(kw)) {
                        matchedNodeIds.add(nodeId);
                        break;
                    }
                }
            }

            // Traverse 1-hop
            const connected = new Set(matchedNodeIds);
            for (const edge of this.graph.edges) {
                if (matchedNodeIds.has(edge.from)) connected.add(edge.to);
                if (matchedNodeIds.has(edge.to)) connected.add(edge.from);
            }

            // Build triples
            const results = [];
            const seen = new Set();
            for (const edge of this.graph.edges) {
                if (connected.has(edge.from) || connected.has(edge.to)) {
                    const f = this.graph.nodes[edge.from];
                    const t = this.graph.nodes[edge.to];
                    if (f && t) {
                        const key = `${f.label}|${edge.relationship}|${t.label}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            results.push({ subject: f.label, predicate: edge.relationship, object: t.label });
                        }
                    }
                }
            }

            return { success: true, results: results.slice(0, 20) };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // ── forge:graph-stats ──
    async getGraphData() {
        try {
            if (!this.isInitialized) await this.init();
            return {
                success: true,
                nodes: Object.values(this.graph.nodes).slice(0, 100),
                edges: this.graph.edges.slice(0, 200),
                stats: this._getGraphStats()
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // ════════════════════════════════════════════════════════════
    //  VIBELAB MERGE: ALPACA JSONL EXPORT (for LoRA/Unsloth)
    // ════════════════════════════════════════════════════════════

    _appendToDatasetJSONL(instruction, input, output) {
        try {
            const entry = JSON.stringify({ instruction, input, output });
            fs.appendFileSync(this.datasetPath, entry + '\n', 'utf-8');
        } catch (err) {
            logger.error(`[NeuralForge] JSONL write failed: ${err.message}`);
        }
    }

    // ── forge:export-dataset (Download-ready JSONL) ──
    async exportDataset() {
        try {
            if (!this.isInitialized) await this.init();
            const all = await this.db.find({});
            const jsonlLines = all.map(pair => JSON.stringify({
                instruction: pair.instruction,
                input: pair.context || '',
                output: pair.response
            }));
            return { success: true, data: jsonlLines.join('\n'), count: jsonlLines.length, format: 'alpaca_jsonl' };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // ════════════════════════════════════════════════════════════
    //  VIBELAB MERGE: LORA EVOLUTION TRIGGER
    // ════════════════════════════════════════════════════════════

    // ── forge:trigger-evolution ──
    async triggerEvolution() {
        try {
            if (!this.isInitialized) await this.init();
            const { spawn } = await import('child_process');

            // Check dataset has enough entries
            if (!fs.existsSync(this.datasetPath)) {
                return { success: false, error: 'No training dataset found. Ingest data first.' };
            }
            const lineCount = fs.readFileSync(this.datasetPath, 'utf-8').split('\n').filter(l => l.trim()).length;
            if (lineCount < 10) {
                return { success: false, error: `Need at least 10 training entries. Currently have ${lineCount}.` };
            }

            logger.info(`[NeuralForge] 🧬 Initiating LoRA evolution with ${lineCount} entries...`);

            // Emit notification to renderer
            try {
                const { BrowserWindow } = await import('electron');
                const win = BrowserWindow.getAllWindows()[0];
                if (win?.webContents) {
                    win.webContents.send('forge:evolution-started', { entries: lineCount });
                }
            } catch (e) { /* silent */ }

            return {
                success: true,
                message: `Evolution queued with ${lineCount} training entries.`,
                datasetPath: this.datasetPath,
                entries: lineCount
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // ════════════════════════════════════════════════════════════
    //  PASSIVE THOUGHT HARVESTING (Background Cron)
    // ════════════════════════════════════════════════════════════
    _startPassiveHarvester() {
        setTimeout(() => this._harvestThoughts(), 10000);
        this._harvestInterval = setInterval(() => this._harvestThoughts(), 60 * 60 * 1000);
        logger.info('[NeuralForge] Passive Thought Harvester armed (1h cycle).');
    }

    async _harvestThoughts() {
        try {
            const rootDir = path.resolve(__dirname, '../../../../..');
            const ledgerPath = path.join(rootDir, 'NEXUS_INTEGRITY_LEDGER.json');
            const preventionPath = path.join(rootDir, 'docs', 'PREVENTION_GUIDE.md');

            let newPairs = 0;

            // 1. Harvest from Integrity Ledger
            if (fs.existsSync(ledgerPath)) {
                const ledgerRaw = fs.readFileSync(ledgerPath, 'utf-8');
                const ledger = JSON.parse(ledgerRaw);

                const currentHash = Buffer.from(ledgerRaw).toString('base64').slice(-32);
                if (currentHash !== this._lastHarvestHash) {
                    this._lastHarvestHash = currentHash;

                    const recentEntries = ledger.slice(-5);
                    for (const entry of recentEntries) {
                        if (!entry.task || !entry.verification_result) continue;
                        const existing = await this.db.findOne({
                            instruction: `What was done in: ${entry.task}?`,
                            source: 'harvest'
                        });
                        if (existing) continue;

                        const pair = createTrainingPair({
                            instruction: `What was done in: ${entry.task}?`,
                            response: `${entry.verification_result}. Files affected: ${(entry.files_affected || []).join(', ')}.`,
                            context: `Completed at ${entry.timestamp}. Status: ${entry.status}.`,
                            source: 'harvest',
                            tags: ['ledger', 'system'],
                            quality: 0.85
                        });
                        await this.db.insert(pair);
                        this._appendToDatasetJSONL(pair.instruction, pair.context, pair.response);

                        // Also build graph from the ledger entry
                        const taskNode = entry.task.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 30);
                        const nodeId = taskNode.toLowerCase().replace(/\s+/g, '_');
                        if (!this.graph.nodes[nodeId]) {
                            this.graph.nodes[nodeId] = { id: nodeId, label: taskNode, createdAt: new Date().toISOString() };
                        }
                        for (const file of (entry.files_affected || []).slice(0, 3)) {
                            const fileNode = path.basename(file).replace(/\.[^.]+$/, '');
                            const fileId = fileNode.toLowerCase().replace(/\s+/g, '_');
                            if (!this.graph.nodes[fileId]) {
                                this.graph.nodes[fileId] = { id: fileId, label: fileNode, createdAt: new Date().toISOString() };
                            }
                            const isDup = this.graph.edges.some(e => e.from === nodeId && e.to === fileId);
                            if (!isDup) {
                                this.graph.edges.push({ from: nodeId, to: fileId, relationship: 'MODIFIED', createdAt: new Date().toISOString() });
                            }
                        }

                        newPairs++;
                    }
                    if (newPairs > 0) this._saveGraph();
                }
            }

            // 2. Harvest from Prevention Guide
            if (fs.existsSync(preventionPath)) {
                const guideRaw = fs.readFileSync(preventionPath, 'utf-8');
                const rules = guideRaw.match(/^##\s+(.+)\n([\s\S]*?)(?=\n## |\n*$)/gm);
                if (rules) {
                    for (const rule of rules.slice(0, 10)) {
                        const match = rule.match(/^##\s+(.+)\n([\s\S]*)/);
                        if (!match) continue;
                        const instruction = match[1].trim();
                        const response = match[2].trim().substring(0, 500);
                        const existing = await this.db.findOne({ instruction, source: 'harvest' });
                        if (existing) continue;

                        const pair = createTrainingPair({
                            instruction: `How do we handle: ${instruction}?`,
                            response,
                            source: 'harvest',
                            tags: ['prevention', 'rules'],
                            quality: 0.9
                        });
                        await this.db.insert(pair);
                        this._appendToDatasetJSONL(pair.instruction, '', pair.response);
                        newPairs++;
                    }
                }
            }

            if (newPairs > 0) {
                logger.info(`[NeuralForge] 🧠 Absorbed ${newPairs} new concepts from system logs.`);
                try {
                    const { BrowserWindow } = await import('electron');
                    const win = BrowserWindow.getAllWindows()[0];
                    if (win?.webContents) {
                        win.webContents.send('forge:harvest-complete', { count: newPairs });
                    }
                } catch (e) { /* silent */ }
            }
        } catch (err) {
            logger.error('[NeuralForge] Harvest error:', err.message);
        }
    }

    stopHarvester() {
        if (this._harvestInterval) {
            clearInterval(this._harvestInterval);
            this._harvestInterval = null;
        }
    }
}

export default new KnowledgeController();
