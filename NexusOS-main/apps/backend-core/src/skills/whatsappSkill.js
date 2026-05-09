import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import logger from '@nexus/logger';

/**
 * WhatsApp Bridge Skill
 * Replicates OpenClaw's wacli integration for sending messages and searching history.
 * Uses whatsapp-web.js for native Node.js automation.
 */
class WhatsappSkill {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: "nexus-os-session"
            }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        this.isReady = false;
        this._initializeClient();
    }

    _initializeClient() {
        this.client.on('qr', (qr) => {
            logger.info('[WhatsappSkill] 📱 Scan this QR code to link WhatsApp:');
            qrcode.generate(qr, { small: true });
        });

        this.client.on('ready', () => {
            this.isReady = true;
            logger.info('[WhatsappSkill] ✅ WhatsApp Client is READY.');
        });

        this.client.on('authenticated', () => {
            logger.info('[WhatsappSkill] 🔐 WhatsApp Authenticated.');
        });

        this.client.on('auth_failure', msg => {
            logger.error(`[WhatsappSkill] ❌ Auth failure: ${msg}`);
        });

        this.client.initialize().catch(err => {
            logger.error(`[WhatsappSkill] ❌ Initialization failed: ${err.message}`);
        });
    }

    async executeIntent(args) {
        if (!args || !args.action) {
            return { success: false, error: "No action provided to WhatsappSkill." };
        }

        const { action, to, message, limit = 10 } = args;

        if (!this.isReady && action !== 'status') {
            return {
                success: false,
                error: "WhatsApp is not yet linked. Please check system logs for the QR code and scan it with your phone."
            };
        }

        logger.info(`[WhatsappSkill] 📱 Executing WhatsApp Action: ${action} `);

        try {
            switch (action) {
                case 'send':
                    return await this._sendMessage(to, message);
                case 'list':
                    return await this._listChats(limit);
                case 'status':
                    return { success: true, payload: this.isReady ? "Connected" : "Not Linked" };
                default:
                    return { success: false, error: `Unsupported WhatsApp action: ${action}` };
            }
        } catch (err) {
            logger.error(`[WhatsappSkill] Execution failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    async _sendMessage(to, message) {
        if (!to || !message) return { success: false, error: "Missing 'to' or 'message' field." };

        // Format number if it's just a phone number
        let chatId = to;
        if (!to.includes('@')) {
            chatId = to.replace(/[^\d]/g, '') + '@c.us';
        }

        await this.client.sendMessage(chatId, message);
        return { success: true, payload: `Message sent to ${to} successfully.` };
    }

    async _listChats(limit) {
        const chats = await this.client.getChats();
        const simplified = chats.slice(0, limit).map(c => ({
            name: c.name,
            id: c.id._serialized,
            unreadCount: c.unreadCount,
            lastMessage: c.lastMessage ? c.lastMessage.body : ""
        }));

        return { success: true, payload: JSON.stringify(simplified, null, 2) };
    }
}

export default new WhatsappSkill();
