import puppeteer from 'puppeteer-core';
import logger from '@nexus/logger';
import os from 'os';
import path from 'path';

class BrowserSkill {
    constructor() {
        this.browser = null;
    }

    async getChromePath() {
        // Attempt to find Edge or Chrome for puppeteer-core on Windows
        const paths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
        ];

        const fs = await import('fs/promises');
        for (const p of paths) {
            try {
                await fs.access(p);
                return p;
            } catch (e) {
                // Not found
            }
        }
        throw new Error('No Chromium-based browser found at default Windows paths.');
    }

    async initBrowser() {
        if (this.browser) return this.browser;
        const executablePath = await this.getChromePath();

        logger.info(`[BrowserSkill] Launching browser engine at: ${executablePath}`);
        this.browser = await puppeteer.launch({
            executablePath,
            headless: true, // Headless for silent RPA integration
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        return this.browser;
    }

    async executeIntent(task) {
        logger.info(`[BrowserSkill] Executing RPA Intent: ${task.prompt}`);

        try {
            const browser = await this.initBrowser();
            const page = await browser.newPage();

            if (task.url) {
                logger.info(`[BrowserSkill] Navigating to ${task.url}`);
                await page.goto(task.url, { waitUntil: 'networkidle2' });
            }

            let result = "Action Completed";

            // Determine specific action based on the intent structure
            if (task.action === 'extract') {
                if (task.selector) {
                    logger.info(`[BrowserSkill] Extracting data from selector: ${task.selector}`);
                    result = await page.$eval(task.selector, el => el.innerText || el.textContent);
                } else {
                    // Fallback to full body text if no precise selector
                    result = await page.evaluate(() => document.body.innerText.substring(0, 1000));
                }
            } else if (task.action === 'click') {
                if (task.selector) {
                    await page.click(task.selector);
                    result = `Clicked element ${task.selector}`;
                    await page.waitForTimeout(1000); // Debounce
                }
            }

            await page.close();
            return { success: true, payload: result };

        } catch (error) {
            logger.error(`[BrowserSkill] Execution failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async shutdown() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

export default new BrowserSkill();
