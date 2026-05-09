import { app } from 'electron';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import logger from '@nexus/logger';

// ─── Configuration ──────────────────────────────────────────────
const userDataPath = app.getPath('userData');
const VAULT_ROOT = path.join(userDataPath, 'Nexus_Vault_DB', 'RAG_Memory');
const FAISS_INDEX_PATH = path.join(VAULT_ROOT, '.faiss_index');
const MIN_CONTENT_LENGTH = 100;

let vectorStore = null;
let embeddings = null;
let hasLoggedVaultMissing = false;

// ─── Category Definitions ───────────────────────────────────────
const CATEGORIES = {
    Coding_Vault: { keywords: /\b(python|javascript|react|node|error|install|code|api|bug|css|html|linux|npm|docker|git|function|mongodb|sql|database|backend|frontend|algorithm|debug|deploy)\b/i },
    AI_Vault: { keywords: /\b(ai|artificial intelligence|machine learning|deep learning|neural|model|training|inference|llm|gpt|transformer|embedding|vector|rag|langchain|prompt)\b/i },
    Personal_Vault: { keywords: /\b(intimacy|relationship|romance|dating|marriage|love|emotion|mental health|therapy|psychology|wellness|meditation|anxiety|personal|private)\b/i },
    Research_Vault: { keywords: /\b(research|study|paper|journal|academic|theory|experiment|data|statistics|analysis|physics|biology|history)\b/i }
};

function determineCategory(text) {
    const scores = {};
    for (const [category, config] of Object.entries(CATEGORIES)) {
        const matches = text.match(config.keywords);
        scores[category] = matches ? matches.length : 0;
    }
    const bestCategory = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return (bestCategory && bestCategory[1] > 0) ? bestCategory[0] : 'General_Knowledge';
}

// ═══════════════════════════════════════════════════════════════════
// 🔤 LOCAL EMBEDDINGS ENGINE (LM Studio + Hash Fallback)
// ═══════════════════════════════════════════════════════════════════
class LocalEmbeddings extends Embeddings {
    constructor(config = {}) {
        super({});
        this.localUrl = config.localUrl || 'http://localhost:1234/v1/embeddings';
        this.dimensions = 1024; // text-embedding-bge-m3 defaults
        this.useFallback = false;
    }

    async embedDocuments(texts) {
        return Promise.all(texts.map(t => this.embedQuery(t)));
    }

    async embedQuery(text) {
        if (this.useFallback) return this._hashEmbed(text);

        try {
            const response = await fetch(this.localUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: text.substring(0, 512),
                    model: 'text-embedding-bge-m3'
                }),
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok) throw new Error(`Embedding API returned ${response.status}`);

            const data = await response.json();
            if (data?.data?.[0]?.embedding) {
                this.dimensions = data.data[0].embedding.length;
                return data.data[0].embedding;
            }
            throw new Error('No embedding in response');
        } catch (e) {
            if (!this.useFallback) {
                logger.warn(`⚠️ [VAULT] LM Studio embeddings unavailable (${e.message}). Using hash fallback.`);
                this.useFallback = true;
            }
            return this._hashEmbed(text);
        }
    }

    _hashEmbed(text) {
        const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
        const embedding = new Array(this.dimensions).fill(0);
        for (let i = 0; i < words.length; i++) {
            let hash = 5381;
            for (let k = 0; k < words[i].length; k++) hash = ((hash << 5) + hash) + words[i].charCodeAt(k);
            for (let j = 0; j < this.dimensions; j++) {
                embedding[j] += Math.sin(hash * (j + 1) * 0.01) * Math.cos(i * (j + 1) * 0.007);
            }
        }
        const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
        return norm > 0 ? embedding.map(v => v / norm) : embedding;
    }
}

function getEmbeddings(localUrl) {
    if (!embeddings) embeddings = new LocalEmbeddings({ localUrl });
    return embeddings;
}

