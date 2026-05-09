import crypto from 'crypto';
import logger from '@nexus/logger';

const ALGORITHM = 'aes-256-gcm';

class CryptographyService {
    constructor() {
        this.masterKey = this._initMasterKey();
    }

    _initMasterKey() {
        const envKey = process.env.VAULT_MASTER_KEY;
        if (envKey && envKey.length === 64) {
            return Buffer.from(envKey, 'hex');
        }

        logger.warn('[CryptographyService] VAULT_MASTER_KEY missing or invalid in environment. System should halt, but falling back to runtime generation for emergency recovery.');
        // In a real strict environment, we'd throw. For now, we return a temp key to prevent crash if env is missing during boot.
        return crypto.randomBytes(32);
    }

    encrypt(text) {
        if (!text) return null;
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const authTag = cipher.getAuthTag().toString('hex');

            // Format: iv:authTag:encryptedData
            return `${iv.toString('hex')}:${authTag}:${encrypted}`;
        } catch (error) {
            logger.error(`[CryptographyService] Encryption Failed: ${error.message}`);
            throw new Error('Encryption Failure');
        }
    }

    decrypt(encryptedString) {
        if (!encryptedString) return null;
        try {
            const parts = encryptedString.split(':');
            if (parts.length !== 3) throw new Error('Invalid encrypted payload format');

            const iv = Buffer.from(parts[0], 'hex');
            const authTag = Buffer.from(parts[1], 'hex');
            const encryptedData = parts[2];

            const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            logger.error(`[CryptographyService] Decryption Failed: ${error.message}`);
            throw new Error('Decryption Failure');
        }
    }
}

export default new CryptographyService();
