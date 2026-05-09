import { app } from 'electron';
import path from 'path';
import { connectSQLite, connectNoSQL } from '@nexus/database';
import logger from '@nexus/logger';

class KnowledgeService {
    constructor() {
        this.sqliteDb = null;
        this.knowledgeDb = null;
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;

        try {
            const userDataPath = app.getPath('userData');
            const dbDir = path.join(userDataPath, 'Nexus_Vault_DB');

            // 1. Relational SQL Database (System Data, Configurations)
            const sqlitePath = path.join(dbDir, 'nexus_core.sqlite');
            this.sqliteDb = connectSQLite(sqlitePath);

            // Initialize basic SQL tables
            this.sqliteDb.exec(`
                CREATE TABLE IF NOT EXISTS sys_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    level TEXT,
                    message TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // 2. Local NoSQL Database (Knowledge/Graph Memory)
            const nedbPath = path.join(dbDir, 'knowledge_graph.db');
            this.knowledgeDb = await connectNoSQL(nedbPath);

            // 3. Vault NoSQL Database (Encrypted Notes)
            const vaultPath = path.join(dbDir, 'secure_vault.db');
            this.vaultDb = await connectNoSQL(vaultPath);

            this.isInitialized = true;
            logger.info(`[KnowledgeService] Local DBs mounted at: ${dbDir}`);
        } catch (err) {
            logger.error('[KnowledgeService] Initialization Failed', err);
            throw err;
        }
    }

    // --- VAULT OPERATIONS (Encrypted) ---

    async saveVaultNote(event, { title, content, pin }) {
        try {
            if (!this.isInitialized) await this.init();

            // Derive a key from the PIN (In a real OS, we'd use PBKDF2)
            // For Phase 1, we'll use a standard encryption helper
            const encryptedContent = this._encrypt(content, pin);

            const doc = await this.vaultDb.insert({
                title,
                content: encryptedContent,
                createdAt: new Date().toISOString()
            });

            return { success: true, id: doc._id };
        } catch (err) {
            logger.error('[KnowledgeService] Vault Save Error:', err);
            return { success: false, error: err.message };
        }
    }

    async listVaultNotes(event, { pin }) {
        try {
            if (!this.isInitialized) await this.init();
            const docs = await this.vaultDb.find({});

            // Decrypt titles/previews if necessary, or just return them
            // We only decrypt the FULL content on demand
            return { success: true, data: docs.map(d => ({ id: d._id, title: d.title, createdAt: d.createdAt })) };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async getVaultNote(event, { id, pin }) {
        try {
            if (!this.isInitialized) await this.init();
            const doc = await this.vaultDb.findOne({ _id: id });
            if (!doc) throw new Error('Note not found');

            const decrypted = this._decrypt(doc.content, pin);
            return { success: true, title: doc.title, content: decrypted };
        } catch (err) {
            return { success: false, error: 'Decryption failed. Invalid PIN?' };
        }
    }

    async deleteVaultNote(event, { id }) {
        try {
            if (!this.isInitialized) await this.init();
            await this.vaultDb.remove({ _id: id });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // --- ENCRYPTION HELPERS ---
    _encrypt(text, password) {
        const crypto = require('crypto');
        const iv = crypto.randomBytes(16);
        const key = crypto.scryptSync(password, 'salt', 32);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    _decrypt(encryptedData, password) {
        const crypto = require('crypto');
        const [ivHex, data] = encryptedData.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const key = crypto.scryptSync(password, 'salt', 32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    // --- MEMORY OPERATIONS ---

}

export default new KnowledgeService();
