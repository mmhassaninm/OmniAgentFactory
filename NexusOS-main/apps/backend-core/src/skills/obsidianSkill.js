import fs from 'fs';
import path from 'path';
import os from 'os';
import logger from '@nexus/logger';

/**
 * ObsidianSkill
 * Manages Obsidian & Markdown notes by natively interfacing with the local file system.
 * By default, it targets a directory specified in OBSIDIAN_VAULT_PATH or falls back to standard Documents path.
 */
class ObsidianSkill {
    constructor() {
        // Fallback to a default directory if env var is missing
        this.vaultPath = process.env.OBSIDIAN_VAULT_PATH || path.join(os.homedir(), 'Documents', 'Obsidian_Vault');

        // Ensure the vault directory exists
        if (!fs.existsSync(this.vaultPath)) {
            try {
                fs.mkdirSync(this.vaultPath, { recursive: true });
                logger.info(`[ObsidianSkill] 💎 Created default Obsidian vault at: ${this.vaultPath}`);
            } catch (err) {
                logger.error(`[ObsidianSkill] Error creating vault directory: ${err.message}`);
            }
        } else {
            logger.info(`[ObsidianSkill] 💎 Obsidian Skill Initialized. Vault path: ${this.vaultPath}`);
        }
    }

    async executeIntent(args) {
        if (!args || !args.action) {
            return { success: false, error: 'No action provided to ObsidianSkill.' };
        }

        const { action, title, content, query } = args;

        logger.info(`[ObsidianSkill] 💎 Executing Action: ${action}`);

        try {
            switch (action) {
                case 'listNotes':
                    return await this._listNotes();
                case 'readNote':
                    return await this._readNote(title);
                case 'createNote':
                    return await this._createNote(title, content);
                case 'appendNote':
                    return await this._appendNote(title, content);
                case 'searchNotes':
                    return await this._searchNotes(query);
                default:
                    return { success: false, error: `Unsupported Obsidian action: ${action}` };
            }
        } catch (err) {
            logger.error(`[ObsidianSkill] Execution failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    _getFilePath(title) {
        if (!title) throw new Error("Title is required");
        let safeTitle = title.endsWith('.md') ? title : `${title}.md`;
        // Prevent directory traversal attacks
        safeTitle = safeTitle.replace(/^(\.\.[\/\\])+/, '');
        return path.join(this.vaultPath, safeTitle);
    }

    async _listNotes() {
        const files = fs.readdirSync(this.vaultPath);
        const notes = files.filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
        return { success: true, payload: JSON.stringify({ notes, total: notes.length }, null, 2) };
    }

    async _readNote(title) {
        const filePath = this._getFilePath(title);
        if (!fs.existsSync(filePath)) {
            return { success: false, error: `Note not found: ${title}` };
        }
        const data = fs.readFileSync(filePath, 'utf8');
        return { success: true, payload: data };
    }

    async _createNote(title, content) {
        const filePath = this._getFilePath(title);
        if (fs.existsSync(filePath)) {
            return { success: false, error: `Note already exists: ${title}. Use appendNote or choose a new name.` };
        }
        fs.writeFileSync(filePath, content || '', 'utf8');
        return { success: true, payload: `Note '${title}' created successfully.` };
    }

    async _appendNote(title, content) {
        const filePath = this._getFilePath(title);
        if (!content) throw new Error("Content is required to append.");

        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, content, 'utf8');
            return { success: true, payload: `Note '${title}' did not exist. Created and written successfully.` };
        } else {
            fs.appendFileSync(filePath, `\n\n${content}`, 'utf8');
            return { success: true, payload: `Content appended to '${title}' successfully.` };
        }
    }

    async _searchNotes(query) {
        if (!query) throw new Error("Query is required for searchNotes.");
        const files = fs.readdirSync(this.vaultPath).filter(f => f.endsWith('.md'));
        const results = [];

        for (const file of files) {
            const filePath = path.join(this.vaultPath, file);
            const content = fs.readFileSync(filePath, 'utf8');
            if (content.toLowerCase().includes(query.toLowerCase())) {
                results.push({
                    title: file.replace('.md', ''),
                    matches: "Found in content"
                });
            }
        }

        return { success: true, payload: JSON.stringify({ matches: results, total: results.length }, null, 2) };
    }
}

export default new ObsidianSkill();
