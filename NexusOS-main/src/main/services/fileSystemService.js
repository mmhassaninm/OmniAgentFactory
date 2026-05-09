const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../utils/logger');

// ── Nexus OS Storage Root ──────────────────────────────
const NEXUS_STORAGE_ROOT = 'D:\\NexusOS-main-Storage';

const QUICK_ACCESS_FOLDERS = [
    { name: 'Desktop', icon: 'monitor' },
    { name: 'Documents', icon: 'file-text' },
    { name: 'Downloads', icon: 'download' },
    { name: 'Pictures', icon: 'image' },
    { name: 'Music', icon: 'music' },
    { name: 'Videos', icon: 'video' },
];

class FileSystemService {
    constructor() {
        this.defaultPath = NEXUS_STORAGE_ROOT;
        this._ensureStorageRoot();
    }

    /**
     * Ensure the NexusOS storage root and its sub-folders exist on disk.
     */
    _ensureStorageRoot() {
        try {
            if (!fsSync.existsSync(NEXUS_STORAGE_ROOT)) {
                fsSync.mkdirSync(NEXUS_STORAGE_ROOT, { recursive: true });
                logger.info('FileSystem', `Created NexusOS Storage Root: ${NEXUS_STORAGE_ROOT}`);
            }
            for (const folder of QUICK_ACCESS_FOLDERS) {
                const folderPath = path.join(NEXUS_STORAGE_ROOT, folder.name);
                if (!fsSync.existsSync(folderPath)) {
                    fsSync.mkdirSync(folderPath, { recursive: true });
                    logger.info('FileSystem', `Created Quick Access Folder: ${folderPath}`);
                }
            }
        } catch (err) {
            logger.error('FileSystem', `Failed to initialize storage root: ${err.message}`);
        }
    }

    /**
     * Detect real available drives on Windows ; fallback to ['/'] on other OSes.
     */
    async getSystemDrives() {
        if (process.platform === 'win32') {
            const drives = [];
            // Scan letters A-Z
            for (let i = 65; i <= 90; i++) {
                const letter = String.fromCharCode(i);
                const drivePath = `${letter}:\\`;
                try {
                    await fs.access(drivePath);
                    // Get drive stats for size info
                    let label = 'Local Disk';
                    let totalSize = 0;
                    let freeSpace = 0;
                    try {
                        const stats = await fs.statfs(drivePath);
                        totalSize = stats.bsize * stats.blocks;
                        freeSpace = stats.bsize * stats.bfree;
                    } catch { /* statfs may not be available */ }

                    drives.push({
                        letter,
                        path: drivePath,
                        label: `${label} (${letter}:)`,
                        totalSize,
                        freeSpace,
                        usedSize: totalSize - freeSpace,
                    });
                } catch {
                    // Drive not accessible, skip
                }
            }
            return drives;
        }
        return [{ letter: '/', path: '/', label: 'Root', totalSize: 0, freeSpace: 0, usedSize: 0 }];
    }

    /**
     * Return the Nexus storage root path.
     */
    getStorageRoot() {
        return NEXUS_STORAGE_ROOT;
    }

    /**
     * Return Quick Access folders with their full paths and icons.
     */
    getQuickAccess() {
        return QUICK_ACCESS_FOLDERS.map(f => ({
            ...f,
            path: path.join(NEXUS_STORAGE_ROOT, f.name),
        }));
    }

    async listDirectory(targetPath) {
        try {
            const currentPath = targetPath || this.defaultPath;
            logger.info('FileSystem', `Listing directory: ${currentPath}`);
            const items = await fs.readdir(currentPath, { withFileTypes: true });

            const result = items.map(item => ({
                name: item.name,
                isDirectory: item.isDirectory(),
                isFile: item.isFile(),
                path: path.join(currentPath, item.name),
                extension: path.extname(item.name).toLowerCase()
            }));

            // Sort: folders first, then files alphabetically
            return result.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });
        } catch (error) {
            logger.error('FileSystem', `Error listing directory ${targetPath}: ${error.message}`);
            return { error: error.message };
        }
    }

    async readFile(filePath, format = 'utf8') {
        try {
            logger.info('FileSystem', `Reading file: ${filePath}`);
            if (format === 'base64') {
                const data = await fs.readFile(filePath, { encoding: 'base64' });
                const ext = path.extname(filePath).toLowerCase().substring(1);
                return `data:image/${ext};base64,${data}`;
            }
            const data = await fs.readFile(filePath, { encoding: 'utf8' });
            return data;
        } catch (error) {
            logger.error('FileSystem', `Error reading file ${filePath}: ${error.message}`);
            return { error: error.message };
        }
    }

    async getHomeDir() {
        return NEXUS_STORAGE_ROOT;
    }

    async writeFile(filePath, content) {
        try {
            logger.info('FileSystem', `Writing file: ${filePath}`);
            const dir = path.dirname(filePath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(filePath, content, { encoding: 'utf8' });
            return { success: true, path: filePath };
        } catch (error) {
            logger.error('FileSystem', `Error writing file ${filePath}: ${error.message}`);
            return { error: error.message };
        }
    }

    async getFileStat(filePath) {
        try {
            const stat = await fs.stat(filePath);
            return {
                size: stat.size,
                isDirectory: stat.isDirectory(),
                isFile: stat.isFile(),
                modified: stat.mtime.toISOString(),
                created: stat.birthtime.toISOString()
            };
        } catch (error) {
            logger.error('FileSystem', `Error getting stat ${filePath}: ${error.message}`);
            return { error: error.message };
        }
    }
}

module.exports = new FileSystemService();
