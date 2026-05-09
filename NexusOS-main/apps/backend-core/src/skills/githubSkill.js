import axios from 'axios';
import logger from '@nexus/logger';

/**
 * GithubSkill
 * Manages GitHub operations natively via the official GitHub REST API.
 * Requires GITHUB_TOKEN environment variable.
 */
class GithubSkill {
    constructor() {
        this.baseURL = 'https://api.github.com';
        logger.info('[GithubSkill] 🐙 GitHub REST API Skill Initialized.');
    }

    _getHeaders() {
        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            throw new Error("GITHUB_TOKEN environment variable is missing.");
        }
        return {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
    }

    async executeIntent(args) {
        if (!args || !args.action) {
            return { success: false, error: 'No action provided to GithubSkill.' };
        }

        const { action, repo, prNumber, issueNumber, title, body, query } = args;
        logger.info(`[GithubSkill] 🐙 Executing Action: ${action} for repo: ${repo || 'default'}`);

        try {
            switch (action) {
                case 'listPRs':
                    if (!repo) throw new Error("repo is required (owner/repo)");
                    return await this._apiRequest('GET', `/repos/${repo}/pulls?state=all`);
                case 'viewPR':
                    if (!repo || !prNumber) throw new Error("repo and prNumber are required");
                    return await this._apiRequest('GET', `/repos/${repo}/pulls/${prNumber}`);
                case 'listIssues':
                    if (!repo) throw new Error("repo is required (owner/repo)");
                    return await this._apiRequest('GET', `/repos/${repo}/issues?state=open`);
                case 'viewIssue':
                    if (!repo || !issueNumber) throw new Error("repo and issueNumber are required");
                    return await this._apiRequest('GET', `/repos/${repo}/issues/${issueNumber}`);
                case 'createIssue':
                    if (!repo || !title) throw new Error("repo and title are required");
                    return await this._apiRequest('POST', `/repos/${repo}/issues`, { title, body: body || '' });
                case 'runAPIQuery':
                    if (!query) throw new Error("API query path is required");
                    // Handles raw paths like 'user' or 'repos/owner/repo'
                    const cleanQuery = query.startsWith('/') ? query : `/${query}`;
                    return await this._apiRequest('GET', cleanQuery);
                default:
                    return { success: false, error: `Unsupported GitHub action: ${action}` };
            }
        } catch (err) {
            const msg = err.response ? JSON.stringify(err.response.data) : err.message;
            logger.error(`[GithubSkill] Execution failed: ${msg}`);
            return { success: false, error: msg };
        }
    }

    async _apiRequest(method, endpoint, data = null) {
        try {
            const config = {
                method,
                url: `${this.baseURL}${endpoint}`,
                headers: this._getHeaders(),
                data
            };
            const response = await axios(config);

            // For listing, map to essential fields to save token/vram limit
            if (Array.isArray(response.data)) {
                const summary = response.data.map(item => ({
                    number: item.number,
                    title: item.title,
                    state: item.state,
                    user: item.user?.login,
                    url: item.html_url
                })).slice(0, 10); // Limit to top 10
                return { success: true, payload: JSON.stringify(summary, null, 2) };
            }

            return { success: true, payload: JSON.stringify(response.data, null, 2) };
        } catch (error) {
            throw error;
        }
    }
}

export default new GithubSkill();
