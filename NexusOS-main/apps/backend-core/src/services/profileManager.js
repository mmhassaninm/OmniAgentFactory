import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';
import logger from '@nexus/logger';

const userDataPath = app.getPath('userData');
const PROFILES_DIR = path.join(userDataPath, 'Nexus_Vault_DB', 'Profiles');

let activeUser = 'DefaultUser';

export async function switchUser(username) {
    activeUser = username || 'DefaultUser';
    const profileDir = path.join(PROFILES_DIR, activeUser);
    await fs.ensureDir(profileDir);
    logger.info(`👤 Switched to user: ${activeUser}`);
    return activeUser;
}

export async function createProfile(username) {
    if (!username) return false;
    const sanitized = username.trim().replace(/[^a-zA-Z0-9_\- ]/g, '');
    if (!sanitized || sanitized.toLowerCase() === 'admin' || sanitized.toLowerCase() === 'user') return false;

    const profileDir = path.join(PROFILES_DIR, sanitized);
    try {
        await fs.ensureDir(profileDir);
        const dnaPath = path.join(profileDir, 'Style_DNA.json');
        if (!(await fs.pathExists(dnaPath))) {
            await fs.writeJson(dnaPath, { idioms: [] }, { spaces: 2 });
        }
        logger.info(`🤖 Created new profile: ${sanitized}`);
        return true;
    } catch (error) {
        logger.error(`Failed to create profile for ${sanitized}: ${error.message}`);
        return false;
    }
}

export function getActiveUser() { return activeUser; }

// ═══════════════════════════════════════════════════════════════════
// 🧠 PSYCHOMETRIC ANALYSIS ENGINE
// ═══════════════════════════════════════════════════════════════════
export async function updatePsychometrics(chatMessages, username) {
    try {
        const user = username || activeUser;
        const profileDir = path.join(PROFILES_DIR, user);
        await fs.ensureDir(profileDir);
        const profilePath = path.join(profileDir, 'Psycho_Analysis.md');

        if (!chatMessages || chatMessages.length < 10) return null;

        const userMessages = chatMessages.filter(m => m.role === 'user').map(m => m.content).slice(-20);
        if (userMessages.length < 5) return null;

        const allText = userMessages.join(' ');
        const style = analyzeStyle(allText, userMessages);
        const interests = analyzeInterests(allText);
        const tone = analyzeTone(allText);
        const vocab = extractVocabulary(allText, userMessages);

        const vocabPath = path.join(profileDir, 'Vocabulary_Bank.json');
        await fs.writeJson(vocabPath, vocab, { spaces: 2 });
        logger.info(`🗣️ Vocabulary bank updated for: ${user}`);

        const profileContent = `# User Analysis: ${user}\n**Last Updated:** ${new Date().toLocaleString()}\n**Messages Analyzed:** ${userMessages.length}\n\n---\n\n## 🧬 Personality Profile\n\n### Communication Style\n- **Directness:** ${style.directness}\n- **Verbosity:** ${style.verbosity}\n- **Formality:** ${style.formality}\n- **Language:** ${style.language}\n- **Avg Message Length:** ${style.avgLength} chars\n\n### Emotional Signature\n- **Dominant Tone:** ${tone.dominant}\n- **Curiosity Level:** ${tone.curiosity}\n- **Assertiveness:** ${tone.assertiveness}\n- **Humor:** ${tone.humor}\n\n---\n\n## 🎯 Interests & Ambitions\n${interests.map(i => `- **${i.domain}:** ${i.description} (Mentions: ${i.count})`).join('\n')}\n\n---\n\n## 🗣️ Recommended AI Behavior\n- **Tone:** ${getRecommendedTone(style, tone)}\n- **Detail Level:** ${style.verbosity === 'Concise' ? 'Dense, no filler' : 'Detailed with examples'}\n- **Language Preference:** ${style.language}\n- **Mirroring:** Use these phrases: ${vocab.catchphrases.join(', ')}\n`;

        await fs.writeFile(profilePath, profileContent, 'utf-8');
        logger.info(`🧠 Psychometric profile updated for: ${user}`);

        return { path: profilePath, user, style, tone, interests, vocab };
    } catch (error) {
        logger.error(`Psychometric analysis failed: ${error.message}`);
        return null;
    }
}

function extractVocabulary(text, messages) {
    const emojis = text.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu) || [];
    const emojiFreq = {};
    emojis.forEach(e => emojiFreq[e] = (emojiFreq[e] || 0) + 1);
    const topEmojis = Object.entries(emojiFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([e]) => e);

    const words = text.toLowerCase().split(/\s+/);
    const wordFreq = {};
    words.forEach(w => { if (w.length > 3) wordFreq[w] = (wordFreq[w] || 0) + 1; });

    const catchphrases = [];
    ["فاهمني", "خارج الصندوق", "يا هيرميس", "منطق", "بالظبط", "حلو ده", "كمل", "عاش", "you know", "make sense", "exactly", "carry on", "cool"].forEach(phrase => {
        if ((text.match(new RegExp(phrase, 'gi')) || []).length > 0) catchphrases.push(phrase);
    });

    Object.entries(wordFreq).forEach(([word, count]) => {
        if (count > 2 && catchphrases.length < 10) catchphrases.push(word);
    });

    return {
        catchphrases: [...new Set(catchphrases)].slice(0, 8),
        emoji_usage: topEmojis.length > 0 ? topEmojis.join(' ') : 'None',
        tone_directives: messages.some(m => m.length < 20) ? "Short, punchy sentences" : "Neutral"
    };
}

