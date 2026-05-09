import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './i18n.js';
import './index.css';

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
            <App />
        </React.StrictMode>
    );
    console.log('[NexusOS] React Application Mounted Successfully.');
} else {
    console.error("CRITICAL: 'root' element not found in index.html");
}
