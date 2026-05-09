import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '@nexus/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const TEMP_DIR = path.join(PROJECT_ROOT, 'data', 'temp');

// ─────────────────────────────────────────────
// 🕸️ TOOL 1: Web Scraper (Deep Page Reader)
// ─────────────────────────────────────────────
const MAX_SCRAPE_CHARS = 10000;

export const scrapeWebPage = async (url) => {
    try {
        if (!url || typeof url !== 'string') {
            return '[SCRAPER ERROR]: No valid URL provided.';
        }

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        logger.info(`🕸️ [SCRAPER] Fetching: ${url}`);
        const { data } = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8'
            },
            maxRedirects: 3
        });

        const $ = cheerio.load(data);
        $('script, style, nav, footer, header, iframe, noscript, aside, .ad, .ads').remove();

        let text = $('body').text();
        text = text.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

        if (text.length > MAX_SCRAPE_CHARS) {
            text = text.substring(0, MAX_SCRAPE_CHARS) + '\n...[TRUNCATED]';
        }

        const title = $('title').text().trim();
        logger.info(`🕸️ [SCRAPER] Success: "${title}" (${text.length} chars)`);
        return `[PAGE TITLE]: ${title}\n[PAGE CONTENT]:\n${text}`;

    } catch (error) {
        logger.error(`🕸️ [SCRAPER] Failed for ${url}: ${error.message}`);
        return `[SCRAPER ERROR]: Failed to fetch URL "${url}". Reason: ${error.message}`;
    }
};

// ─────────────────────────────────────────────
// 🧮 TOOL 2: Code Interpreter (Python / JS)
// ─────────────────────────────────────────────
const CODE_TIMEOUT = 10000; // 10 seconds max execution
const MAX_OUTPUT_CHARS = 4000;

export const executeCode = async (language, code) => {
    try {
        if (!language || !code) return '[CODE ERROR]: Missing language or code parameter.';

        const lang = language.toLowerCase().trim();
        if (lang !== 'python' && lang !== 'javascript' && lang !== 'node') {
            return `[CODE ERROR]: Unsupported language "${language}". Only python and javascript/node allowed.`;
        }

        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

        const ext = lang === 'python' ? 'py' : 'js';
        const runner = lang === 'python' ? 'python' : 'node';
        const tempFile = path.join(TEMP_DIR, `temp_exec_${Date.now()}.${ext}`);

        logger.info(`🧮 [CODE] Executing ${lang} code (${code.length} chars)...`);
        fs.writeFileSync(tempFile, code, 'utf8');

        let output;
        try {
            output = execSync(`${runner} "${tempFile}"`, {
                timeout: CODE_TIMEOUT,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: TEMP_DIR
            });
        } catch (execError) {
            output = `[EXECUTION ERROR]:\n${execError.stderr || execError.message}`;
        } finally {
            try { fs.unlinkSync(tempFile); } catch (_) { }
        }

        if (output && output.length > MAX_OUTPUT_CHARS) {
            output = output.substring(0, MAX_OUTPUT_CHARS) + '\n...[OUTPUT TRUNCATED]';
        }

        logger.info(`🧮 [CODE] ${lang} execution complete.`);
        return `[CODE OUTPUT (${lang})]:\n${output || '(no output)'}`;

    } catch (error) {
        logger.error(`🧮 [CODE] Critical failure: ${error.message}`);
        return `[CODE ERROR]: ${error.message}`;
    }
};
