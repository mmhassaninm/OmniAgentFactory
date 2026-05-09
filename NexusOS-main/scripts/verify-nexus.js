import http from 'http';
import fs from 'fs';
import path from 'path';

console.log('\n=========================================');
console.log('🛡️ NEXUS-OS DIAGNOSTIC PULSE INITIATED');
console.log('=========================================\n');

let issuesFound = 0;

// 1. Check System Files Integrity
const checkFile = (filepath, name) => {
    if (fs.existsSync(filepath)) {
        console.log(`✅ [INTEGRITY] ${name} is present.`);
    } else {
        console.error(`❌ [INTEGRITY] Missing critical file: ${filepath}`);
        issuesFound++;
    }
};

checkFile(path.resolve(process.cwd(), 'package.json'), 'Root Package');
checkFile(path.resolve(process.cwd(), 'apps/nexus-desktop/src/main.jsx'), 'React Renderer Entry');
checkFile(path.resolve(process.cwd(), 'apps/backend-core/src/main.js'), 'Backend Core Entry');

// 2. Health Ping 3001
console.log('\n📡 Pinging Backend API (Port 3001)...');
const req3001 = http.get('http://localhost:3001/', (res) => {
    if (res.statusCode === 200 || res.statusCode === 404) {
        console.log('✅ [BACKEND] Express Server is responding.');
    } else {
        console.warn(`⚠️ [BACKEND] Responded with unusual status: ${res.statusCode}`);
    }
}).on('error', (e) => {
    console.error(`❌ [BACKEND] Unreachable. Is the backend running? (${e.message})`);
    issuesFound++;
});
req3001.setTimeout(2000, () => req3001.destroy());

// 3. Health Ping 5173
console.log('📡 Pinging Frontend Vite (Port 5173)...');
const req5173 = http.get('http://localhost:5173/', (res) => {
    if (res.statusCode === 200) {
        console.log('✅ [FRONTEND] Vite Server is responding.');
    } else {
        console.warn(`⚠️ [FRONTEND] Responded with unusual status: ${res.statusCode}`);
    }
}).on('error', (e) => {
    console.error(`❌ [FRONTEND] Unreachable. Is Vite running? (${e.message})`);
    issuesFound++;
});
req5173.setTimeout(2000, () => req5173.destroy());

setTimeout(() => {
    console.log('\n=========================================');
    if (issuesFound === 0) {
        console.log('🟢 SYSTEM PULSE: ALL GREEN. NexusOS is pristine.');
    } else {
        console.log(`🔴 SYSTEM PULSE: ${issuesFound} ISSUE(S) FOUND. Self-healing required.`);
    }
    console.log('=========================================\n');
    process.exit(issuesFound > 0 ? 1 : 0);
}, 2500);
