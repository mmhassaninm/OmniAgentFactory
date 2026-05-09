/**
 * ============================================================
 *  📋 EventLogger: Global System Event Persistence Layer
 * ============================================================
 *  Connects to MongoDB `NexusOS.system_events` to provide
 *  persistent, queryable storage for all system crashes,
 *  healing events, and operational telemetry.
 *
 *  Used by SentinelService for historical RAG context.
 * ============================================================
 */

import { MongoClient, ObjectId } from 'mongodb';
import logger from '@nexus/logger';

// ── MongoDB Config ──────────────────────────────────────────
const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'NexusOS';
const COLLECTION = 'system_events';

class EventLogger {
    constructor() {
        /** @type {import('mongodb').MongoClient|null} */
        this._client = null;
        /** @type {import('mongodb').Collection|null} */
        this._col = null;
        this._connected = false;
    }

    // ═══════════════════════════════════════════════════════════
    //  INITIALIZATION
    // ═══════════════════════════════════════════════════════════

    async init() {
        if (this._connected) return;
        try {
            this._client = new MongoClient(MONGO_URI);
            await this._client.connect();
            const db = this._client.db(DB_NAME);
            this._col = db.collection(COLLECTION);

            // Create indexes for efficient queries
            await this._col.createIndex({ timestamp: -1 });
            await this._col.createIndex({ source: 1, status: 1 });
            await this._col.createIndex({ level: 1, timestamp: -1 });
            // Text index for similarity search
            await this._col.createIndex({ message: 'text', stackTrace: 'text' });

            this._connected = true;
            logger.info(`[EventLogger] 📋 Connected → ${MONGO_URI}/${DB_NAME}.${COLLECTION}`);
        } catch (err) {
            logger.error(`[EventLogger] Init failed: ${err.message}`);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  WRITE OPERATIONS
    // ═══════════════════════════════════════════════════════════

    /**
     * Log a new system event.
     * @param {object} event
     * @param {'frontend'|'backend'|'daemon'|'sentinel'} event.source
     * @param {'error'|'warning'|'info'|'healing'} event.level
     * @param {string} event.message
     * @param {string} [event.stackTrace]
     * @param {string} [event.filePath]
     * @param {number} [event.line]
     * @param {object} [event.metadata]
     * @returns {Promise<string|null>} Inserted event ID
     */
    async logEvent({ source, level, message, stackTrace, filePath, line, metadata }) {
        if (!this._col) {
            logger.warn('[EventLogger] Not connected — event dropped.');
            return null;
        }
        try {
            const doc = {
                source: source || 'unknown',
                level: level || 'error',
                message: message || '',
                stackTrace: stackTrace || '',
                filePath: filePath || '',
                line: line || 0,
                metadata: metadata || {},
                status: 'pending',       // pending → healing → resolved / failed
                rca: null,               // AI Root Cause Analysis
                patchApplied: null,      // The exact patch object
                healAttempts: 0,
                timestamp: new Date().toISOString(),
                resolvedAt: null
            };
            const result = await this._col.insertOne(doc);
            logger.info(`[EventLogger] Event logged: [${level}] ${message.slice(0, 80)}`);
            return result.insertedId.toString();
        } catch (err) {
            logger.error(`[EventLogger] logEvent failed: ${err.message}`);
            return null;
        }
    }

    /**
     * Update an existing event (e.g., after healing attempt).
     * @param {string} eventId - MongoDB ObjectId string
     * @param {object} updates - Fields to $set
     */
    async updateEvent(eventId, updates) {
        if (!this._col) return;
        try {
            await this._col.updateOne(
                { _id: new ObjectId(eventId) },
                {
                    $set: {
                        ...updates,
                        updatedAt: new Date().toISOString()
                    },
                    $inc: { healAttempts: updates.status === 'healing' ? 1 : 0 }
                }
            );
        } catch (err) {
            logger.error(`[EventLogger] updateEvent failed: ${err.message}`);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  READ OPERATIONS
    // ═══════════════════════════════════════════════════════════

    /**
     * Get events with optional filtering.
     * @param {object} filter - { status?, source?, level?, limit? }
     * @returns {Promise<Array>}
     */
    async getEvents(filter = {}) {
        if (!this._col) return [];
        try {
            const query = {};
            if (filter.status) query.status = filter.status;
            if (filter.source) query.source = filter.source;
            if (filter.level) query.level = filter.level;

            return await this._col
                .find(query)
                .sort({ timestamp: -1 })
                .limit(filter.limit || 100)
                .toArray();
        } catch (err) {
            logger.error(`[EventLogger] getEvents failed: ${err.message}`);
            return [];
        }
    }

    /**
     * Get a single event by ID.
     * @param {string} eventId
     */
    async getEvent(eventId) {
        if (!this._col) return null;
        try {
            return await this._col.findOne({ _id: new ObjectId(eventId) });
        } catch (err) {
            logger.error(`[EventLogger] getEvent failed: ${err.message}`);
            return null;
        }
    }

    /**
     * Find similar past errors using text search (for RAG context).
     * @param {string} errorMessage
     * @param {number} limit
     * @returns {Promise<Array>}
     */
    async findSimilar(errorMessage, limit = 5) {
        if (!this._col || !errorMessage) return [];
        try {
            // Extract key terms (first 100 chars, stripped of noise)
            const keywords = errorMessage
                .replace(/[^a-zA-Z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 3)
                .slice(0, 8)
                .join(' ');

            if (!keywords.trim()) return [];

            return await this._col
                .find(
                    { $text: { $search: keywords } },
                    { score: { $meta: 'textScore' } }
                )
                .sort({ score: { $meta: 'textScore' } })
                .limit(limit)
                .toArray();
        } catch (err) {
            // Text search may fail if no text index — fallback to regex
            try {
                const escaped = errorMessage.slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                return await this._col
                    .find({ message: { $regex: escaped, $options: 'i' } })
                    .sort({ timestamp: -1 })
                    .limit(limit)
                    .toArray();
            } catch {
                return [];
            }
        }
    }

    /**
     * Get aggregate stats for the Event Viewer dashboard.
     */
    async getStats() {
        if (!this._col) return { total: 0, pending: 0, healing: 0, resolved: 0, failed: 0 };
        try {
            const pipeline = [
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ];
            const results = await this._col.aggregate(pipeline).toArray();
            const stats = { total: 0, pending: 0, healing: 0, resolved: 0, failed: 0 };
            results.forEach(r => {
                stats[r._id] = r.count;
                stats.total += r.count;
            });
            return stats;
        } catch (err) {
            logger.error(`[EventLogger] getStats failed: ${err.message}`);
            return { total: 0, pending: 0, healing: 0, resolved: 0, failed: 0 };
        }
    }
}

export default new EventLogger();
