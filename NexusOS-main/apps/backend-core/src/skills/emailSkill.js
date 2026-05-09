import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import logger from '@nexus/logger';

/**
 * Email Management Skill
 * Replicates OpenClaw's Himalaya integration for reading and sending emails.
 * Zero-Trust Protocol: Credentials must be strictly loaded from environment variables 
 * and never hardcoded or leaked into debug logs.
 */
class EmailSkill {
    constructor() {
        this.config = {
            imapConfig: {
                host: process.env.EMAIL_IMAP_HOST || 'imap.gmail.com',
                port: parseInt(process.env.EMAIL_IMAP_PORT, 10) || 993,
                secure: true,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                },
                logger: false
            },
            smtpConfig: {
                host: process.env.EMAIL_SMTP_HOST || 'smtp.gmail.com',
                port: parseInt(process.env.EMAIL_SMTP_PORT, 10) || 465,
                secure: true,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            }
        };
    }

    async executeIntent(args) {
        if (!args || !args.action) {
            return { success: false, error: "No action provided to EmailSkill." };
        }

        const { action, to, subject, body, limit = 5 } = args;

        if (!this.config.imapConfig.auth.user || !this.config.imapConfig.auth.pass) {
            return {
                success: false,
                error: "Zero-Trust Error: Email credentials (EMAIL_USER, EMAIL_PASS) are not configured in the host environment."
            };
        }

        logger.info(`[EmailSkill] 📧 Executing Native Email Action: ${action} `);

        try {
            if (action === 'send') {
                return await this._sendEmail(to, subject, body);
            } else if (action === 'read') {
                return await this._readEmails(limit);
            } else {
                return { success: false, error: `Unsupported email action: ${action}` };
            }
        } catch (err) {
            logger.error(`[EmailSkill] Execution failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    async _sendEmail(to, subject, body) {
        if (!to || !subject || !body) return { success: false, error: "Missing required fields: to, subject, body" };

        const transporter = nodemailer.createTransport(this.config.smtpConfig);

        await transporter.sendMail({
            from: this.config.smtpConfig.auth.user,
            to,
            subject,
            text: body
        });

        return { success: true, payload: `Email successfully sent to ${to}.` };
    }

    async _readEmails(limit) {
        const client = new ImapFlow(this.config.imapConfig);
        await client.connect();

        let lock = await client.getMailboxLock('INBOX');
        const emails = [];

        try {
            // Fetch latest messages
            for await (let msg of client.fetch({ seq: `1:${limit}` }, { envelope: true })) {
                const env = msg.envelope;
                emails.push({
                    subject: env.subject,
                    from: env.from.map(f => f.address).join(', '),
                    date: env.date.toISOString(),
                });
            }
        } finally {
            lock.release();
        }

        await client.logout();

        return { success: true, payload: JSON.stringify(emails, null, 2) };
    }
}

export default new EmailSkill();
