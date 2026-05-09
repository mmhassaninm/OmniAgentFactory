const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const Database = require('better-sqlite3');
const Datastore = require('nedb-promises');

class DBConnection {
    constructor() {
        this.sqliteDb = null;
        this.knowledgeDb = null;
        this.isInitialized = false;
    }

    init() {
        try {
            // Define a secure storage path strictly inside the User's AppData to avoid permission issues
            const userDataPath = app.getPath('userData');
            const dbDir = path.join(userDataPath, 'Nexus_Vault_DB');

            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            // 1. Relational SQL Database (System Data, Configurations)
            const sqlitePath = path.join(dbDir, 'nexus_core.sqlite');
            this.sqliteDb = new Database(sqlitePath, { verbose: console.log });

            // Initialize basic SQL tables (Schema)
            this.sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS sys_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          level TEXT,
          message TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

            // 2. Local NoSQL Database (MongoDB equivalent for Knowledge/Graph Memory)
            const nedbPath = path.join(dbDir, 'knowledge_graph.db');
            this.knowledgeDb = Datastore.create({
                filename: nedbPath,
                autoload: true,
                timestampData: true
            });

            this.isInitialized = true;
            console.log(`[DB] Nexus DB Vault Mounted: ${dbDir}`);
        } catch (err) {
            console.error('[DB] Failed to initialize Nexus databases:', err);
        }
    }

    getSql() {
        if (!this.isInitialized) this.init();
        return this.sqliteDb;
    }

    getGraph() {
        if (!this.isInitialized) this.init();
        return this.knowledgeDb;
    }

    close() {
        // Phase 28: Step 7 - Database Connection Lifecycle Teardown
        try {
            if (this.sqliteDb) {
                this.sqliteDb.close();
                console.log('[DB] SQLite connection closed.');
            }
            this.isInitialized = false;
        } catch (err) {
            console.error('[DB] Error closing SQLite connection:', err);
        }
    }
}

module.exports = new DBConnection();
