import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/OS/ErrorBoundary.jsx';
import './i18n.js';
import './index.css';

// Phase 69: Intercept React console output to feed into backend unified logger
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args) => {
    originalConsoleError(...args);
    try {
        if (window.nexusAPI) window.nexusAPI.invoke('events:log-frontend', { level: 'error', message: args.join(' ') });
    } catch (e) { }
};

console.warn = (...args) => {
    originalConsoleWarn(...args);
    try {
        if (window.nexusAPI) window.nexusAPI.invoke('events:log-frontend', { level: 'warn', message: args.join(' ') });
    } catch (e) { }
};

// Phase 29.2: Global Error Listener to catch silent React/Renderer crashes
window.addEventListener('error', (event) => {
    console.error('--- [RENDERER FATAL ERROR] ---');
    console.error('Message:', event.message);
    console.error('Source:', event.filename, ':', event.lineno, ':', event.colno);
    console.error('Stack:', event.error ? event.error.stack : 'No stack trace available');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('--- [RENDERER UNHANDLED PROMISE REJECTION] ---');
    console.error('Reason:', event.reason);
});

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </React.StrictMode>
    );
    console.log('[NexusOS] React Application Mounted Successfully.');
} else {
    console.error("CRITICAL: 'root' element not found in index.html");
}
