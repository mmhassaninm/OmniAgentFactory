const { app, Tray, Menu, nativeImage, BrowserWindow, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const backupDaemon = require('./daemons/backupDaemon');
const vaultMonitor = require('./daemons/vaultMonitor');

class TrayManager {
    constructor() {
        this.tray = null;
    }

    init() {
        console.log('[TrayManager] Initializing Native System Tray...');

        let iconPath = path.join(__dirname, '..', '..', 'build', 'icon.ico');
        let trayIcon = nativeImage.createEmpty();

        try {
            const img = nativeImage.createFromPath(iconPath);
            if (!img.isEmpty()) {
                trayIcon = img.resize({ width: 32, height: 32 });
            } else {
                console.warn('[TrayManager] icon.ico is empty, using fallback.');
            }
        } catch (e) {
            console.warn('[TrayManager] Icon not found, using invisible fallback.');
        }

        this.tray = new Tray(trayIcon);
        this.tray.setToolTip('NexusOS — Advanced Operating System');

        // Phase 23: Default to English, but immediately read settings to rebuild with correct language
        this.rebuildMenu('en');
        const settingsService = require('./services/settingsService');
        settingsService.getLanguage().then(lang => {
            this.rebuildMenu(lang);
        }).catch(err => {
            console.error('[TrayManager] Failed to read initial language:', err);
        });

        // Double-click on tray icon = show the window
        this.tray.on('double-click', () => {
            const wins = BrowserWindow.getAllWindows();
            if (wins.length > 0) {
                wins[0].show();
                wins[0].focus();
            }
        });
    }

    rebuildMenu(lang) {
        if (!this.tray) return;

        console.log(`[TrayManager] Rebuilding context menu for language: ${lang}`);

        const locales = require('./locales');
        const t = locales[lang] || locales['en'];

        const contextMenu = Menu.buildFromTemplate([
            // ── Show Main Window ──
            {
                label: '✨ ' + t.tray.show,
                click: () => {
                    const wins = BrowserWindow.getAllWindows();
                    if (wins.length > 0) {
                        wins[0].show();
                        wins[0].focus();
                    }
                }
            },
            { type: 'separator' },

            // ── System Actions Submenu ──
            {
                label: '⚡ System Actions',
                submenu: [
                    {
                        label: '🔄 Restart Renderer',
                        click: () => {
                            const wins = BrowserWindow.getAllWindows();
                            if (wins.length > 0) wins[0].reload();
                        }
                    },
                    {
                        label: '🖥️ Toggle DevTools',
                        click: () => {
                            const wins = BrowserWindow.getAllWindows();
                            if (wins.length > 0) wins[0].webContents.toggleDevTools();
                        }
                    },
                    {
                        label: '📁 Open Storage Folder',
                        click: () => {
                            const storagePath = path.join('D:', 'NexusOS-main-Storage');
                            shell.openPath(storagePath);
                        }
                    },
                    {
                        label: '📂 Open Project Folder',
                        click: () => {
                            shell.openPath(path.join(__dirname, '..', '..'));
                        }
                    }
                ]
            },
            { type: 'separator' },

            // ── Show System Logs ──
            {
                label: '📜 Show System Logs',
                click: () => {
                    const wins = BrowserWindow.getAllWindows();
                    if (wins.length > 0) {
                        wins[0].show();
                        wins[0].focus();
                        wins[0].webContents.send('os:launch', { id: 'sentinel-viewer', title: 'System Logs' });
                    }
                }
            },
            {
                label: '📋 Open Log File',
                click: () => {
                    try {
                        const logPath = path.join(app.getPath('userData'), 'logs', 'nexus_os.log');
                        shell.openPath(logPath);
                    } catch (e) {
                        console.error('[TrayManager] Could not open log file:', e);
                    }
                }
            },
            { type: 'separator' },

            // ── Apps Quick Launch ──
            {
                label: '🚀 Quick Launch',
                submenu: [
                    {
                        label: '💬 Nexus Chat',
                        click: () => {
                            const wins = BrowserWindow.getAllWindows();
                            if (wins.length > 0) {
                                wins[0].show(); wins[0].focus();
                                wins[0].webContents.send('os:launch', { id: 'chat', title: 'Nexus Chat' });
                            }
                        }
                    },
                    {
                        label: '📊 System Monitor',
                        click: () => {
                            const wins = BrowserWindow.getAllWindows();
                            if (wins.length > 0) {
                                wins[0].show(); wins[0].focus();
                                wins[0].webContents.send('os:launch', { id: 'monitor', title: 'System Monitor' });
                            }
                        }
                    },
                    {
                        label: '⚙️ Settings',
                        click: () => {
                            const wins = BrowserWindow.getAllWindows();
                            if (wins.length > 0) {
                                wins[0].show(); wins[0].focus();
                                wins[0].webContents.send('os:launch', { id: 'settings', title: 'Settings' });
                            }
                        }
                    },
                    {
                        label: '📁 My Files',
                        click: () => {
                            const wins = BrowserWindow.getAllWindows();
                            if (wins.length > 0) {
                                wins[0].show(); wins[0].focus();
                                wins[0].webContents.send('os:launch', { id: 'explorer', title: 'My Files' });
                            }
                        }
                    }
                ]
            },
            { type: 'separator' },

            // ── System Info ──
            {
                label: 'ℹ️ About NexusOS',
                click: () => {
                    const { dialog } = require('electron');
                    dialog.showMessageBox({
                        type: 'info',
                        title: 'About NexusOS',
                        message: 'NexusOS — Advanced AI Operating System',
                        detail: `Version: 1.0.0\nElectron: ${process.versions.electron}\nNode.js: ${process.versions.node}\nChromium: ${process.versions.chrome}\nV8: ${process.versions.v8}`,
                        buttons: ['OK']
                    });
                }
            },
            { type: 'separator' },

            // ── Quit ──
            {
                label: '⚠️ ' + t.tray.quit,
                click: () => this.nuclearCleanupAndExit()
            }
        ]);

        this.tray.setContextMenu(contextMenu);
    }

    // Phase 13: The Nuclear Cleanup Protocol
    nuclearCleanupAndExit() {
        console.warn('⚠️ [TrayManager] Nuclear Cleanup Protocol Initiated.');

        // 1. Stop all Daemons
        console.log('Stopping Backup Daemon...');
        backupDaemon.stop();

        console.log('Stopping Vault Monitor...');
        vaultMonitor.stop();

        // 2. Kill orphan Python processes if any (Windows specific logic)
        console.log('Clearing Python Orphan Processes...');
        exec('taskkill /F /IM python.exe /T', (err) => {
            if (err) console.log('No Python processes to kill.');

            console.log('Nuclear Cleanup Complete. Committing Suicide.');
            app.quit();
            process.exit(0);
        });
    }
}

module.exports = new TrayManager();
