const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const desktopPath = path.join(os.homedir(), 'Desktop');
const projectPath = 'D:\\NexusOS-main';

const shortcuts = [
    {
        name: 'NexusOS - Web.lnk',
        target: path.join(projectPath, 'launchers', 'start-web.bat'),
        icon: '%SystemRoot%\\System32\\shell32.dll,14' // index 14 is a Globe
    },
    {
        name: 'NexusOS - Desktop App.lnk',
        target: path.join(projectPath, 'launchers', 'start-app.bat'),
        icon: '%SystemRoot%\\System32\\shell32.dll,43' // index 43 is a Star
    }
];

shortcuts.forEach(shortcut => {
    const shortcutPath = path.join(desktopPath, shortcut.name);
    const script = `
        $WshShell = New-Object -comObject WScript.Shell;
        $Shortcut = $WshShell.CreateShortcut('${shortcutPath}');
        $Shortcut.TargetPath = '${shortcut.target}';
        $Shortcut.WorkingDirectory = '${projectPath}';
        $Shortcut.IconLocation = '${shortcut.icon}';
        $Shortcut.Save();
    `;
    console.log(`Creating shortcut: ${shortcut.name}...`);
    try {
        // Run PowerShell command. Replace newlines with spaces to form a single line script.
        execSync(`powershell -NoProfile -Command "${script.replace(/\n/g, ' ').trim()}"`);
        console.log(`Successfully created ${shortcut.name} on Desktop.`);
    } catch (e) {
        console.error(`Failed to create ${shortcut.name}:`, e.message);
    }
});
