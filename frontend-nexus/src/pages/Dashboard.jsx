import React from 'react';

export default function Dashboard() {
    return (
        <div>
            <h2 style={{ marginTop: 0 }}>Welcome to Admin Dashboard</h2>
            <p style={{ color: '#94a3b8' }}>NexusOS kernel is fully operational. Awaiting further commands.</p>
            <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                <h3 style={{ marginTop: 0, color: '#e2e8f0' }}>System Status</h3>
                <ul style={{ color: '#94a3b8', lineHeight: '1.8' }}>
                    <li>Renderer: <span style={{ color: '#10b981' }}>Secure & Sandboxed</span></li>
                    <li>IPC Bridge: <span style={{ color: '#10b981' }}>Active</span></li>
                    <li>Routing: <span style={{ color: '#10b981' }}>React Router (Hash)</span></li>
                </ul>
            </div>
        </div>
    );
}
