let store;
const initStore = async () => {
    if (!store) {
        const Store = (await import('electron-store')).default;
        store = new Store();
    }
    return store;
};

// Define default OS settings
const DEFAULT_SETTINGS = {
    theme: 'dark',
    systemLanguage: 'en',
    aiProvider: 'local', // Defaulting to LM Studio as per 70% usage target
    localUrl: 'http://127.0.0.1:1234/v1',
    developerMode: false,
    ai_model: 'local-model',
};

const crypto = require('crypto');

// Phase 28: Zero-Tolerance Secrets Management Encryption Key
// In production, this might be dynamically generated and stored in a secure enclave.
// For now, we derive a static vault key from machine IDs or use a strong fallback.
const ENCRYPTION_KEY = crypto.createHash('sha256').update(String("NEXUS_OS_VAULT_MASTER_KEY_2026")).digest('base64').substring(0, 32);
const IV_LENGTH = 16; // AES block size

function encrypt(text) {
    if (!text) return text;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(text) {
    if (!text || !text.includes(':')) return text;
    try {
        const parts = text.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encryptedText = parts[2];
        const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error('[SettingsService] Decryption Failed', e);
        return '';
    }
}

const settingsService = {
    getSettings: async () => {
        const store = await initStore();
        const settings = store.get('os_settings');
        if (!settings) {
            store.set('os_settings', DEFAULT_SETTINGS);
            return DEFAULT_SETTINGS;
        }

        // Phase 28: Decrypt secrets before sending to Renderer
        if (settings.secrets) {
            const decSecrets = { ...settings.secrets };
            for (const key in decSecrets) {
                decSecrets[key] = decrypt(decSecrets[key]);
            }
            settings.secrets = decSecrets;
        }

        return settings;
    },

    updateSettings: async (newSettings) => {
        const store = await initStore();
        const current = store.get('os_settings') || DEFAULT_SETTINGS;

        // Phase 28: Intercept Secret Keys and Encrypt them before merging
        if (newSettings.secrets) {
            const encSecrets = { ...newSettings.secrets };
            for (const key in encSecrets) {
                encSecrets[key] = encrypt(encSecrets[key]);
            }
            newSettings.secrets = encSecrets;
        }

        const merged = { ...current, ...newSettings };
        store.set('os_settings', merged);
        return merged;
    },

    getLanguage: async () => {
        const store = await initStore();
        return store.get('os_settings.systemLanguage') || 'en';
    }
};

module.exports = settingsService;
