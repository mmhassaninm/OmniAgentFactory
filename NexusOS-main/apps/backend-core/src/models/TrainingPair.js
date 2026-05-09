/**
 * ============================================================
 *  TrainingPair Model (Mongoose/NeDB Schema)
 * ============================================================
 *  Represents a single training data pair for Neural Forge.
 *  Used for RAG, LoRA prep, and passive knowledge harvesting.
 * ============================================================
 */

export const TrainingPairSchema = {
    instruction: '',    // The question or prompt
    response: '',       // The answer or completion
    context: '',        // Optional surrounding context
    source: 'manual',   // 'manual' | 'harvest' | 'chat' | 'ledger'
    tags: [],           // Categorization tags
    quality: 1.0,       // Quality score (0.0 - 1.0)
    createdAt: null,
    updatedAt: null
};

/**
 * Creates a validated TrainingPair document.
 */
export function createTrainingPair({ instruction, response, context = '', source = 'manual', tags = [], quality = 1.0 }) {
    if (!instruction || !response) {
        throw new Error('TrainingPair requires both instruction and response fields.');
    }
    return {
        instruction: instruction.trim(),
        response: response.trim(),
        context: context.trim(),
        source,
        tags,
        quality: Math.max(0, Math.min(1, quality)),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}