function analyzeStyle(text, messages) {
    const avgLength = Math.round(messages.reduce((sum, m) => sum + m.length, 0) / messages.length);
    const directness = avgLength < 80 ? 'Very Direct (Commander)' : avgLength < 200 ? 'Direct (Efficient)' : 'Detailed (Thinker)';
    const verbosity = avgLength < 100 ? 'Concise' : avgLength < 300 ? 'Moderate' : 'Verbose';

    const informalMarkers = (text.match(/\b(lol|haha|yooo|bruh|😂|pls|thx|ty|nah|gonna|wanna|gotta|يا|هيرميس|يعني|كدا|عشان|بقى|دلوقتي|ازيك|عامل)\b/gi) || []).length;
    const formality = informalMarkers > 5 ? 'Casual/Friendly' : informalMarkers > 2 ? 'Semi-Formal' : 'Professional/Academic';

    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const arabicRatio = arabicChars / text.length;
    const language = arabicRatio > 0.5 ? 'Primarily Arabic' : arabicRatio > 0.15 ? 'Mixed Arabic/English' : 'Primarily English';

    return { directness, verbosity, formality, language, avgLength };
}

function analyzeInterests(text) {
    const domains = [
        { domain: 'AI & Machine Learning', pattern: /\b(ai|model|llm|gpt|training|flux|lora|stable diffusion|comfyui|neural|embedding|rag)\b/gi, description: 'AI architecture' },
        { domain: 'Art & Aesthetics', pattern: /\b(art|painting|sculpture|gallery|design|photography|film|cinema|aesthetic)\b/gi, description: 'Visual design' },
        { domain: 'Software Engineering', pattern: /\b(code|react|node|api|bug|npm|python|javascript|backend|frontend|database|deploy|git|docker)\b/gi, description: 'Full-stack development' },
        { domain: 'Research & Academia', pattern: /\b(research|study|paper|theory|hypothesis|experiment|data|analysis|methodology)\b/gi, description: 'Data analysis' },
        { domain: 'Personal Growth', pattern: /\b(psychology|meditation|anxiety|confidence|motivation|wellness|mental health|self-care)\b/gi, description: 'Psychology' }
    ];

    return domains.map(d => ({ domain: d.domain, description: d.description, count: (text.match(d.pattern) || []).length }))
        .filter(r => r.count > 0).sort((a, b) => b.count - a.count);
}

function analyzeTone(text) {
    const analyticalMarkers = (text.match(/\b(compare|analyze|difference|evaluate|metrics|data|evidence|research|statistics)\b/gi) || []).length;
    const creativeMarkers = (text.match(/\b(imagine|create|design|art|beautiful|aesthetic|vision|inspire|story|metaphor|vibe)\b/gi) || []).length;

    const dominant = analyticalMarkers > creativeMarkers ? 'Analytical' : creativeMarkers > analyticalMarkers ? 'Creative' : 'Balanced';
    const curiousMarkers = (text.match(/\?(.*?\?)?/g) || []).length;
    const assertiveness = (text.match(/\b(I want|make|build|fix|implement|عايز|اريد|لازم|ضروري)\b/gi) || []).length;

    return {
        dominant,
        curiosity: curiousMarkers > 5 ? 'High' : 'Low',
        assertiveness: assertiveness > 5 ? 'High' : 'Moderate',
        humor: (text.match(/\b(lol|haha|😂|🤣|joke|funny|sarcastic)\b/gi) || []).length > 2 ? 'Active' : 'Minimal'
    };
}

function getRecommendedTone(style, tone) {
    return `${style.formality === 'Casual/Friendly' ? 'Casual' : 'Professional'}, ${tone.dominant === 'Analytical' ? 'data-driven' : 'imaginative'}`;
}

// ═══════════════════════════════════════════════════════════════════
// 📖 STATE RETRIEVAL
// ═══════════════════════════════════════════════════════════════════
export async function getActiveProfile(username) {
    try {
        const profilePath = path.join(PROFILES_DIR, username || activeUser, 'Psycho_Analysis.md');
        if (await fs.pathExists(profilePath)) return await fs.readFile(profilePath, 'utf-8');
        return '';
    } catch (e) { return ''; }
}

export async function updateManualProfile(username, newMarkdownContent) {
    try {
        const user = username || activeUser;
        const profileDir = path.join(PROFILES_DIR, user);
        await fs.ensureDir(profileDir);
        const profilePath = path.join(profileDir, 'Psycho_Analysis.md');

        await fs.writeFile(profilePath, newMarkdownContent, 'utf-8');
        logger.info(`📝 Manual profile override saved for: ${user}`);
        return true;
    } catch (error) {
        logger.error(`Failed to selectively update profile for ${username}: ${error.message}`);
        return false;
    }
}

export async function getVocabulary(username) {
    try {
        const p = path.join(PROFILES_DIR, username || activeUser, 'Vocabulary_Bank.json');
        if (await fs.pathExists(p)) return await fs.readJson(p);
        return null;
    } catch (e) { return null; }
}

export async function getCoreFacts(username) {
    try {
        const p = path.join(PROFILES_DIR, username || activeUser, 'Core_Facts.json');
        if (await fs.pathExists(p)) return await fs.readJson(p);
        return {};
    } catch (e) { return {}; }
}

export async function saveCoreFact(username, key, value) {
    try {
        const p = path.join(PROFILES_DIR, username || activeUser, 'Core_Facts.json');
        let facts = {};
        if (await fs.pathExists(p)) facts = await fs.readJson(p);
        facts[key] = value;
        await fs.writeJson(p, facts, { spaces: 2 });
        return true;
    } catch (e) { return false; }
}
