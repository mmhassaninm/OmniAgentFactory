/**
 * ============================================================
 *  🏛️ Pantheon Gallery — AI Art Curation Service
 * ============================================================
 *  Scans the local Fooocus output directory for generated images,
 *  reads metadata (prompt, parameters, timestamps), and provides
 *  Vision AI analysis stubs for art style classification,
 *  anatomical fidelity scoring, and composition grading.
 *
 *  Auto-invented by Nexus-Architect Proactive Evolution Daemon.
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import logger from '@nexus/logger';

// ── Config ──────────────────────────────────────────────────
const DEFAULT_OUTPUT_DIR = 'C:/Users/Mostafa/Fooocus/outputs';
const SUPPORTED_FORMATS = ['.png', '.jpg', '.jpeg', '.webp'];
const THUMBNAIL_CACHE = new Map();

// ── Art Style Classification Labels ─────────────────────────
const ART_STYLES = [
    'Greco-Roman Classical', 'Renaissance', 'Baroque', 'Neoclassical',
    'Romantic', 'Pre-Raphaelite', 'Art Nouveau', 'Photorealism',
    'Hyperrealism', 'Academic Art', 'Mannerism', 'Rococo'
];

class PantheonService {
    constructor() {
        this.outputDir = DEFAULT_OUTPUT_DIR;
        this.imageCache = [];
        this.analysisCache = new Map();
        this.isScanning = false;
    }

    // ═══════════════════════════════════════════════════════════
    //  DIRECTORY SCANNING
    // ═══════════════════════════════════════════════════════════

    /**
     * Scans the Fooocus output directory for generated images.
     * Reads file metadata and attempts to extract prompt info
     * from filenames or companion JSON/txt files.
     * @param {{ outputDir?: string, limit?: number }} options
     * @returns {{ images: Array, totalFound: number }}
     */
    scan(options = {}) {
        const scanDir = options.outputDir || this.outputDir;
        const limit = options.limit || 100;
        this.isScanning = true;

        logger.info(`🏛️ [PANTHEON] Scanning: ${scanDir}`);
        const images = [];

        try {
            if (!fs.existsSync(scanDir)) {
                logger.warn(`🏛️ [PANTHEON] Output directory not found: ${scanDir}`);
                this.isScanning = false;
                return { images: [], totalFound: 0, error: 'Directory not found' };
            }

            this._scanRecursive(scanDir, images, 3); // Max 3 levels deep

            // Sort newest first
            images.sort((a, b) => b.modifiedMs - a.modifiedMs);

            // Apply limit
            const result = images.slice(0, limit);
            this.imageCache = result;

            logger.info(`🏛️ [PANTHEON] Found ${images.length} images, returning ${result.length}`);
            this.isScanning = false;
            return { images: result, totalFound: images.length };
        } catch (err) {
            logger.error(`🏛️ [PANTHEON] Scan error: ${err.message}`);
            this.isScanning = false;
            return { images: [], totalFound: 0, error: err.message };
        }
    }

    _scanRecursive(dirPath, accumulated, maxDepth, depth = 0) {
        if (depth > maxDepth) return;
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    this._scanRecursive(fullPath, accumulated, maxDepth, depth + 1);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (SUPPORTED_FORMATS.includes(ext)) {
                        const stat = fs.statSync(fullPath);
                        const hash = crypto.createHash('md5').update(fullPath).digest('hex').slice(0, 12);

                        // Try to extract prompt from companion files
                        const promptInfo = this._extractPrompt(fullPath, entry.name);

                        accumulated.push({
                            id: hash,
                            fileName: entry.name,
                            filePath: fullPath,
                            directory: path.basename(dirPath),
                            ext,
                            sizeKB: Math.round(stat.size / 1024),
                            modified: stat.mtime.toISOString(),
                            modifiedMs: stat.mtimeMs,
                            prompt: promptInfo.prompt,
                            negativePrompt: promptInfo.negativePrompt,
                            parameters: promptInfo.parameters,
                            // Vision AI analysis fields (to be populated by analyzeImage)
                            analysis: this.analysisCache.get(hash) || null
                        });
                    }
                }
            }
        } catch { /* skip unreadable dirs */ }
    }

    /**
     * Attempts to extract prompt metadata from companion files or filename.
     * Fooocus typically saves metadata in the filename or companion .json files.
     */
    _extractPrompt(filePath, fileName) {
        const result = { prompt: '', negativePrompt: '', parameters: {} };

        // Check for companion JSON file
        const jsonPath = filePath.replace(/\.\w+$/, '.json');
        if (fs.existsSync(jsonPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                result.prompt = meta.prompt || meta.positive_prompt || '';
                result.negativePrompt = meta.negative_prompt || '';
                result.parameters = {
                    model: meta.model || meta.base_model || 'Unknown',
                    seed: meta.seed,
                    steps: meta.steps,
                    cfg: meta.cfg || meta.guidance_scale,
                    sampler: meta.sampler,
                    size: meta.size || `${meta.width}x${meta.height}`,
                    style: meta.style || meta.styles?.[0] || 'Default'
                };
                return result;
            } catch { /* ignore parse errors */ }
        }

        // Check for companion .txt log
        const txtPath = filePath.replace(/\.\w+$/, '.txt');
        if (fs.existsSync(txtPath)) {
            try {
                const content = fs.readFileSync(txtPath, 'utf-8');
                const lines = content.split('\n');
                result.prompt = lines[0] || fileName;
                if (lines.length > 1) {
                    result.negativePrompt = lines.find(l => l.startsWith('Negative')) || '';
                }
                return result;
            } catch { /* ignore */ }
        }

        // Fallback: use filename as prompt hint
        result.prompt = fileName
            .replace(/\.\w+$/, '')
            .replace(/[-_]/g, ' ')
            .replace(/\d{10,}/g, '')
            .trim() || 'Unknown Prompt';

        return result;
    }

    // ═══════════════════════════════════════════════════════════
    //  VISION AI ANALYSIS (Architecture Ready)
    // ═══════════════════════════════════════════════════════════

    /**
     * Analyzes a single image using the Dual-Provider Vision AI.
     * Detects art style, anatomical accuracy, and composition quality.
     * @param {{ imageId: string, filePath: string }} params
     * @returns {Promise<object>} Analysis result
     */
    async analyzeImage(params) {
        const { imageId, filePath } = params;

        // Return cached if available
        if (this.analysisCache.has(imageId)) {
            return this.analysisCache.get(imageId);
        }

        logger.info(`🏛️ [PANTHEON] Analyzing: ${path.basename(filePath)}`);

        try {
            // Read image as base64
            const buffer = fs.readFileSync(filePath);
            const base64 = buffer.toString('base64');
            const ext = path.extname(filePath).replace('.', '');
            const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

            const aiServiceModule = await import('./aiService.js');
            const aiService = aiServiceModule.default;

            const prompt = `You are an expert classical art critic and AI art analyst. Analyze this AI-generated artwork and provide ONLY a JSON response with these fields:

{
  "artStyle": "Primary art style detected (e.g., Greco-Roman Classical, Renaissance, Baroque, etc.)",
  "artPeriodConfidence": 0.0-1.0,
  "anatomicalScore": 0-100,
  "anatomicalNotes": "Brief note on anatomical accuracy (proportions, hands, faces, musculature)",
  "compositionScore": 0-100,
  "compositionNotes": "Brief note on composition (rule of thirds, golden ratio, focal point)",
  "colorPalette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "dominantMood": "One word mood (Majestic, Serene, Dramatic, etc.)",
  "overallRating": 0-100
}

Output ONLY valid JSON. No explanation, no markdown.`;

            const result = await aiService.prompt(null, {
                text: prompt,
                type: 'vision_analysis',
                image: `data:${mime};base64,${base64}`,
                urgency: 'high'
            });

            if (result?.success && result?.response) {
                let text = result.response.trim();
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const analysis = JSON.parse(jsonMatch[0]);
                    analysis.analyzedAt = new Date().toISOString();
                    this.analysisCache.set(imageId, analysis);

                    // Also update the cached image list
                    const cached = this.imageCache.find(i => i.id === imageId);
                    if (cached) cached.analysis = analysis;

                    logger.info(`🏛️ [PANTHEON] Analysis complete: ${analysis.artStyle} (${analysis.overallRating}/100)`);
                    return analysis;
                }
            }

            // Fallback stub when AI is unavailable
            return this._generateStubAnalysis(imageId);
        } catch (err) {
            logger.warn(`🏛️ [PANTHEON] Vision analysis failed: ${err.message}`);
            return this._generateStubAnalysis(imageId);
        }
    }

    /**
     * Generates a stub analysis for when the Vision AI is unavailable.
     * Uses deterministic hashing for consistent pseudo-random scores.
     */
    _generateStubAnalysis(imageId) {
        const hashNum = parseInt(imageId.slice(0, 8), 16);
        const styleIdx = hashNum % ART_STYLES.length;

        const stub = {
            artStyle: ART_STYLES[styleIdx],
            artPeriodConfidence: 0.5 + (hashNum % 50) / 100,
            anatomicalScore: 55 + (hashNum % 40),
            anatomicalNotes: 'Awaiting Vision AI analysis',
            compositionScore: 60 + (hashNum % 35),
            compositionNotes: 'Awaiting Vision AI analysis',
            colorPalette: ['#8B7355', '#C9B896', '#4A3728', '#D4C5A9', '#2C1810'],
            dominantMood: ['Majestic', 'Serene', 'Dramatic', 'Ethereal', 'Sublime'][hashNum % 5],
            overallRating: 60 + (hashNum % 35),
            analyzedAt: new Date().toISOString(),
            isStub: true
        };

        this.analysisCache.set(imageId, stub);
        return stub;
    }

    // ═══════════════════════════════════════════════════════════
    //  PUBLIC API
    // ═══════════════════════════════════════════════════════════

    /** Get cached images (no rescan). */
    getImages(options = {}) {
        const filter = options.filter || 'all';
        let images = [...this.imageCache];

        if (filter !== 'all' && filter) {
            images = images.filter(img =>
                img.analysis?.artStyle?.toLowerCase().includes(filter.toLowerCase())
            );
        }

        return { images, total: images.length };
    }

    /** Get a single image with full details. */
    getImage(imageId) {
        return this.imageCache.find(i => i.id === imageId) || null;
    }

    /** Update the output directory path. */
    setOutputDir(dirPath) {
        this.outputDir = dirPath;
        logger.info(`🏛️ [PANTHEON] Output directory updated: ${dirPath}`);
        return { success: true, outputDir: dirPath };
    }

    /** Get service status. */
    getStatus() {
        return {
            outputDir: this.outputDir,
            cachedImages: this.imageCache.length,
            analyzedImages: this.analysisCache.size,
            isScanning: this.isScanning
        };
    }
}

export default new PantheonService();
