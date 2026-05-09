import { performSearch } from './apps/nexus-desktop/src/services/searchEngine.js';

async function test() {
    console.log('1. Performing Search...');
    const searchResult = await performSearch('??? ???? ??????? ??? ????? ??????? ?????? ?????????', 'Normal', 'ar');
    console.log('Search Context:\\n', searchResult.context);

    console.log('\\n2. Querying LM Studio...');
    const systemPrompt = \You are Nexus AI. 
[WEB SEARCH CONTEXT]
\

[SEARCH RULE]: Your answer MUST be based on the search context above. Explain when and where the last round of negotiations between Iran and the US took place, and what the details were. Reply in Arabic.\;

    const payload = {
        model: 'text-embedding-bge-m3', // We will just use whatever model is loaded, wait, bge-m3 is an embedding model.
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: '?? ?? ?????? ??? ???? ??????? ??? ????? ????????' }
        ],
        temperature: 0.3,
        max_tokens: 1000,
        stream: false
    };

    // Need to find which model is actually a chat model
    const mRes = await fetch('http://127.0.0.1:1234/v1/models');
    const mData = await mRes.json();
    const chatModel = mData.data.find(m => !m.id.includes('embedding'))?.id || 'local-model';
    console.log('Using model:', chatModel);
    payload.model = chatModel;

    const response = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log('\\n3. AI Response:\\n', data.choices[0].message.content);
}
test();
