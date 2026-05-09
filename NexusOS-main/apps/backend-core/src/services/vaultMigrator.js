import fs from 'fs-extra';
import path from 'path';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import logger from '@nexus/logger';
import cryptographyService from './cryptographyService.js';

const MONGO_URI = 'mongodb://127.0.0.1:27017';
const DB_NAME = 'nexusos_vault';
const COLLECTION_NAME = 'EncryptedVault';

export async function runGreatVaultMigration() {
    logger.info('🛡️ [VaultMigrator] INITIATING GREAT VAULT MIGRATION (ZERO-TRUST PROTOCOL)');
    try {
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);

        // Ensure indices
        await collection.createIndex({ referenceId: 1 }, { unique: true });

        // Fallback or explicit resolution of the vault path
        const userDataPath = path.join(process.env.APPDATA, 'nexus-os');
        const VAULT_DB = path.join(userDataPath, 'Nexus_Vault_DB');

        const profilesDir = path.join(VAULT_DB, 'Profiles');
        const ragMemoryDir = path.join(VAULT_DB, 'RAG_Memory');

        let filesSecured = 0;

        // Traverse Profiles
        if (await fs.pathExists(profilesDir)) {
            const users = await fs.readdir(profilesDir);
            for (const user of users) {
                const userDir = path.join(profilesDir, user);
                const stat = await fs.stat(userDir);
                if (!stat.isDirectory()) continue;

                const profileFiles = ['Psycho_Analysis.md', 'Core_Facts.json', 'Vocabulary_Bank.json', 'Style_DNA.json'];
                for (const pf of profileFiles) {
                    const filePath = path.join(userDir, pf);
                    if (await fs.pathExists(filePath)) {
                        const content = await fs.readFile(filePath, 'utf-8');
                        if (content.startsWith('[SECURE_VAULT_REFERENCE]')) continue; // Already migrated

                        const referenceId = uuidv4();
                        const cipherText = cryptographyService.encrypt(content);

                        await collection.insertOne({
                            referenceId,
                            originalPath: filePath,
                            dataType: 'Profile',
                            encryptedContent: cipherText,
                            migratedAt: new Date()
                        });

                        await fs.writeFile(filePath, `[SECURE_VAULT_REFERENCE] ID: ${referenceId}\n\n// THIS FILE HAS BEEN PURGED BY NEXUSOS ZERO-TRUST PROTOCOL. DATA RESIDES IN ENCRYPTED MONGODB VAULT.`, 'utf-8');
                        logger.info(`🔒 [VaultMigrator] Encrypted & Scrubbed: ${filePath}`);
                        filesSecured++;
                    }
                }
            }
        }

        // Traverse RAG Memory
        if (await fs.pathExists(ragMemoryDir)) {
            const scanDir = async (dir) => {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await scanDir(fullPath);
                    } else if (entry.isFile() && entry.name.endsWith('.md')) {
                        const content = await fs.readFile(fullPath, 'utf-8');
                        if (content.startsWith('[SECURE_VAULT_REFERENCE]')) continue;

                        const referenceId = uuidv4();
                        const cipherText = cryptographyService.encrypt(content);

                        await collection.insertOne({
                            referenceId,
                            originalPath: fullPath,
                            dataType: 'Memory',
                            encryptedContent: cipherText,
                            migratedAt: new Date()
                        });

                        await fs.writeFile(fullPath, `[SECURE_VAULT_REFERENCE] ID: ${referenceId}\n\n// THIS FILE HAS BEEN PURGED BY NEXUSOS ZERO-TRUST PROTOCOL. DATA RESIDES IN ENCRYPTED MONGODB VAULT.`, 'utf-8');
                        logger.info(`🔒 [VaultMigrator] Encrypted & Scrubbed: ${fullPath}`);
                        filesSecured++;
                    }
                }
            };
            await scanDir(ragMemoryDir);
        }

        // Encrypt SQLite/DB files in the root Vault DB
        const dbFiles = ['nexus_core.sqlite', 'secure_vault.db', 'knowledge_graph.db'];
        for (const dbFile of dbFiles) {
            const fullPath = path.join(VAULT_DB, dbFile);
            if (await fs.pathExists(fullPath)) {
                // Read as base64 to avoid corrupting binary data
                const content = await fs.readFile(fullPath, 'base64');
                // Check if already scrubbed (a scrubbed file is tiny and starts with our tag, but since we base64 encoded it, let's decode a tiny bit)
                const textPrefix = Buffer.from(content.substring(0, 100), 'base64').toString('utf8');
                if (textPrefix.startsWith('[SECURE_VAULT_REFERENCE]')) continue;

                const referenceId = uuidv4();
                const cipherText = cryptographyService.encrypt(content);

                await collection.insertOne({
                    referenceId,
                    originalPath: fullPath,
                    dataType: 'SQLite_DB',
                    encryptedContent: cipherText,
                    migratedAt: new Date()
                });

                await fs.writeFile(fullPath, `[SECURE_VAULT_REFERENCE] ID: ${referenceId}\n\n// THIS FILE HAS BEEN PURGED BY NEXUSOS ZERO-TRUST PROTOCOL. DATA RESIDES IN ENCRYPTED MONGODB VAULT.`, 'utf-8');
                logger.info(`🔒 [VaultMigrator] Encrypted & Scrubbed Binary DB: ${fullPath}`);
                filesSecured++;
            }
        }

        await client.close();
        logger.info(`🛡️ [VaultMigrator] MIGRATION COMPLETE. Secured ${filesSecured} sensitive files in military-grade MongoDB Vault.`);
        return { success: true, filesSecured };
    } catch (error) {
        logger.error(`[VaultMigrator] 💥 FATAL MIGRATION ERROR: ${error.message}`);
        return { success: false, error: error.message };
    }
}
