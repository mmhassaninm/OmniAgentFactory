const dbConnection = require('../database/dbConnection');

class KnowledgeManager {
    constructor() { }

    // Save new context to NoSQL Memory
    async saveMemory(payload) {
        try {
            const graph = dbConnection.getGraph();
            const doc = await graph.insert({
                topic: payload.topic,
                text: payload.text,
                embeddings_ref: payload.embeddings_ref || null,
                language: payload.language || 'en' // Phase 23 Compatibility
            });
            console.log(`[KnowledgeManager] Memory Indexed: ${doc._id}`);
            return { success: true, doc };
        } catch (err) {
            console.error('[KnowledgeManager] Save Error:', err);
            return { success: false, error: err.message };
        }
    }

    // Retrieve memories by topic
    async searchMemory(topic) {
        try {
            const graph = dbConnection.getGraph();
            // Simple regex search (local equivalent to a basic text index)
            const docs = await graph.find({ topic: { $regex: new RegExp(topic, 'i') } });
            return { success: true, count: docs.length, data: docs };
        } catch (err) {
            console.error('[KnowledgeManager] Search Error:', err);
            return { success: false, error: err.message };
        }
    }

    // System Logging to SQL
    async logEvent(level, message) {
        try {
            const sql = dbConnection.getSql();
            const stmt = sql.prepare('INSERT INTO sys_logs (level, message) VALUES (?, ?)');
            stmt.run(level, message);
            return { success: true };
        } catch (err) {
            console.error('[KnowledgeManager] SQL Log Error:', err);
            return { success: false, error: err.message };
        }
    }
}

module.exports = new KnowledgeManager();
