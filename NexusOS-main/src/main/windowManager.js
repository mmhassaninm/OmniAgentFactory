const { BrowserWindow, app } = require('electron');
const path = require('path');
const logger = require('./utils/logger');

let mainWindow = null;

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false, // Don't show until ready-to-show to prevent flickering
        backgroundColor: '#050505', // Phase 32.4: Step 19 - Dark Mode Flash Prevention
        frame: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true, // Phase 32.2: Step 8 - Sandbox Enforcement
            preload: path.join(__dirname, '..', 'preload', 'index.js')
        }
    });

    // Phase 31.8: Use app.isPackaged for reliable Dev vs Prod detection
    if (!app.isPackaged) {
        // === DEV MODE ===
        logger.info('WindowManager', 'Dev Mode detected. Loading Vite Dev Server with retry...');

        // DevTools disabled by default — open manually with Ctrl+Shift+I if needed

        // Retry mechanism: Vite may not be ready when Electron boots
        const loadUI = () => {
            mainWindow.loadURL('http://localhost:5173').catch((err) => {
                logger.warn('WindowManager', 'Vite not ready, retrying in 500ms...');
                setTimeout(loadUI, 500);
            });
        };
        loadUI();
    } else {
        // === PRODUCTION MODE ===
        logger.info('WindowManager', 'Production Mode detected. Loading static bundle...');
        mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'dist', 'index.html'));
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Phase 32.2: Step 10 - Strict Navigation Locks
    mainWindow.webContents.setWindowOpenHandler((details) => {
        logger.warn('WindowManager', 'Blocked unauthorized popup/window to: ' + details.url);
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        // Only allow localhost (Dev) or file:// (Prod)
        const isLocalhost = url.startsWith('http://localhost');
        const isFile = url.startsWith('file://');

        if (!isLocalhost && !isFile) {
            event.preventDefault();
            logger.warn('WindowManager', 'Blocked unauthorized main frame navigation to: ' + url);
        }
    });

    // Phase 13: Prevent default close to allow "Minimize to Tray"
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });

    // Subscribing to EventBus to handle native launch triggers directly in Node
    const eventBus = require('./utils/eventBus');
    eventBus.subscribe('os:launch-app', (payload) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('os:focus-app', payload.appName);
            logger.info('WindowManager', 'Instructing React OS to focus App: ' + payload.appName);
        }
    });

    return mainWindow;
}

function getMainWindow() {
    return mainWindow;
}

module.exports = {
    createMainWindow,
    getMainWindow
};
