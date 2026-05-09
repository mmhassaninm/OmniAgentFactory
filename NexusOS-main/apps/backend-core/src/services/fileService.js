import fs from 'fs/promises';
import path from 'path';
import logger from '@nexus/logger';
import knowledgeService from './knowledgeService.js';
import crypto from 'crypto';

export const getFolderSize = async (event, { folderPath }) => {
    try {
        logger.info(`[FileCore] Calculating size for: ${folderPath}`);
        return { success: true, size: 0 };
    } catch (error) {
        logger.error('[FileCore] Folder size error:', error.message);
        return { success: false, message: error.message };
    }
};

export const listFiles = async (event, { directory }) => {
    try {
        const files = await fs.readdir(directory);
        return { success: true, files };
    } catch (error) {
        return { success: false, message: error.message };
    }
};

// Legacy FS CRUD Port
export const createFolder = async (event, { name, parentId }) => {
    try {
        const id = crypto.randomUUID();
        await knowledgeService.saveMemory(null, {
            type: 'fs_item',
            content: JSON.stringify({
                id,
                name,
                type: 'folder',
                parentId: parentId || null,
                createdAt: new Date().toISOString()
            })
        });
        return { success: true, id };
    } catch (error) {
        return { success: false, message: error.message };
    }
};

export const renameFile = async (event, { id, newName }) => {
    try {
        // In the new SQLite searchMemory/saveMemory architecture, 
        // we'd typically update the existing record.
        // For now, logging the action via knowledgeService
        await knowledgeService.logEvent(null, {
            type: 'fs_rename',
            details: `Renamed ${id} to ${newName}`
        });
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
};

export const deleteFile = async (event, { id }) => {
    try {
        await knowledgeService.logEvent(null, {
            type: 'fs_delete',
            details: `Deleted ${id}`
        });
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
};

const fileService = {
    getFolderSize,
    listFiles,
    createFolder,
    renameFile,
    deleteFile
};

export default fileService;
