/**
 * Nexus Bridge - Communication Layer
 * Intelligently switches between Electron IPC and Browser HTTP Fetch.
 */

const BRIDGE_URL = 'http://localhost:3001/api';

export const nexusBridge = {
    /**
     * Invokes a command on the backend (request/response).
     * @param {string} channel - The IPC channel or API path (e.g., 'ai:prompt')
     * @param {any} payload - Data to send
     */
    invoke: async (channel, payload) => {
        // 1. Check for Electron Native Bridge
        if (window.nexusAPI && typeof window.nexusAPI.invoke === 'function') {
            try {
                return await window.nexusAPI.invoke(channel, payload);
            } catch (err) {
                console.error(`[IPC Error] ${channel}:`, err);
                throw err;
            }
        }

        // 2. Fallback to HTTP Bridge (Browser Mode)
        const path = channel.replace(':', '/');
        console.log(`[Nexus Bridge] Web Mode: Fetching ${channel}...`);

        try {
            const response = await fetch(`${BRIDGE_URL}/${path}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload || {}),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}: Bridge Failure`);
            }

            return await response.json();
        } catch (err) {
            console.error(`[Bridge Error] ${channel}:`, err);
            throw err;
        }
    },

    /**
     * Subscribes to a push event from the backend (one-way, main→renderer).
     * @param {string} channel - The IPC event channel
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    receive: (channel, callback) => {
        if (window.nexusAPI && typeof window.nexusAPI.receive === 'function') {
            return window.nexusAPI.receive(channel, callback);
        }
        console.warn(`[Nexus Bridge] receive() unavailable in browser mode for channel: ${channel}`);
        return () => { }; // noop unsubscribe
    },

    /**
     * Sends a fire-and-forget message to the backend (one-way, renderer→main).
     * @param {string} channel - The IPC channel
     * @param {any} data - Data to send
     */
    send: (channel, data) => {
        if (window.nexusAPI && typeof window.nexusAPI.send === 'function') {
            window.nexusAPI.send(channel, data);
        } else {
            console.warn(`[Nexus Bridge] send() unavailable in browser mode for channel: ${channel}`);
        }
    }
};

export default nexusBridge;
