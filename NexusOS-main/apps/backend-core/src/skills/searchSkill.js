import logger from '@nexus/logger';
import path from 'path';
import fs from 'fs-extra';
import { app } from 'electron'; // أو استخدم مسار ثابت إذا لم يكن مدعوماً هنا

class SearchSkill {
    constructor() {
        this.name = 'OmniAgenticSearch';
    }

    // 1. استدعاء الذاكرة والعقل الباطن
    async getUserContext() {
        try {
            // جلب الـ DNA الخاص بأسلوبك واهتماماتك التي يحفظها AiOrchestrator
            const userDataPath = app ? app.getPath('userData') : path.join(process.cwd(), 'data');
            const dnaPath = path.join(userDataPath, 'Nexus_Vault_DB', 'Profiles', 'default', 'Style_DNA.json'); // عدل 'default' لاسم المستخدم الخاص بك

            let context = "User Preferences: \n";
            if (await fs.pathExists(dnaPath)) {
                const dna = await fs.readJson(dnaPath);
                context += JSON.stringify(dna) + "\n";
            }
            return context;
        } catch (e) {
            logger.warn('[SearchSkill] Could not load user context: ' + e.message);
            return '';
        }
    }

    // 2. الذكاء الاصطناعي يكتب استعلامات البحث بنفسه
    async generateSearchQueries(userQuery) {
        logger.info(`🧠 [CORTEX] Expanding query: ${userQuery}`);
        const prompt = `You are an expert search query generator. 
The user asked: "${userQuery}".
Generate 2 short, highly effective search queries (one in English, one in Arabic) to find the best articles.
Return ONLY a JSON array of strings. Example: ["latest Node.js RAG integration", "تطبيقات RAG مع Node.js"]`;

        try {
            const resp = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1
                })
            });
            const data = await resp.json();
            const content = data.choices[0].message.content;
            const match = content.match(/\[.*?\]/s);
            if (match) return JSON.parse(match[0]);
            return [userQuery];
        } catch (e) {
            return [userQuery];
        }
    }

    // 3. سحب الروابط مجاناً من DuckDuckGo
    async searchDuckDuckGo(query) {
        try {
            logger.info(`[SearchSkill] Searching DDG for: ${query}`);
            const response = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query));
            const html = await response.text();

            const urls = [];
            const regex = /<a[^>]+class="[^"]*result__url[^"]*"[^>]*href="([^"]+)"/gi;
            let match;
            while ((match = regex.exec(html)) !== null && urls.length < 2) {
                let url = match[1];
                if (url.startsWith('//duckduckgo.com/l/?uddg=')) {
                    url = decodeURIComponent(url.replace('//duckduckgo.com/l/?uddg=', '').split('&')[0]);
                }
                urls.push(url);
            }
            return urls;
        } catch (error) {
            logger.error('[SearchSkill] DDG Search Error: ' + error.message);
            return [];
        }
    }

    // 4. القراءة العميقة للمقالات باستخدام Jina AI
    async scrapeWebContent(url) {
        try {
            logger.info(`📖 [SearchSkill] Deep Scraping (Jina AI): ${url}`);
            const response = await fetch('https://r.jina.ai/' + url);
            const markdown = await response.text();
            // نأخذ أول 6000 حرف من كل مقال (معلومات دسمة جداً مقارنة بـ 60 حرف سابقاً)
            return { url, content: markdown.substring(0, 6000) };
        } catch (error) {
            return { url, error: error.message };
        }
    }

    async performAdvancedSearch(originalQuery) {
        logger.info(`🚀 [NEXUS SEARCH] Initiating Agentic Deep Scrape for: ${originalQuery}`);

        // جلب الذاكرة
        const userContext = await this.getUserContext();

        // توليد استعلامات ذكية
        const smartQueries = await this.generateSearchQueries(originalQuery);

        let allLinks = [];
        for (const q of smartQueries) {
            const links = await this.searchDuckDuckGo(q);
            allLinks.push(...links);
        }

        // إزالة الروابط المكررة وأخذ أفضل 3 فقط
        const uniqueLinks = [...new Set(allLinks)].slice(0, 3);

        if (uniqueLinks.length === 0) return "STRICT_NO_DATA";

        // قراءة المقالات بالكامل
        const scrapedDocs = await Promise.all(uniqueLinks.map(link => this.scrapeWebContent(link)));

        let deepContext = "";
        scrapedDocs.forEach(doc => {
            if (!doc.error) deepContext += `\n\n--- Source: (${doc.url}) ---\n${doc.content}\n`;
        });

        let finalOutput = `[SYSTEM: THE FOLLOWING IS REAL-TIME WEB DATA. SYNTHESIZE AN ANSWER BASED ON IT AND THE USER'S CONTEXT]
        
[USER SUBCONSCIOUS MEMORY & PREFERENCES]:
${userContext}

[DEEP WEB SEARCH RESULTS]:
${deepContext}

المصادر المستخدمة:
${uniqueLinks.map(url => `- ${url}`).join('\n')}
`;
        return finalOutput;
    }

    async executeIntent(task) {
        const query = task.query || task.command || task;
        const results = await this.performAdvancedSearch(query);
        return results; // نرجع النص المليء بالمعلومات والوعي للمنسق
    }
}

export default new SearchSkill();