const { net } = require('electron');
const logger = require('../utils/logger');

// Phase 25: Koyeb Cloud Backend Base URL 
// (In production, this should point to your Koyeb deployment domain, e.g., 'https://nexus-os-...koyeb.app')
const CLOUD_BASE_URL = process.env.NEXUS_CLOUD_URL || 'http://localhost:5000';

class CloudDBConnection {
    async queryCloud(endpoint, method = 'GET', data = null, token = null) {
        return new Promise((resolve, reject) => {
            const requestUrl = `${CLOUD_BASE_URL}/api${endpoint}`;
            logger.debug('CloudDB', `Routing to Cloud: ${method} ${requestUrl}`);

            const request = net.request({
                url: requestUrl,
                method: method
            });

            request.setHeader('Content-Type', 'application/json');

            // Phase 26 RBAC & Auth Setup
            if (token) {
                request.setHeader('Authorization', `Bearer ${token}`);
            }

            request.on('response', (response) => {
                let body = '';
                response.on('data', (chunk) => {
                    body += chunk;
                });
                response.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        if (response.statusCode >= 200 && response.statusCode < 300) {
                            resolve(parsed);
                        } else {
                            reject(new Error(parsed.message || 'Cloud Request Failed'));
                        }
                    } catch (e) {
                        reject(new Error('Invalid Cloud Response Format'));
                    }
                });
            });

            request.on('error', (error) => {
                logger.error('CloudDB', `Connection failed: ${error.message}`);
                reject(new Error('Network error attempting to reach Cloud DB'));
            });

            if (data && (method === 'POST' || method === 'PUT')) {
                request.write(JSON.stringify(data));
            }

            request.end();
        });
    }

    // Specific Cloud Operations will be mapped here as we build out Phases 26 and 27
}

module.exports = new CloudDBConnection();