// ═══════════════════════════════════════════════════════════════════
// 💾 MEMORY FILE WRITER & FAISS BUILDER
// ═══════════════════════════════════════════════════════════════════
export async function saveMemory(aiContent, userContent, topic = 'Untitled') {
    try {
        if (!aiContent || aiContent.length < MIN_CONTENT_LENGTH) return null;

        const cleanAiContent = aiContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        if (cleanAiContent.length < MIN_CONTENT_LENGTH) return null;

        const combinedText = `${topic} ${userContent} ${cleanAiContent}`;
        const category = determineCategory(combinedText);
        const categoryDir = path.join(VAULT_ROOT, category);

        await fs.ensureDir(categoryDir);

        const safeFilename = topic.replace(/[^a-z0-9]/gi, '_').substring(0, 20) || `Mem_${uuidv4().substring(0, 8)}`;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const filename = `${safeFilename}_${timestamp}.md`;
        const filepath = path.join(categoryDir, filename);

        const markdownContent = `# Topic: ${topic}\n**Date:** ${new Date().toLocaleString()}\n**Category:** ${category}\n**ID:** ${uuidv4().substring(0, 8)}\n\n---\n\n### 👤 User Context\n${userContent}\n\n---\n\n### 🧠 Agent Analysis\n${cleanAiContent}\n`;

        await fs.writeFile(filepath, markdownContent, 'utf-8');
        logger.info(`[VAULT] Saved memory to ${category}/${filename}.`);

        await addToIndex(cleanAiContent, { source: filepath, topic, category });
        return { filepath, category, filename };
    } catch (error) {
        logger.error(`[VAULT] Failed to save memory: ${error.message}`);
        return null;
    }
}

async function addToIndex(content, metadata = {}) {
    try {
        const doc = new Document({ pageContent: content, metadata });
        if (vectorStore) {
            await vectorStore.addDocuments([doc]);
        } else {
            vectorStore = await FaissStore.fromDocuments([doc], getEmbeddings());
        }
        await fs.ensureDir(FAISS_INDEX_PATH);
        await vectorStore.save(FAISS_INDEX_PATH);
    } catch (error) {
        logger.error(`[VAULT] Failed to update FAISS index: ${error.message}`);
    }
}

export async function buildIndex() {
    try {
        await fs.ensureDir(VAULT_ROOT);
        const documents = [];

        const scanDir = async (dir) => {
            if (!fs.existsSync(dir)) return;
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    await scanDir(fullPath);
                } else if (entry.isFile() && entry.name.endsWith('.md')) {
                    const content = await fs.readFile(fullPath, 'utf-8');
                    const category = path.basename(path.dirname(fullPath));
                    const chunks = content.split(/\n\s*\n/).filter(c => c.trim().length > 50);
                    chunks.forEach(chunk => documents.push(new Document({
                        pageContent: chunk.trim(),
                        metadata: { source: fullPath, category }
                    })));
                }
            }
        };

        await scanDir(VAULT_ROOT);

        if (documents.length > 0) {
            logger.info(`[VAULT] Rebuilding FAISS with ${documents.length} chunks...`);
            vectorStore = await FaissStore.fromDocuments(documents, getEmbeddings());
            await fs.ensureDir(FAISS_INDEX_PATH);
            await vectorStore.save(FAISS_INDEX_PATH);
            return documents.length;
        }
        return 0;
    } catch (error) {
        logger.error(`[VAULT] Index build failed: ${error.message}`);
        return 0;
    }
}

// ═══════════════════════════════════════════════════════════════════
// 🔍 CONTEXT RETRIEVAL (Vector Search)
// ═══════════════════════════════════════════════════════════════════
export async function retrieveContext(query, topK = 3) {
    try {
        if (!vectorStore) {
            const indexExists = await fs.pathExists(path.join(FAISS_INDEX_PATH, 'faiss.index'));
            if (!indexExists) return { text: '', sources: [] };
            vectorStore = await FaissStore.load(FAISS_INDEX_PATH, getEmbeddings());
        }

        const results = await vectorStore.similaritySearchWithScore(query, topK);
        // Stricter L2 threshold
        const filtered = results.filter(([doc, score]) => score < 0.65);

        if (filtered.length === 0) return { text: '', sources: [] };

        const formatted = filtered.map(([doc, score], i) => {
            const cat = doc.metadata?.category || 'Unknown';
            return `[Memory ${i + 1} | ${cat} | Score: ${score.toFixed(2)}]:\n${doc.pageContent.substring(0, 800)}`;
        }).join('\n\n---\n\n');

        return { text: formatted, sources: filtered.map(([doc]) => doc.metadata?.source).filter(Boolean), hasStrongMatch: true };
    } catch (error) {
        logger.error(`[VAULT] Retrieval failed: ${error.message}`);
        return { text: '', sources: [] };
    }
}
