// ═══════════════════════════════════════════════════════════════
//  📂 NEXUS KNOWLEDGE BASE — File Ingestion & Retrieval Engine
//  Handles 100-200MB+ TXT files using IndexedDB + TF-IDF search.
//  Adapted from Vibelab's knowledgeManager.js (FAISS → TF-IDF)
// ═══════════════════════════════════════════════════════════════

const DB_NAME = 'NexusKnowledgeBase';
const DB_VERSION = 1;
const STORE_CHUNKS = 'chunks';
const STORE_META = 'metadata';

const CHUNK_SIZE = 2000;       // ~2KB per chunk
const CHUNK_OVERLAP = 200;     // 200 char overlap for context continuity

// ─── IndexedDB Manager ──────────────────────────────────────
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
                const store = db.createObjectStore(STORE_CHUNKS, { keyPath: 'id', autoIncrement: true });
                store.createIndex('fileId', 'fileId', { unique: false });
                store.createIndex('terms', 'terms', { unique: false, multiEntry: true });
            }
            if (!db.objectStoreNames.contains(STORE_META)) {
                db.createObjectStore(STORE_META, { keyPath: 'fileId' });
            }
        };
    });
}

// ─── Text Chunking Engine ──────────────────────────────────
async function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
    const chunks = [];
    let start = 0;
    let iterations = 0;
    while (start < text.length) {
        if (++iterations % 10 === 0) {
            // Yield to main thread
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        let end = Math.min(start + chunkSize, text.length);

        // Try to break at a sentence boundary
        if (end < text.length) {
            const lastPeriod = text.lastIndexOf('.', end);
            const lastNewline = text.lastIndexOf('\n', end);
            const breakPoint = Math.max(lastPeriod, lastNewline);
            if (breakPoint > start + chunkSize / 2) end = breakPoint + 1;
        }

        chunks.push(text.substring(start, end).trim());
        start = end - overlap;
        if (start >= text.length) break;
    }
    return chunks.filter(c => c.length > 50); // Skip tiny fragments
}

// ─── TF-IDF Tokenizer ──────────────────────────────────────
// Arabic + English stop words
const STOP_WORDS = new Set([
    // English
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
    'should', 'may', 'might', 'must', 'can', 'could', 'of', 'in', 'to',
    'for', 'with', 'on', 'at', 'from', 'by', 'as', 'into', 'through',
    'and', 'but', 'or', 'not', 'no', 'so', 'if', 'then', 'than', 'that',
    'this', 'it', 'its', 'my', 'your', 'his', 'her', 'our', 'their',
    // Arabic
    'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'التي',
    'الذي', 'هو', 'هي', 'أن', 'لا', 'ما', 'كان', 'قد', 'لم', 'بين',
    'عند', 'بعد', 'قبل', 'كل', 'بعض', 'غير', 'أو', 'ثم', 'حتى',
    // Egyptian Arabic
    'ده', 'دي', 'دول', 'مش', 'عشان', 'يعني', 'كده', 'بقى', 'اللي',
    'انا', 'انت', 'هو', 'هي', 'احنا', 'همه', 'فين', 'ازاي', 'ليه',
]);

function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\u0600-\u06FF\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

// ─── TF-IDF Search ──────────────────────────────────────────
function computeTFIDF(queryTokens, chunkTokens) {
    if (queryTokens.length === 0 || chunkTokens.length === 0) return 0;

    let score = 0;
    const chunkLen = chunkTokens.length;
    const tokenFreq = {};
    for (const t of chunkTokens) tokenFreq[t] = (tokenFreq[t] || 0) + 1;

    for (const qt of queryTokens) {
        const tf = (tokenFreq[qt] || 0) / chunkLen;
        if (tf > 0) score += tf;
    }
    return score;
}

// ═══════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════

/**
 * Ingest a text file into the knowledge base.
 * @param {string} fileName - Name of the file
 * @param {string} content - Full text content
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<{chunks: number, fileId: string}>}
 */
