// ═══════════════════════════════════════════════════════════════
//  👤 OWNER PROFILE — Deep User Dossier for NexusChat
//  Compiled from Vibelab's Knowledge_Vault, Style_DNA, and
//  conversation history analysis. This module provides the AI
//  with deep understanding of the owner's identity, style,
//  expertise, and communication patterns.
// ═══════════════════════════════════════════════════════════════

/**
 * Get the comprehensive owner profile.
 * This is injected into the system prompt to give the AI
 * deep knowledge about who it's talking to.
 */
export function getOwnerProfile() {
    return OWNER_PROFILE;
}

/**
 * Build a compact context string for system prompt injection.
 * Keeps it concise to avoid wasting tokens, but information-dense.
 */
export function getOwnerContextForPrompt() {
    const p = OWNER_PROFILE;
    const sections = [];

    // Identity
    sections.push(`[OWNER IDENTITY]
Name: ${p.identity.name} (${p.identity.nameArabic})
Role: ${p.identity.role}
Organization: ${p.identity.organization}
Projects: ${p.identity.projects.join(', ')}`);

    // Communication Style
    sections.push(`[COMMUNICATION STYLE]
Language: ${p.communication.primaryLanguage}
Dialect: ${p.communication.dialect}
Message Style: ${p.communication.averageWordsPerMessage} words avg, direct and practical
Common Phrases: ${p.communication.commonPhrases.slice(0, 15).join(', ')}
Favorite Emojis: ${p.communication.topEmojis.join(' ')}
INTERPRETATION RULES — when the owner says:
${p.communication.dialectGuide.map(d => `  "${d.phrase}" → means: ${d.meaning}`).join('\n')}`);

    // Expertise
    sections.push(`[EXPERTISE MAP]
${p.expertise.map(e => `• ${e.area}: ${e.level}`).join('\n')}`);

    // Interests
    sections.push(`[INTERESTS & CONTEXT]
${p.interests.map(i => `• ${i}`).join('\n')}`);

    // Personality
    sections.push(`[PERSONALITY TRAITS]
${p.personality.map(t => `• ${t}`).join('\n')}`);

    // Interaction Rules
    sections.push(`[HOW TO RESPOND TO THIS USER]
${p.interactionRules.map(r => `• ${r}`).join('\n')}`);

    return '\n\n' + sections.join('\n\n');
}

