import React, { useEffect } from 'react';
import { useOSStore } from '../../store/osStore';
import { Eye } from 'lucide-react';

export default function GhostListener() {
    const { addNotification } = useOSStore();

    useEffect(() => {
        // Only run on the native Electron client, not in standard web browsers
        if (!window.nexusAPI) return;

        let eventSource = null;
        let retryTimeout = null;

        const connect = () => {
            // Assume backend is running on port 3001
            eventSource = new EventSource('http://localhost:3001/api/ghost/stream');

            eventSource.onopen = () => {
                console.log('👻 [GHOST LISTENER] Connected to SSE Stream.');
            };

            eventSource.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);

                    if (data.type === 'ghost_error') {
                        addNotification({
                            title: 'Ghost Developer',
                            message: data.message,
                            type: 'warning',
                            icon: Eye
                        });
                    } else if (data.type === 'heartbeat') {
                        // Keep-alive parsing
                    } else if (data.type === 'ghost_stopped') {
                        console.log('👻 [GHOST LISTENER] Service Stopped.');
                    }
                } catch (err) {
                    console.error('👻 [GHOST LISTENER] Parse Error:', err);
                }
            };

            eventSource.onerror = (err) => {
                console.warn('👻 [GHOST LISTENER] Connection lost. Retrying in 5s...', err);
                eventSource.close();
                retryTimeout = setTimeout(connect, 5000);
            };
        };

        connect();

        return () => {
            if (eventSource) eventSource.close();
            if (retryTimeout) clearTimeout(retryTimeout);
        };
    }, [addNotification]);

    // This component is entirely headless/invisible
    return null;
}
