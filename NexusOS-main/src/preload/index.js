const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object to prevent RCE vulnerabilities.
contextBridge.exposeInMainWorld('nexusAPI', {
    send: (channel, data) => {
        // List of allowed channels to send (Fire-and-forget)
        let validChannels = ['ui:theme-change', 'system:restart', 'app:launch'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    receive: (channel, func) => {
        // List of allowed channels to listen to
        let validChannels = [
            'ui:popup-alert', 'system:telemetry-update', 'db:sync-status',
            'system:language-change', 'ghost:status', 'predictive:suggestion',
            'vault:sync-status', 'python:stdout', 'python:stderr',
            'os:focus-app', 'os:launch', 'os:notification', 'telemetry:data',
            // Phase 23: Architect Daemon broadcasts
            'architect:new-idea',
            // Phase 41: Thermal Sentinel alerts
            'sentinel:thermal-alert'
        ];
        if (validChannels.includes(channel)) {
            // Deliberately strip the event object to prevent access to event.sender
            const subscription = (event, ...args) => func(...args);
            ipcRenderer.on(channel, subscription);
            // Phase 32.4: Step 18 - Return unsubscribe function
            return () => {
                ipcRenderer.removeListener(channel, subscription);
            };
        }
    },
    invoke: async (channel, ...args) => {
        // List of allowed channels for async Request/Response
        let validChannels = [
            'db:saveMemory', 'db:searchMemory', 'db:logEvent', 'vault:encrypt',
            'settings:getSettings', 'settings:updateSettings', 'settings:getLanguage',
            'chat:startPythonCore', 'chat:sendMessage', 'chat:getModels',
            'ghost:analyzeCodebase', 'predictive:predictNextAction',
            'hive:orchestrateTask', 'hive:syncGlobalContext',
            'os:change-language',
            'cloud:request',
            'ai:prompt', 'ai:refactor', 'ai:predict',
            // Phase 22: Animus Persistent Daemon
            'animus:start-sequence', 'animus:status',
            'animus:daemon-start', 'animus:daemon-stop',
            'animus:queue', 'animus:inject', 'animus:reject',
            // Phase 22.5: Ghost Developer V2 & Chaos Guardian V2
            'ghost:start', 'ghost:stop', 'ghost:status',
            'chaos:run', 'chaos:status',
            // Phase 23: Nexus-Architect Daemon
            'architect:start', 'architect:stop', 'architect:trigger',
            'architect:approve', 'architect:dismiss', 'architect:status',
            // Phase 24: Pantheon Gallery
            'pantheon:scan', 'pantheon:getImages', 'pantheon:analyze', 'pantheon:status',
            // Phase 25: Nexus-Prime
            'prime:chat', 'prime:approve-patch', 'prime:reject-patch',
            'prime:get-patches', 'prime:status', 'prime:status-update',
            // Phase 19: Sentinel
            'sentinel:heal-ui',
            // Phase 40: Docker Sandbox
            'sandbox:execute', 'sandbox:status',
            // Phase 41: Thermal Sentinel
            'thermal:start', 'thermal:stop', 'thermal:status', 'thermal:set-thresholds',
            // Phase 42/69: EventLogger & Raw Logs
            'events:list', 'events:get', 'events:stats', 'events:raw-logs', 'events:log-frontend',
            // Phase 48: File System
            'fs:list', 'fs:read', 'fs:home', 'fs:write', 'fs:stat',
            'fs:drives', 'fs:storage-root', 'fs:quick-access',
            // Phase 49: Threat Oracle
            'oracle:get-prediction', 'oracle:run-now',
            // Phase 74: Legacy Terminal Forge
            'os:terminal'
        ];
        if (validChannels.includes(channel)) {
            return await ipcRenderer.invoke(channel, ...args);
        }
        throw new Error(`[NexusOS Security] Unauthorized IPC invoke channel: ${channel}`);
    }
});