// ═══════════════════════════════════════════════════════════════
//  THE DOSSIER — Compiled from ALL Vibelab data sources
// ═══════════════════════════════════════════════════════════════
const OWNER_PROFILE = {
    identity: {
        name: 'Moustafa Mohamed',
        nameArabic: 'مصطفى محمد',
        nickname: 'Mostafa',
        role: 'Researcher & Artist',
        organization: 'Catalyst Technologies',
        projects: ['NexusOS', 'Vibelab', 'Fooocus AI Art'],
        github: 'NexusOS-main',
    },

    communication: {
        primaryLanguage: 'Arabic',
        secondaryLanguage: 'English',
        dialect: 'Egyptian Arabic (عامية مصرية)',
        averageWordsPerMessage: 7,
        // From Style_DNA.json — most used words (filtered)
        topWords: [
            'فى', 'البشرة', 'من', 'على', 'في', 'انا', 'ده', 'اية',
            'بس', 'اللى', 'كده', 'مش', 'دى', 'عايز', 'هو', 'طيب',
            'العناية', 'نوع', 'المنتج',
        ],
        // From Style_DNA.json — common phrases
        commonPhrases: [
            'اية ؟', 'كده', 'عايز', 'مش', 'بس', 'طيب', 'فاهمنى ؟',
            'تمام', 'ده', 'دى', 'اللى', 'هو', 'انا', 'ازاى',
            'عايز تطوير نووى', 'راجع دستورك', 'امشى',
        ],
        // Top emojis from both Style_DNA files
        topEmojis: ['😂', '❤', '💧', '😘', '🔹', '🎂', '🥳', '🎉', '✅', '🔥'],

        // Egyptian Arabic dialect interpretation guide
        dialectGuide: [
            { phrase: 'عايز', meaning: 'wants/needs (masculine)' },
            { phrase: 'كده', meaning: 'like this / that\'s it' },
            { phrase: 'مش', meaning: 'not / isn\'t' },
            { phrase: 'بس', meaning: 'but / just / enough' },
            { phrase: 'ده', meaning: 'this (masculine)' },
            { phrase: 'دى / دي', meaning: 'this (feminine)' },
            { phrase: 'اللى', meaning: 'which / that (relative pronoun)' },
            { phrase: 'طيب', meaning: 'okay / alright' },
            { phrase: 'اية / ايه', meaning: 'what?' },
            { phrase: 'ازاى / إزاي', meaning: 'how?' },
            { phrase: 'فاهمنى', meaning: 'do you understand me?' },
            { phrase: 'امشى', meaning: 'go ahead / proceed' },
            { phrase: 'يعنى', meaning: 'meaning / it means' },
            { phrase: 'خلاص', meaning: 'done / that\'s it / enough' },
            { phrase: 'ليه', meaning: 'why?' },
            { phrase: 'فين', meaning: 'where?' },
            { phrase: 'عشان', meaning: 'because / in order to' },
            { phrase: 'بقى', meaning: 'so / then (transition word)' },
            { phrase: 'يا باشا', meaning: 'dude / bro (friendly address)' },
            { phrase: 'تطوير نووى', meaning: 'nuclear-level innovation / major upgrade' },
            { phrase: 'راجع دستورك', meaning: 'review your constitution/rules' },
            { phrase: 'مظبوط', meaning: 'correct / right' },
            { phrase: 'بايظ', meaning: 'broken / messed up' },
            { phrase: 'اتكلم ازاى', meaning: 'how do I speak / my communication style' },
        ],

        toneVectors: {
            directness: 'High — prefers short, direct messages',
            technicality: 'Medium — switches between casual and technical',
            curiosity: 'High — constantly exploring new tools and ideas',
            patience: 'Low — wants solutions, not lectures',
        },
    },

    expertise: [
        { area: 'AI & Machine Learning', level: 'Advanced — builds AI-powered applications, trains models' },
        { area: 'Web Development (React, Node.js)', level: 'Advanced — full-stack developer' },
        { area: 'Electron Desktop Apps', level: 'Advanced — building NexusOS' },
        { area: 'NexusOS Architecture', level: 'Creator — designed and built the entire system' },
        { area: 'LM Studio & Local AI', level: 'Expert — runs local LLMs for chat intelligence' },
        { area: 'AI Image Generation', level: 'Advanced — Fooocus, Stable Diffusion, prompt engineering' },
        { area: 'UI/UX Design', level: 'Strong — designs premium, glassmorphism interfaces' },
        { area: 'Digital Security', level: 'Knowledgeable — internet security, VPN, router configuration' },
        { area: 'Skincare & Beauty', level: 'Knowledgeable — product analysis, ingredient research' },
        { area: 'Arabic NLP', level: 'Practical — dual-language support in all projects' },
    ],

    interests: [
        'Building NexusOS — a custom desktop operating system in Electron',
        'AI-powered tools and assistants',
        'Image generation AI (Fooocus, Stable Diffusion, Midjourney)',
        'Video generation AI (Kling, Seedance, Veo)',
        'Local AI models and LM Studio',
        'Digital security and privacy (VPN, encryption, router security)',
        'Skincare products and beauty (البشرة، العناية)',
        'Egyptian culture and identity',
        'Open-source development',
        'Prompt engineering for AI art',
    ],

    personality: [
        'Direct and practical — prefers working solutions over theoretical explanations',
        'Ambitious innovator — always pushes for "nuclear-level" improvements',
        'Quality-obsessed — demands premium, polished output',
        'Bilingual thinker — thinks in Egyptian Arabic, codes in English',
        'Fast-paced — short messages, expects quick responses',
        'Hands-on learner — learns by doing, not reading docs',
        'Detail-oriented when it matters — especially in UI/UX',
        'Perfectionist with aesthetic taste — rejects "basic" or "simple" solutions',
    ],

    interactionRules: [
        'ALWAYS respond in Egyptian Arabic when the user writes in Arabic',
        'Keep responses concise — match the user\'s short message style',
        'Be direct and actionable — skip long introductions',
        'When the user says "تطوير نووى" — go all-in with maximum innovation',
        'When the user says "راجع دستورك" — re-read PROJECT_INSTRUCTIONS.md',
        'When the user says "فاهمنى" — confirm understanding and summarize the plan',
        'When the user says "امشى" — proceed with execution immediately',
        'Prioritize code and results over explanations',
        'Use emojis sparingly — the user uses them casually',
        'Never suggest cloud services unless asked — user prefers local-first architecture',
        'Understand that skincare references (البشرة, العناية) are real interests, not noise data',
    ],

    // Additional context from Vibelab conversation history
    knownFacts: [
        'Uses Windows as primary OS',
        'Has a Lenovo LOQ laptop (RTX 4050/4060)',
        'Uses Fooocus for AI image generation',
        'Expert in prompt engineering - knows weights, guidance scale, styles',
        'Has experience with WhatsApp chatbot development',
        'Interested in internet security and router configuration',
        'Previously built Vibelab — a full chat application with AI features',
        'Prefers "Premium" and "State-of-the-art" designs',
        'Uses pnpm workspaces for monorepo management',
        'Familiar with MongoDB, SQLite, NeDB for data storage',
        'Has family (wife, sister) based on WhatsApp chat data',
        'Strong Egyptian cultural identity',
    ],
};

export default OWNER_PROFILE;
