import axios from 'axios';
import logger from '@nexus/logger';

/**
 * NotionSkill
 * Manages Notion integration via the official Notion API (2025-09-03 version).
 * Requires NOTION_API_KEY in environment variables.
 */
class NotionSkill {
    constructor() {
        this.version = '2025-09-03';
        this.baseUrl = 'https://api.notion.com/v1';
        logger.info('[NotionSkill] 📝 Notion Skill Initialized.');
    }

    _getHeaders() {
        const apiKey = process.env.NOTION_API_KEY;
        if (!apiKey) {
            throw new Error('NOTION_API_KEY is not set in the environment variables.');
        }
        return {
            'Authorization': `Bearer ${apiKey}`,
            'Notion-Version': this.version,
            'Content-Type': 'application/json'
        };
    }

    async executeIntent(args) {
        if (!args || !args.action) {
            return { success: false, error: 'No action provided to NotionSkill.' };
        }

        const { action, query, pageId, databaseId, dataSourceId, title, content, status, filter, sorts } = args;

        logger.info(`[NotionSkill] 📝 Executing Action: ${action}`);

        try {
            switch (action) {
                case 'search':
                    return await this._search(query);
                case 'getPage':
                    return await this._getPage(pageId);
                case 'getBlocks':
                    return await this._getBlocks(pageId);
                case 'createPage':
                    return await this._createPage(databaseId, title, content);
                case 'queryDataSource':
                    return await this._queryDataSource(dataSourceId, filter, sorts);
                case 'createDataSource':
                    return await this._createDataSource(pageId, title);
                case 'updatePageStatus':
                    return await this._updatePageStatus(pageId, status);
                case 'addBlocks':
                    return await this._addBlocks(pageId, content);
                default:
                    return { success: false, error: `Unsupported Notion action: ${action}` };
            }
        } catch (err) {
            logger.error(`[NotionSkill] Execution failed: ${err.message}`);
            if (err.response && err.response.data) {
                logger.error(`[NotionSkill] API Error Details: ${JSON.stringify(err.response.data)}`);
                return { success: false, error: `${err.message} - ${JSON.stringify(err.response.data)}` };
            }
            return { success: false, error: err.message };
        }
    }

    async _search(query) {
        const payload = query ? { query } : {};
        const response = await axios.post(`${this.baseUrl}/search`, payload, { headers: this._getHeaders() });
        return { success: true, payload: JSON.stringify(response.data.results, null, 2) };
    }

    async _getPage(pageId) {
        if (!pageId) throw new Error('pageId is required');
        const response = await axios.get(`${this.baseUrl}/pages/${pageId}`, { headers: this._getHeaders() });
        return { success: true, payload: JSON.stringify(response.data, null, 2) };
    }

    async _getBlocks(pageId) {
        if (!pageId) throw new Error('pageId is required');
        const response = await axios.get(`${this.baseUrl}/blocks/${pageId}/children`, { headers: this._getHeaders() });
        return { success: true, payload: JSON.stringify(response.data.results, null, 2) };
    }

    async _createPage(databaseId, title, content) {
        if (!databaseId || !title) throw new Error('databaseId and title are required for createPage');

        const payload = {
            parent: { database_id: databaseId },
            properties: {
                Name: { title: [{ text: { content: title } }] }
            }
        };

        if (content) {
            payload.children = [
                {
                    object: 'block',
                    type: 'paragraph',
                    paragraph: { rich_text: [{ text: { content: content } }] }
                }
            ];
        }

        const response = await axios.post(`${this.baseUrl}/pages`, payload, { headers: this._getHeaders() });
        return { success: true, payload: `Page created successfully with ID: ${response.data.id}` };
    }

    async _queryDataSource(dataSourceId, filter, sorts) {
        if (!dataSourceId) throw new Error('dataSourceId is required');
        const payload = {};
        if (filter) payload.filter = typeof filter === 'string' ? JSON.parse(filter) : filter;
        if (sorts) payload.sorts = typeof sorts === 'string' ? JSON.parse(sorts) : sorts;

        const response = await axios.post(`${this.baseUrl}/data_sources/${dataSourceId}/query`, payload, { headers: this._getHeaders() });
        return { success: true, payload: JSON.stringify(response.data.results, null, 2) };
    }

    async _createDataSource(pageId, title) {
        if (!pageId || !title) throw new Error('pageId and title are required for createDataSource');

        const payload = {
            parent: { page_id: pageId },
            title: [{ text: { content: title } }],
            properties: {
                Name: { title: {} },
                Status: { select: { options: [{ name: "Todo" }, { name: "Done" }] } },
                Date: { date: {} }
            }
        };

        const response = await axios.post(`${this.baseUrl}/data_sources`, payload, { headers: this._getHeaders() });
        return { success: true, payload: `Data source created with ID: ${response.data.id}` };
    }

    async _updatePageStatus(pageId, status) {
        if (!pageId || !status) throw new Error('pageId and status are required');
        const payload = {
            properties: {
                Status: { select: { name: status } }
            }
        };
        const response = await axios.patch(`${this.baseUrl}/pages/${pageId}`, payload, { headers: this._getHeaders() });
        return { success: true, payload: `Page status updated successfully.` };
    }

    async _addBlocks(pageId, content) {
        if (!pageId || !content) throw new Error('pageId and content are required');
        const payload = {
            children: [
                {
                    object: 'block',
                    type: 'paragraph',
                    paragraph: { rich_text: [{ text: { content: content } }] }
                }
            ]
        };
        const response = await axios.patch(`${this.baseUrl}/blocks/${pageId}/children`, payload, { headers: this._getHeaders() });
        return { success: true, payload: `Blocks added successfully.` };
    }
}

export default new NotionSkill();
