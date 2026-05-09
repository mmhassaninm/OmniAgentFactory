import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import logger from '@nexus/logger';

const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const KEY_FILE_NAME = '.nexus_vault_key';

class DatabaseEncryption {
    constructor() {
        this.key = null;
        this.isInitialized = false;
    }

    _getKeyFilePath() {
        // Store the key in the user's home directory to keep it somewhat secure and persistent
        // across app reinstalls, but isolated per user account.
        return path.join(os.homedir(), KEY_FILE_NAME);
    }

    init() {
        if (this.isInitialized) return;

        const keyPath = this._getKeyFilePath();
        try {
            if (fs.existsSync(keyPath)) {
                const keyHex = fs.readFileSync(keyPath, 'utf8').trim();
                this.key = Buffer.from(keyHex, 'hex');
                if (this.key.length !== KEY_LENGTH) {
                    throw new Error('Invalid key length in key file.');
                }
            } else {
                // Generate a new secure key
                logger.info('[DatabaseEncryption] Generating new master encryption key...');
                this.key = crypto.randomBytes(KEY_LENGTH);
                fs.writeFileSync(keyPath, this.key.toString('hex'), { mode: 0o600 });
            }
            this.isInitialized = true;
            logger.info('[DatabaseEncryption] Core encryption module initialized successfully.');
        } catch (error) {
            logger.error(`[DatabaseEncryption] Failed to initialize encryption: ${error.message}`);
            // Fallback to a session-only key if file write fails, but warn heavily
            this.key = crypto.randomBytes(KEY_LENGTH);
            this.isInitialized = true;
        }
    }

    /**
     * Encrypts a string or deeply nested object (by stringifying it first)
     * @param {string|object} data The data to encrypt
     * @returns {string} The encrypted data formatted as 'iv:encrypted_data'
     */
    encrypt(data) {
        if (!this.isInitialized) this.init();
        if (data == null) return data;

        try {
            const textToEncrypt = typeof data === 'object' ? JSON.stringify(data) : String(data);
            const iv = crypto.randomBytes(IV_LENGTH);
            const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(this.key), iv);
            let encrypted = cipher.update(textToEncrypt);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            return iv.toString('hex') + ':' + encrypted.toString('hex');
        } catch (error) {
            logger.error(`[DatabaseEncryption] Encryption failed: ${error.message}`);
            return data; // Return unencrypted as fallback? Or throw? Better to throw in a strict system.
        }
    }

    /**
     * Decrypts an encrypted string
     * @param {string} encryptedData The encrypted data formatted as 'iv:encrypted_data'
     * @param {boolean} parseJson If true, attempts to parse the decrypted string as JSON
     * @returns {string|object} The decrypted data
     */
    decrypt(encryptedData, parseJson = false) {
        if (!this.isInitialized) this.init();
        if (!encryptedData || typeof encryptedData !== 'string' || !encryptedData.includes(':')) {
            return encryptedData; // Not encrypted by us, return as is
        }

        try {
            const textParts = encryptedData.split(':');
            const iv = Buffer.from(textParts.shift(), 'hex');
            const encryptedText = Buffer.from(textParts.join(':'), 'hex');

            if (iv.length !== IV_LENGTH) {
                return encryptedData; // Invalid format
            }

            const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(this.key), iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            const decryptedString = decrypted.toString();

            if (parseJson) {
                try {
                    return JSON.parse(decryptedString);
                } catch (e) {
                    return decryptedString;
                }
            }
            return decryptedString;
        } catch (error) {
            logger.error(`[DatabaseEncryption] Decryption failed: ${error.message}`);
            return encryptedData; // Return original on failure
        }
    }

    // Helper for NeDB hooks: Recursively encrypt all string values in a document
    encryptDocument(doc) {
        if (!doc) return doc;
        if (Array.isArray(doc)) return doc.map(item => this.encryptDocument(item));
        if (typeof doc === 'object' && doc !== null) {
            const encryptedDoc = {};
            for (const key in doc) {
                if (key === '_id') {
                    encryptedDoc[key] = doc[key]; // Never encrypt IDs
                } else if (typeof doc[key] === 'string') {
                    // Only encrypt strings to maintain NeDB queryability on boolean/number structures
                    // If deep object, recurse
                    encryptedDoc[key] = this.encrypt(doc[key]);
                } else if (typeof doc[key] === 'object') {
                    encryptedDoc[key] = this.encryptDocument(doc[key]);
                } else {
                    encryptedDoc[key] = doc[key];
                }
            }
            return encryptedDoc;
        }
        return doc;
    }

    // Helper for NeDB hooks: Recursively decrypt all strings in a document
    decryptDocument(doc) {
        if (!doc) return doc;
        if (Array.isArray(doc)) return doc.map(item => this.decryptDocument(item));
        if (typeof doc === 'object' && doc !== null) {
            const decryptedDoc = {};
            for (const key in doc) {
                if (typeof doc[key] === 'string' && doc[key].includes(':')) {
                    decryptedDoc[key] = this.decrypt(doc[key]);
                } else if (typeof doc[key] === 'object') {
                    decryptedDoc[key] = this.decryptDocument(doc[key]);
                } else {
                    decryptedDoc[key] = doc[key];
                }
            }
            return decryptedDoc;
        }
        return doc;
    }
}

export default new DatabaseEncryption();
