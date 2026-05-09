import fs from 'fs';
fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent('اية افضل ادوات للذكاء الاصطناعى لتوليد الفيديوهات سنة 2026'), {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36' }
}).then(r => r.text()).then(html => {
    console.log("HTML length:", html.length);
    const matches = [...html.matchAll(/<a class="result__url" href="([^"]+)".*?<a class="result__snippet[^>]+>(.*?)<\/a>/gis)];
    console.log("Regex Found matches:", matches.length);
    if (matches.length > 0) {
        console.log("First Match URL:", matches[0][1]);
        console.log("First Match Snippet length:", matches[0][2].length);
    }
});
