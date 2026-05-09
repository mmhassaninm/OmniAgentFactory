const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const desktopDir = path.join(os.homedir(), 'Desktop');
const shortcutPath = path.join(desktopDir, 'NexusOS.lnk');
const batPath = path.resolve(__dirname, 'Nexus_Ignition.bat');
const workingDir = path.resolve(__dirname, '..');

// Fallback icon path (using frontend favicon if present)
const iconPath = path.join(workingDir, 'apps', 'nexus-desktop', 'public', 'favicon.ico');
const iconLine = fs.existsSync(iconPath) ? `oLink.IconLocation = "${iconPath}"` : '';

const vbsScript = `
Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "${shortcutPath}"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "${batPath}"
oLink.WorkingDirectory = "${workingDir}"
oLink.WindowStyle = 7
oLink.Description = "NexusOS Ignition Engine"
${iconLine}
oLink.Save
`;

const vbsPath = path.join(__dirname, 'create_shortcut.vbs');
fs.writeFileSync(vbsPath, vbsScript, 'utf8');

try {
    execSync(`cscript //nologo "${vbsPath}"`);
    console.log('[NEXUS] Successfully created desktop shortcut at: ' + shortcutPath);
} catch (err) {
    console.error('[NEXUS] Error creating shortcut:', err.message);
} finally {
    if (fs.existsSync(vbsPath)) {
        fs.unlinkSync(vbsPath);
    }
}
