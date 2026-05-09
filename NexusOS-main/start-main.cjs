// start-main.js
delete process.env.ELECTRON_RUN_AS_NODE;

const { spawn } = require('child_process');
const electronPath = require('electron');

const child = spawn(electronPath, ['--remote-debugging-port=9333', '.'], {
    stdio: 'inherit',
    env: { ...process.env } // Pass cleaned environment
});

child.on('close', (code) => {
    process.exit(code);
});
