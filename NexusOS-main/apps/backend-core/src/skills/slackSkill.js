import { WebClient } from '@slack/web-api';
import logger from '@nexus/logger';

/**
 * Slack Integration Skill
 * Replicates OpenClaw's slack skill for channel/user messaging and workspace ops.
 * Zero-Trust Protocol: Bot Token must be loaded from SLACK_TOKEN environment variable. 
 */
class SlackSkill {
    constructor() {
        this.token = process.env.SLACK_TOKEN;
        if (this.token) {
            this.client = new WebClient(this.token);
            logger.info('[SlackSkill] ✅ Slack WebClient Initialized.');
        } else {
            logger.warn('[SlackSkill] 💬 SLACK_TOKEN not found in environment. Slack skill will be unavailable.');
        }
    }

    async executeIntent(args) {
        if (!args || !args.action) {
            return { success: false, error: "No action provided to SlackSkill." };
        }

        if (!this.token) {
            return {
                success: false,
                error: "Zero-Trust Error: SLACK_TOKEN is not configured in the host environment."
            };
        }

        const {
            action, channelId, to, content, messageId, emoji, limit = 10, userId
        } = args;

        logger.info(`[SlackSkill] 💬 Executing Slack Action: ${action} `);

        try {
            switch (action) {
                case 'sendMessage':
                    return await this._sendMessage(to || channelId, content);
                case 'readMessages':
                    return await this._readMessages(channelId, limit);
                case 'react':
                    return await this._addReaction(channelId, messageId, emoji);
                case 'editMessage':
                    return await this._editMessage(channelId, messageId, content);
                case 'deleteMessage':
                    return await this._deleteMessage(channelId, messageId);
                case 'pinMessage':
                    return await this._pinMessage(channelId, messageId);
                case 'listPins':
                    return await this._listPins(channelId);
                case 'memberInfo':
                    return await this._memberInfo(userId);
                case 'emojiList':
                    return await this._emojiList();
                default:
                    return { success: false, error: `Unsupported Slack action: ${action}` };
            }
        } catch (err) {
            logger.error(`[SlackSkill] Execution failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    async _sendMessage(targetId, text) {
        if (!targetId || !text) return { success: false, error: "Missing targetId or content." };

        // Handle "channel:ID" or "user:ID" format if provided, else assume ID
        const cleanId = targetId.includes(':') ? targetId.split(':')[1] : targetId;

        await this.client.chat.postMessage({
            channel: cleanId,
            text: text
        });

        return { success: true, payload: `Message sent to ${cleanId}.` };
    }

    async _readMessages(channelId, limit) {
        if (!channelId) return { success: false, error: "Missing channelId." };
        const result = await this.client.conversations.history({
            channel: channelId,
            limit: limit
        });

        const history = result.messages.map(m => ({
            user: m.user,
            text: m.text,
            ts: m.ts
        }));

        return { success: true, payload: JSON.stringify(history, null, 2) };
    }

    async _addReaction(channelId, timestamp, name) {
        if (!channelId || !timestamp || !name) return { success: false, error: "Missing fields for reaction." };
        await this.client.reactions.add({
            channel: channelId,
            timestamp: timestamp,
            name: name.replace(/:/g, '') // Remove colons if provided
        });
        return { success: true, payload: "Reaction added." };
    }

    async _editMessage(channelId, timestamp, text) {
        if (!channelId || !timestamp || !text) return { success: false, error: "Missing fields for edit." };
        await this.client.chat.update({
            channel: channelId,
            ts: timestamp,
            text: text
        });
        return { success: true, payload: "Message updated." };
    }

    async _deleteMessage(channelId, timestamp) {
        if (!channelId || !timestamp) return { success: false, error: "Missing fields for delete." };
        await this.client.chat.delete({
            channel: channelId,
            ts: timestamp
        });
        return { success: true, payload: "Message deleted." };
    }

    async _pinMessage(channelId, timestamp) {
        if (!channelId || !timestamp) return { success: false, error: "Missing fields for pin." };
        await this.client.pins.add({
            channel: channelId,
            timestamp: timestamp
        });
        return { success: true, payload: "Message pinned." };
    }

    async _listPins(channelId) {
        if (!channelId) return { success: false, error: "Missing channelId." };
        const result = await this.client.pins.list({ channel: channelId });
        return { success: true, payload: JSON.stringify(result.items, null, 2) };
    }

    async _memberInfo(userId) {
        if (!userId) return { success: false, error: "Missing userId." };
        const result = await this.client.users.info({ user: userId });
        return { success: true, payload: JSON.stringify(result.user, null, 2) };
    }

    async _emojiList() {
        const result = await this.client.emoji.list();
        return { success: true, payload: JSON.stringify(result.emoji, null, 2) };
    }
}

export default new SlackSkill();