export async function ingestFile(fileName, content, onProgress = () => { }) {
    const db = await openDB();
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    console.log(`[KnowledgeBase] 📂 Ingesting "${fileName}" (${(content.length / 1024 / 1024).toFixed(1)} MB)...`);

    // Chunk the text
    const chunks = await chunkText(content);
    console.log(`[KnowledgeBase] Split into ${chunks.length} chunks`);

    // Store chunks in IndexedDB in batches
    const BATCH_SIZE = 100;
    let iterations = 0;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        // Yield to the event loop so the browser doesn't freeze during heavy ingestion
        await new Promise(resolve => setTimeout(resolve, 5));

        const batch = chunks.slice(i, i + BATCH_SIZE);
        const tx = db.transaction(STORE_CHUNKS, 'readwrite');
        const store = tx.objectStore(STORE_CHUNKS);

        for (const chunk of batch) {
            // Very short yield per chunk to ensure regex processing doesn't stack up and block
            if (iterations++ % 5 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            const terms = tokenize(chunk);
            store.add({
                fileId,
                content: chunk,
                terms: [...new Set(terms)].slice(0, 50), // Store unique terms for indexing
                tokenCount: terms.length,
            });
        }

        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });

        onProgress(Math.min(100, Math.round(((i + batch.length) / chunks.length) * 100)));
    }

    // Store metadata
    const metaTx = db.transaction(STORE_META, 'readwrite');
    metaTx.objectStore(STORE_META).put({
        fileId,
        fileName,
        chunkCount: chunks.length,
        originalSize: content.length,
        ingestedAt: new Date().toISOString(),
    });

    await new Promise((resolve, reject) => {
        metaTx.oncomplete = resolve;
        metaTx.onerror = () => reject(metaTx.error);
    });

    console.log(`[KnowledgeBase] ✅ Ingested "${fileName}": ${chunks.length} chunks`);
    return { chunks: chunks.length, fileId };
}

/**
 * Search the knowledge base for relevant chunks.
 * @param {string} query - Search query
 * @param {number} topK - Number of top results to return
 * @returns {Promise<Array<{content: string, score: number, fileId: string}>>}
 */
export async function searchKnowledge(query, topK = 3) {
    const db = await openDB();
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    // Get all chunks (for small-medium datasets, linear scan is fine)
    const tx = db.transaction(STORE_CHUNKS, 'readonly');
    const store = tx.objectStore(STORE_CHUNKS);
    const allChunks = await new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    if (allChunks.length === 0) return [];

    // Score all chunks using TF-IDF
    const scored = allChunks.map(chunk => ({
        content: chunk.content,
        fileId: chunk.fileId,
        score: computeTFIDF(queryTokens, tokenize(chunk.content)),
    })).filter(c => c.score > 0);

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK);
}

/**
 * Get list of all ingested files.
 * @returns {Promise<Array<{fileId, fileName, chunkCount, originalSize, ingestedAt}>>}
 */
export async function listFiles() {
    const db = await openDB();
    const tx = db.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);
    return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Delete a file and all its chunks from the knowledge base.
 * @param {string} fileId - The file's ID
 */
export async function deleteFile(fileId) {
    const db = await openDB();

    // Delete metadata
    const metaTx = db.transaction(STORE_META, 'readwrite');
    metaTx.objectStore(STORE_META).delete(fileId);
    await new Promise(r => { metaTx.oncomplete = r; });

    // Delete chunks by fileId index
    const tx = db.transaction(STORE_CHUNKS, 'readwrite');
    const store = tx.objectStore(STORE_CHUNKS);
    const index = store.index('fileId');
    const req = index.openCursor(IDBKeyRange.only(fileId));

    await new Promise((resolve, reject) => {
        req.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            } else {
                resolve();
            }
        };
        req.onerror = () => reject(req.error);
    });
}

/**
 * Get total stats for the knowledge base.
 * @returns {Promise<{totalFiles: number, totalChunks: number, totalSize: number}>}
 */
export async function getStats() {
    const files = await listFiles();
    return {
        totalFiles: files.length,
        totalChunks: files.reduce((sum, f) => sum + f.chunkCount, 0),
        totalSize: files.reduce((sum, f) => sum + f.originalSize, 0),
    };
}

/**
 * Clear the entire knowledge base.
 */
export async function clearKnowledgeBase() {
    const db = await openDB();
    const tx1 = db.transaction(STORE_CHUNKS, 'readwrite');
    tx1.objectStore(STORE_CHUNKS).clear();
    await new Promise(r => { tx1.oncomplete = r; });

    const tx2 = db.transaction(STORE_META, 'readwrite');
    tx2.objectStore(STORE_META).clear();
    await new Promise(r => { tx2.oncomplete = r; });
}
