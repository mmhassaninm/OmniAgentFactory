import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const args = process.argv.slice(2);
const USERNAME = args[0] || 'Mostafa'; // 🛡️ [NEXUS] Hard-lock identity to Mostafa
const STYLE_REF_DIR = path.join(__dirname, '../../my-files/Knowledge_Vault/Style_References');
const OUTPUT_FILE = path.join(__dirname, `../../my-files/Profiles/${USERNAME}/Style_DNA.json`);
const MIN_MSG_LENGTH = 10;
const MAX_SAMPLES = 10000;

// Heuristic Tone Markers
const TONE_MARKERS = {
    "Directness": ["check", "make sure", "update", "fix", "now", "done", "create", "list", "define"],
    "Humor": ["haha", "lol", "wkwk", "funny", "joke", "lmao", "😂", "🤣", "😅"],
    "Technicality": ["code", "function", "variable", "api", "server", "database", "script", "json", "endpoint"],
    "Empathy": ["sorry", "thanks", "please", "appreciate", "love", "care", "worry", "feel", "hope"],
    "Curiosity": ["why", "how", "what", "where", "when", "?"]
};

const JUNK_WORDS = /\b(تمام|ماشي|اوك|يس|شكرا|عيل|طيب|خلاص|باشا|يا|ايه|اى|على|فى|من|الي)\b/i;
const EGYPTIAN_ARABIC_MARKERS = /\b(ده|دي|دول|مش|مشغل|عشان|ليه|ازاي|امتى|دلوقتي|بقى|فين|عايز|عاوز|بدي|إيه|أهو|كدا|كده|يا ريت|يارتني|والله|يا عم|يا باشا|يا غالي)\b/i;


async function main() {
    console.log("🧬 Starting Style DNA Extraction...");

    if (!fs.existsSync(STYLE_REF_DIR)) {
        console.error(`❌ Style References directory not found: ${STYLE_REF_DIR}`);
        return;
    }

    const files = await fs.readdir(STYLE_REF_DIR);
    let allMessages = [];

    for (const file of files) {
        if (!file.endsWith('.txt')) continue;
        const filePath = path.join(STYLE_REF_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        console.log(`📂 Processing: ${file}`);

        const messages = parseMessages(content, file);
        allMessages = allMessages.concat(messages);
    }

    console.log(`📊 Total extracted messages: ${allMessages.length}`);

    // Filter short messages and junk
    allMessages = allMessages.filter(m => {
        const isTooShort = m.length < MIN_MSG_LENGTH;
        const isMedia = m.includes("<Media omitted>");
        const isJunk = JUNK_WORDS.test(m) && m.split(/\s+/).length < 3; // Only junk if it's very short
        return !isTooShort && !isMedia && !isJunk;
    });

    // Score and prioritize high-fidelity Egyptian Arabic
    allMessages = allMessages.map(m => {
        let score = 1;
        if (EGYPTIAN_ARABIC_MARKERS.test(m)) score += 5;
        if (m.length > 50) score += 2;
        return { content: m, score };
    })
        .sort((a, b) => b.score - a.score) // Prioritize high scores
        .map(m => m.content)
        .slice(0, MAX_SAMPLES);

    console.log(`🔬 Analyzing ${allMessages.length} high-fidelity samples...`);

    const dna = analyzeStyle(allMessages);

    // Ensure output directory exists
    await fs.ensureDir(path.dirname(OUTPUT_FILE));

    // Write DNA
    await fs.writeJson(OUTPUT_FILE, dna, { spaces: 2 });
    console.log(`✅ Style DNA generated at: ${OUTPUT_FILE}`);
}

function parseMessages(content, filename) {
    const lines = content.split('\n');
    const messages = [];

    // WhatsApp Regex: 7/1/22, 11:00 AM - Sender: Message
    // Supports AM/PM and 24h, various date formats
    const whatsappRegex = /^(\d{1,4}[-/]\d{1,2}[-/]\d{1,4}),?\s(\d{1,2}:\d{2}(?:\s?[AP]M)?)\s-\s(.*?):\s(.*)$/;

    // State for ChatGPT parsing
    let isUserBlock = false;

    // Detect file type heuristic
    if (filename.toLowerCase().includes("whatsapp")) {
        // WhatsApp Mode
        for (const line of lines) {
            const match = line.match(whatsappRegex);
            if (match) {
                const sender = match[3];
                const msg = match[4];
                // HEURISTIC: We want "Moustafa Hassanin" messages (The User)
                // Or if unidentifiable, take the one with the most messages (later optimization)
                // For now, hardcode "Moustafa Hassanin" as likely user, OR "My Endless Love" if we are Amira?
                // Given standard VibeLab usage: The User is "Mostafa".
                if (sender.includes("Moustafa") || sender.includes("Mostafa")) {
                    messages.push(msg.trim());
                }
            } else {
                // Multiline message continuation?
                // Complicated for simple regex, skip for now to keep high precision
            }
        }
    } else {
        // Assume ChatGPT / Generic format
        // Structure:
        // user
        // Message...
        // ChatGPT
        // Message...

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.toLowerCase() === 'user') {
                isUserBlock = true;
                continue;
            } else if (line.toLowerCase() === 'chatgpt' || line.toLowerCase() === 'model' || line.toLowerCase() === 'assistant') {
                isUserBlock = false;
                continue;
            }

            if (isUserBlock && line.length > 0) {
                // Verify it's not a timestamp line from the file viewer artifact (e.g. "1: ...")
                // The file viewer adds "1: ", but raw file shouldn't have it.
                // We will assume raw file content here.
                messages.push(line);
            }
        }
    }

    return messages;
}

