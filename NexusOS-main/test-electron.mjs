import { chromium } from 'playwright';

async function testElectron() {
    console.log('Connecting to Electron via CDP on port 9333...');
    let browser;
    try {
        browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
    } catch (e) {
        console.error('Failed to connect to Electron:', e);
        return;
    }

    const contexts = browser.contexts();
    if (contexts.length === 0) {
        console.error('No contexts found!');
        process.exit(1);
    }
    const pages = contexts[0].pages();
    const page = pages.find(p => p.url().includes('localhost:5173')) || pages[0];

    console.log('Attached to page:', page.url());

    try {
        console.log('Opening NexusChat...');
        // Find and click the NexusChat icon on the desktop
        await page.click('text=NexusChat', { timeout: 10000 }).catch(() => console.log('NexusChat might already be open or icon not found.'));

        console.log('Waiting for chat interface...');
        // Wait for Start Conversation button or input
        const startBtn = page.locator('button:has-text("Start Conversation")');
        if (await startBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await startBtn.click();
        }

        console.log('Typing query...');
        const inputLocator = page.locator('input[placeholder*="Ask Nexus"]');
        await inputLocator.waitFor({ state: 'visible', timeout: 10000 });
        await inputLocator.fill('اية افضل ادوات للذكاء الاصطناعى لتوليد الفيديوهات سنة 2026؟ ومين اللى كسب فى كاس العالم ٢٠٢٦');

        console.log('Enabling Web Search...');
        const searchToggle = page.locator('button[title*="Web Search"]');
        if (await searchToggle.isVisible()) {
            const cls = await searchToggle.getAttribute('class');
            if (!cls.includes('emerald-500')) {
                await searchToggle.click();
            }
        }

        console.log('Sending message...');
        await page.keyboard.press('Enter');

        console.log('Waiting for response to stream...');
        // Wait until streaming indicator disappears, or wait for at least 30 seconds
        await page.waitForTimeout(35000);

        console.log('Extracting response...');
        const messages = await page.locator('.prose, [dir="auto"]').allTextContents();
        console.log('\n--- FINAL CHAT MESSAGES ---');
        messages.forEach((msg, i) => console.log(`Msg ${i}: ${msg.substring(0, 500)}`));
        console.log('--- END CHAT MESSAGES ---\n');

        await page.screenshot({ path: 'electron-e2e-result.png' });
        console.log('Saved screenshot to electron-e2e-result.png');
    } catch (e) {
        console.error('Test failed:', e);
    } finally {
        await browser.close();
    }
}

testElectron();
