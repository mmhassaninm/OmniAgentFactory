import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import pdfParse from 'pdf-parse';
import logger from '@nexus/logger';

/**
 * ParserSkill
 * Handles advanced extraction and text retrieval for URLs, PDFs, and standard raw files.
 * Provides the AI with direct abilities to parse knowledge documents directly.
 */
class ParserSkill {
    constructor() {
        logger.info('[ParserSkill] 🕵️‍♂️ Advanced File/URL Parser Initialized.');
    }

    async executeIntent(args) {
        if (!args || !args.action) {
            return { success: false, error: 'No action provided to ParserSkill.' };
        }

        const { action, filePath, url } = args;

        logger.info(`[ParserSkill] 🕵️‍♂️ Executing Action: ${action}`);

        try {
            switch (action) {
                case 'parseURL':
                    if (!url) throw new Error("url is required for parseURL");
                    return await this._parseURL(url);
                case 'parsePDF':
                    if (!filePath) throw new Error("filePath is required for parsePDF");
                    return await this._parsePDF(filePath);
                case 'parseFile':
                    if (!filePath) throw new Error("filePath is required for parseFile");
                    return await this._parseRawFile(filePath);
                default:
                    return { success: false, error: `Unsupported Parser action: ${action}` };
            }
        } catch (err) {
            logger.error(`[ParserSkill] Execution failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    async _parseURL(targetUrl) {
        try {
            const { data } = await axios.get(targetUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NexusOS/1.0 Parser' },
                timeout: 10000
            });

            // Use cheerio to parse HTML and extract text
            const $ = cheerio.load(data);

            // Remove scripts and styles
            $('script, style, noscript').remove();

            // Extract text and condense whitespace
            const cleanText = $('body').text().replace(/\s+/g, ' ').trim();

            return { success: true, payload: cleanText.substring(0, 15000) }; // Cap length to save VRAM
        } catch (error) {
            throw new Error(`Failed to parse URL: ${error.message}`);
        }
    }

    async _parsePDF(pdfPath) {
        try {
            const absolutePath = path.resolve(pdfPath);
            if (!fs.existsSync(absolutePath)) {
                throw new Error(`PDF File not found at ${absolutePath}`);
            }

            const dataBuffer = await fs.promises.readFile(absolutePath);
            const data = await pdfParse(dataBuffer);

            // data.text contains the raw text extracted from the PDF
            return { success: true, payload: data.text.substring(0, 15000) }; // Cap length 
        } catch (error) {
            throw new Error(`Failed to parse PDF: ${error.message}`);
        }
    }

    async _parseRawFile(filePath) {
        try {
            const absolutePath = path.resolve(filePath);
            if (!fs.existsSync(absolutePath)) {
                throw new Error(`File not found at ${absolutePath}`);
            }

            const text = await fs.promises.readFile(absolutePath, 'utf8');
            return { success: true, payload: text.substring(0, 15000) };
        } catch (error) {
            throw new Error(`Failed to read raw file: ${error.message}`);
        }
    }
}

export default new ParserSkill();
