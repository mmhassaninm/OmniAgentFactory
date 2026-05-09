// ═══════════════════════════════════════════════════════════════
//  🔍 NEXUS FACT-CHECKER — Post-Generation Verification Engine
//  Sends the AI's draft response back for a second verification
//  pass to catch hallucinations, outdated info, and inaccuracies.
// ═══════════════════════════════════════════════════════════════

const IS_ELECTRON = typeof window !== 'undefined' && !!window.nexusAPI;
const LM_STUDIO_BASE = IS_ELECTRON ? 'http://127.0.0.1:1234' : '/lmstudio';
const LM_STUDIO_URL = `${LM_STUDIO_BASE}/v1/chat/completions`;

/**
 * Verify an AI response for accuracy using a second LLM pass.
 *
 * @param {string} userQuery - The original user question
 * @param {string} aiResponse - The AI's generated response
 * @param {string} searchContext - Web search context used (if any)
 * @param {string} model - The model to use for verification
 * @returns {Promise<{verified: boolean, corrections: string|null, confidence: number}>}
 */
export async function verifyResponse(userQuery, aiResponse, searchContext = '', model = 'local-model') {
    // Skip verification for very short responses or greetings
    if (!aiResponse || aiResponse.length < 100) {
        return { verified: true, corrections: null, confidence: 1.0 };
    }

    const isArabic = /[\u0600-\u06FF]/.test(userQuery);
    const lang = isArabic ? 'Arabic' : 'English';

    const verifierPrompt = `You are a FACT-CHECKER AI. Your job is to verify the accuracy of an AI assistant's response.

RULES:
1. Check for factual errors, hallucinations, outdated information, or logical inconsistencies.
2. Check if the response actually answers the user's question.
3. If the response tells the user to "go search" instead of answering directly, flag it.
4. Respond in ${lang} ONLY.
5. Be BRIEF — max 2-3 sentences for corrections.

Output STRICTLY this JSON format:
{
  "verified": true/false,
  "confidence": 0.0-1.0,
  "issues": "Brief description of issues found, or null if verified"
}`;

    const messages = [
        { role: 'system', content: verifierPrompt },
        { role: 'user', content: `[USER QUESTION]: ${userQuery}\n\n[AI RESPONSE TO VERIFY]:\n${aiResponse.substring(0, 2000)}\n\n${searchContext ? `[SEARCH CONTEXT USED]:\n${searchContext.substring(0, 1000)}` : '[NO SEARCH CONTEXT]'}` }
    ];

    try {
        const response = await fetch(LM_STUDIO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.1,
                max_tokens: 300,
                stream: false,
            }),
            signal: AbortSignal.timeout(15000), // 15s timeout for verification
        });

        if (!response.ok) {
            console.warn('[FactChecker] LM Studio returned', response.status);
            return { verified: true, corrections: null, confidence: 0.5 };
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        // Parse the JSON response
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                return {
                    verified: result.verified !== false,
                    corrections: result.issues || null,
                    confidence: typeof result.confidence === 'number' ? result.confidence : 0.7,
                };
            }
        } catch {
            // If JSON parsing fails, try to extract meaning from raw text
            const hasIssue = /false|incorrect|inaccurate|wrong|error|hallucin/i.test(content);
            return {
                verified: !hasIssue,
                corrections: hasIssue ? content.substring(0, 300) : null,
                confidence: 0.5,
            };
        }

        return { verified: true, corrections: null, confidence: 0.7 };
    } catch (err) {
        console.warn('[FactChecker] Verification failed:', err.message);
        // On timeout or error, don't block the response
        return { verified: true, corrections: null, confidence: 0.5 };
    }
}

/**
 * Format fact-checker results as a markdown annotation.
 * @param {{verified: boolean, corrections: string|null, confidence: number}} result
 * @param {boolean} isArabic
 * @returns {string|null} Markdown string to append, or null if verified
 */
export function formatVerification(result, isArabic = false) {
    if (result.verified || !result.corrections) return null;

    if (isArabic) {
        return `\n\n> ⚠️ **تحقق الذكاء الاصطناعي**: ${result.corrections}\n> _الثقة: ${Math.round(result.confidence * 100)}%_`;
    }
    return `\n\n> ⚠️ **AI Fact-Check**: ${result.corrections}\n> _Confidence: ${Math.round(result.confidence * 100)}%_`;
}
