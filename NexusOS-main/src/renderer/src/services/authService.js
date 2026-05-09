// NexusOS AuthService - ES Module (Renderer Context)
// All IPC calls go through window.nexusAPI (Context Bridge)
class AuthService {

    // Phase 26: Route Login to Koyeb via cloudDbConnection
    async login(email, password) {
        try {
            const response = await window.nexusAPI.invoke('cloud:request', {
                endpoint: '/auth/login',
                method: 'POST',
                data: { email, password }
            });

            if (response.status === 'success') {
                const { token, user } = response.data;
                // Store JWT securely in localStorage for persistent session
                localStorage.setItem('nexus_cloud_token', token);
                // Also store user RBAC context
                localStorage.setItem('nexus_cloud_user', JSON.stringify(user));
                return user;
            } else {
                throw new Error(response.message);
            }
        } catch (error) {
            console.error('[AuthService] Login Error:', error);
            throw error;
        }
    }

    async register(username, email, password) {
        try {
            const response = await window.nexusAPI.invoke('cloud:request', {
                endpoint: '/auth/register',
                method: 'POST',
                data: { username, email, password }
            });

            if (response.status === 'success') {
                return response.data; // usually {message: "...", role: "..."}
            } else {
                throw new Error(response.message);
            }
        } catch (error) {
            console.error('[AuthService] Registration Error:', error);
            throw error;
        }
    }

    logout() {
        localStorage.removeItem('nexus_cloud_token');
        localStorage.removeItem('nexus_cloud_user');
    }

    getToken() {
        return localStorage.getItem('nexus_cloud_token');
    }

    getUser() {
        try {
            const userStr = localStorage.getItem('nexus_cloud_user');
            return userStr ? JSON.parse(userStr) : null;
        } catch (e) {
            return null;
        }
    }
}

// In a real module setup for React Renderer, this might be exported differently, but as a generic utility:
export const authService = new AuthService();
