import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import logger from '@nexus/logger';

/**
 * Discord Integration Skill
 * Replicates OpenClaw's discord skill for channel/user messaging and guild ops.
 * Zero-Trust Protocol: Bot Token must be loaded from DISCORD_TOKEN environment variable.
 */
class DiscordSkill {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.MessageContent
            ],
            partials: [Partials.Channel, Partials.Message]
        });

        this.isReady = false;
        this.token = process.env.DISCORD_TOKEN;

        if (this.token) {
            this._initializeClient();
        } else {
            logger.warn('[DiscordSkill] 🎮 DISCORD_TOKEN not found in environment. Discord skill will be unavailable.');
        }
    }

    _initializeClient() {
        this.client.once('ready', () => {
            this.isReady = true;
            logger.info(`[DiscordSkill] ✅ Discord Bot is ONLINE as ${this.client.user.tag}`);
        });

        this.client.login(this.token).catch(err => {
            logger.error(`[DiscordSkill] ❌ Login failed: ${err.message}`);
        });
    }

    async executeIntent(args) {
        if (!args || !args.action) {
            return { success: false, error: "No action provided to DiscordSkill." };
        }

        if (!this.token) {
            return {
                success: false,
                error: "Zero-Trust Error: DISCORD_TOKEN is not configured in the host environment."
            };
        }

        const { action, channelId, userId, message, limit = 10, emoji, messageId, threadName } = args;

        logger.info(`[DiscordSkill] 🎮 Executing Discord Action: ${action} `);

        try {
            switch (action) {
                case 'send':
                    return await this._sendMessage(channelId || userId, message);
                case 'read':
                    return await this._readMessages(channelId, limit);
                case 'react':
                    return await this._addReaction(channelId, messageId, emoji);
                case 'delete':
                    return await this._deleteMessage(channelId, messageId);
                case 'thread-create':
                    return await this._createThread(channelId, messageId, threadName);
                default:
                    return { success: false, error: `Unsupported Discord action: ${action}` };
            }
        } catch (err) {
            logger.error(`[DiscordSkill] Execution failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    async _sendMessage(targetId, content) {
        if (!targetId || !content) return { success: false, error: "Missing targetId or content." };

        const channel = await this.client.channels.fetch(targetId).catch(() => null);
        if (channel && channel.isTextBased()) {
            await channel.send(content);
            return { success: true, payload: `Message sent to channel ${targetId}.` };
        }

        const user = await this.client.users.fetch(targetId).catch(() => null);
        if (user) {
            await user.send(content);
            return { success: true, payload: `Direct message sent to user ${targetId}.` };
        }

        return { success: false, error: "Could not find target channel or user." };
    }

    async _readMessages(channelId, limit) {
        if (!channelId) return { success: false, error: "Missing channelId." };
        const channel = await this.client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) return { success: false, error: "Not a valid text channel." };

        const messages = await channel.messages.fetch({ limit });
        const history = messages.map(m => ({
            author: m.author.tag,
            content: m.content,
            timestamp: m.createdAt.toISOString()
        }));

        return { success: true, payload: JSON.stringify(history, null, 2) };
    }

    async _addReaction(channelId, messageId, emoji) {
        if (!channelId || !messageId || !emoji) return { success: false, error: "Missing required fields for reaction." };
        const channel = await this.client.channels.fetch(channelId);
        const msg = await channel.messages.fetch(messageId);
        await msg.react(emoji);
        return { success: true, payload: "Reaction added." };
    }

    async _deleteMessage(channelId, messageId) {
        if (!channelId || !messageId) return { success: false, error: "Missing channelId or messageId." };
        const channel = await this.client.channels.fetch(channelId);
        const msg = await channel.messages.fetch(messageId);
        await msg.delete();
        return { success: true, payload: "Message deleted." };
    }

    async _createThread(channelId, messageId, name) {
        if (!channelId || !messageId || !name) return { success: false, error: "Missing fields for thread creation." };
        const channel = await this.client.channels.fetch(channelId);
        if (!channel.threads) return { success: false, error: "Threads not supported in this channel." };
        const msg = await channel.messages.fetch(messageId);
        await msg.startThread({ name });
        return { success: true, payload: `Thread '${name}' created.` };
    }
}

export default new DiscordSkill();
