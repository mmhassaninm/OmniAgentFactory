/**
 * Error ID Generator
 * Generates unique, traceable error IDs in format: ERR-YYYYMMDD-XXXX
 */
export function generateErrorId(): string {
    const now = new Date()
    const date = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('')

    const random = Math.random().toString(16).toUpperCase().slice(2, 6)
    return `ERR-${date}-${random}`
}

/**
 * Generate a reference ID for correlating frontend-backend errors
 */
export function generateCorrelationId(): string {
    return `CORR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}