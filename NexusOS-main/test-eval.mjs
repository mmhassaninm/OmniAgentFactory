import fs from 'fs';

global.window = {
    nexusAPI: {
        invoke: async (channel, url, options) => {
            if (channel === 'search:fetchHtml') {
                const res = await fetch(url, options || {});
                const text = await res.text();
                return { ok: res.ok, status: res.status, text };
            }
        }
    }
};

import { performSearch } from './apps/nexus-desktop/src/services/searchEngine.js';

async function test() {
    const userPrompt = "اية افضل ادوات للذكاء الاصطناعى لتوليد الفيديوهات سنة 2026؟ ومين اللى كسب فى كاس العالم ٢٠٢٦";
    console.log('1. Performing Search...');

    const searchResult = await performSearch(userPrompt, 'Deep Search', 'ar');
    console.log('Sources returned:', searchResult.length || searchResult.results?.length || Object.keys(searchResult).length);

    const systemPrompt = `You are Nexus AI. 
[WEB SEARCH CONTEXT]
${searchResult.context || searchResult.map?.(r => r.url).join(' ') || ''}

[SEARCH RULE]: Answer the user's questions in Arabic carefully evaluating the context. Cite sources.`;

    const payload = {
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 1500,
        stream: false
    };

    let mRes;
    try {
        mRes = await fetch('http://127.0.0.1:1234/v1/models');
    } catch (e) {
        console.log("LM Studio not running! Please start LM Studio.");
        return;
    }

    const mData = await mRes.json();
    const chatModel = mData.data.find(m => !m.id.includes('embedding'))?.id || 'local-model';
    console.log('Using model:', chatModel);
    payload.model = chatModel;

    console.log('\n2. Querying LM Studio...');
    const response = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log('\n3. AI Response:\n', data.choices[0]?.message?.content || data);
}
test();