function analyzeStyle(messages) {
    const wordCounts = {};
    const emojiCounts = {};
    const phraseCounts = {};
    let totalSentences = 0;
    let totalWords = 0;
    let punctuation = { ".": 0, "!": 0, "?": 0, ",": 0 };

    // Tone Scores
    const toneScores = {};
    for (const k in TONE_MARKERS) toneScores[k] = 0;

    messages.forEach(msg => {
        // 1. Emoji Analysis
        const emojis = msg.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu) || [];
        emojis.forEach(e => emojiCounts[e] = (emojiCounts[e] || 0) + 1);

        // 2. Tokenization (Basic)
        // Remove emojis and special chars for word analysis
        const cleanMsg = msg.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').toLowerCase();
        const words = cleanMsg.split(/\s+/).filter(w => w.length > 0);
        totalWords += words.length;

        // 3. Word & Tone Analysis
        words.forEach(w => {
            wordCounts[w] = (wordCounts[w] || 0) + 1;

            // Tone check
            for (const [tone, keywords] of Object.entries(TONE_MARKERS)) {
                if (keywords.some(k => w.includes(k))) {
                    toneScores[tone]++;
                }
            }
        });

        // 4. Punctuation
        [...msg].forEach(char => {
            if (punctuation[char] !== undefined) punctuation[char]++;
        });

        // 5. Phrases (Bigrams)
        for (let i = 0; i < words.length - 1; i++) {
            const bigram = `${words[i]} ${words[i + 1]}`;
            phraseCounts[bigram] = (phraseCounts[bigram] || 0) + 1;
        }

        totalSentences++;
    });

    // Helper: Sort and slice
    const top = (obj, n) => Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([k, v]) => k); // Just the keys

    // Normalize Tone Vectors (0-10 scale relative to message count)
    const normalizedTone = [];
    for (const [tone, score] of Object.entries(toneScores)) {
        // Simple heuristic normalization
        let intensity = Math.min(10, Math.round((score / totalSentences) * 20));
        if (intensity > 0) normalizedTone.push(`${tone}: ${intensity}/10`);
    }

    return {
        common_phrases: top(phraseCounts, 30),
        top_words: top(wordCounts, 50),
        emoji_frequency: top(emojiCounts, 10),
        sentence_structure: {
            avg_words_per_msg: Math.round(totalWords / (totalSentences || 1)),
            punctuation_preference: top(punctuation, 4)
        },
        tone_vectors: normalizedTone
    };
}

main().catch(console.error);
