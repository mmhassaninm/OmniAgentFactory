const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

function createShortcut() {
    try {
        console.log('[OMNIBOT] Initiating Desktop Shortcut Generation...');

        // 1. Resolve Desktop Path
        const desktopPath = path.join(os.homedir(), 'Desktop');
        if (!fs.existsSync(desktopPath)) {
            throw new Error(`Desktop directory not found at: ${desktopPath}`);
        }

        const shortcutPath = path.join(desktopPath, 'OmniBot.lnk');

        // 2. Resolve Target Batch File Path
        const targetPath = path.resolve(__dirname, '../start_omnibot.bat');
        const iconPath = path.resolve(__dirname, '../frontend/public/vite.svg'); // Generic icon for now
        const workingDir = path.resolve(__dirname, '../');

        if (!fs.existsSync(targetPath)) {
            throw new Error(`Target file not found at: ${targetPath}`);
        }

        // 3. Generate VBScript to create the .lnk file natively on Windows
        const vbsScriptPath = path.join(os.tmpdir(), 'create_omnibot_shortcut.vbs');
        const vbsCode = `
Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "${shortcutPath}"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "${targetPath}"
oLink.WorkingDirectory = "${workingDir}"
oLink.Description = "Launch the OmniBot Ecosystem"
oLink.IconLocation = "${iconPath}, 0"
oLink.Save
`;

        fs.writeFileSync(vbsScriptPath, vbsCode);

        // 4. Execute VBScript
        execSync(`cscript //nologo "${vbsScriptPath}"`);

        console.log(`[OMNIBOT] Success! Shortcut deployed to: ${shortcutPath}`);

        // 5. Cleanup
        if (fs.existsSync(vbsScriptPath)) {
            fs.unlinkSync(vbsScriptPath);
        }

    } catch (error) {
        console.error('[ERROR] Failed to create desktop shortcut:', error.message);
        process.exit(1);
    }
}

createShortcut();
