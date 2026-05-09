import axios from 'axios';
import logger from '@nexus/logger';

/**
 * TrelloSkill
 * Manages Trello integration via the official REST API.
 * Requires TRELLO_API_KEY and TRELLO_TOKEN in environment variables.
 */
class TrelloSkill {
    constructor() {
        this.baseUrl = 'https://api.trello.com/1';
        logger.info('[TrelloSkill] 📋 Trello Skill Initialized.');
    }

    _getAuthParams() {
        const apiKey = process.env.TRELLO_API_KEY;
        const token = process.env.TRELLO_TOKEN;

        if (!apiKey || !token) {
            throw new Error('TRELLO_API_KEY and TRELLO_TOKEN are not set in the environment variables.');
        }

        return {
            key: apiKey,
            token: token
        };
    }

    async executeIntent(args) {
        if (!args || !args.action) {
            return { success: false, error: 'No action provided to TrelloSkill.' };
        }

        const { action, boardId, listId, cardId, name, desc, newListId, text } = args;

        logger.info(`[TrelloSkill] 📋 Executing Action: ${action}`);

        try {
            switch (action) {
                case 'listBoards':
                    return await this._listBoards();
                case 'listLists':
                    return await this._listLists(boardId);
                case 'listCards':
                    return await this._listCards(listId);
                case 'createCard':
                    return await this._createCard(listId, name, desc);
                case 'moveCard':
                    return await this._moveCard(cardId, newListId);
                case 'addComment':
                    return await this._addComment(cardId, text);
                case 'archiveCard':
                    return await this._archiveCard(cardId);
                default:
                    return { success: false, error: `Unsupported Trello action: ${action}` };
            }
        } catch (err) {
            logger.error(`[TrelloSkill] Execution failed: ${err.message}`);
            if (err.response && err.response.data) {
                logger.error(`[TrelloSkill] API Error Details: ${JSON.stringify(err.response.data)}`);
                return { success: false, error: `${err.message} - ${JSON.stringify(err.response.data)}` };
            }
            return { success: false, error: err.message };
        }
    }

    async _listBoards() {
        const params = this._getAuthParams();
        const response = await axios.get(`${this.baseUrl}/members/me/boards`, { params });
        const boards = response.data.map(b => ({ name: b.name, id: b.id }));
        return { success: true, payload: JSON.stringify(boards, null, 2) };
    }

    async _listLists(boardId) {
        if (!boardId) throw new Error('boardId is required');
        const params = this._getAuthParams();
        const response = await axios.get(`${this.baseUrl}/boards/${boardId}/lists`, { params });
        const lists = response.data.map(l => ({ name: l.name, id: l.id }));
        return { success: true, payload: JSON.stringify(lists, null, 2) };
    }

    async _listCards(listId) {
        if (!listId) throw new Error('listId is required');
        const params = this._getAuthParams();
        const response = await axios.get(`${this.baseUrl}/lists/${listId}/cards`, { params });
        const cards = response.data.map(c => ({ name: c.name, id: c.id, desc: c.desc }));
        return { success: true, payload: JSON.stringify(cards, null, 2) };
    }

    async _createCard(listId, name, desc) {
        if (!listId || !name) throw new Error('listId and name are required');
        const params = {
            ...this._getAuthParams(),
            idList: listId,
            name: name,
            desc: desc || ''
        };
        const response = await axios.post(`${this.baseUrl}/cards`, null, { params });
        return { success: true, payload: `Card created successfully with ID: ${response.data.id}` };
    }

    async _moveCard(cardId, newListId) {
        if (!cardId || !newListId) throw new Error('cardId and newListId are required');
        const params = {
            ...this._getAuthParams(),
            idList: newListId
        };
        const response = await axios.put(`${this.baseUrl}/cards/${cardId}`, null, { params });
        return { success: true, payload: `Card moved successfully.` };
    }

    async _addComment(cardId, text) {
        if (!cardId || !text) throw new Error('cardId and text are required');
        const params = {
            ...this._getAuthParams(),
            text: text
        };
        const response = await axios.post(`${this.baseUrl}/cards/${cardId}/actions/comments`, null, { params });
        return { success: true, payload: `Comment added successfully.` };
    }

    async _archiveCard(cardId) {
        if (!cardId) throw new Error('cardId is required');
        const params = {
            ...this._getAuthParams(),
            closed: 'true'
        };
        const response = await axios.put(`${this.baseUrl}/cards/${cardId}`, null, { params });
        return { success: true, payload: `Card archived successfully.` };
    }
}

export default new TrelloSkill();
