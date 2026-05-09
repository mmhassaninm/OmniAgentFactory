import { exec } from 'child_process';
import util from 'util';
import logger from '@nexus/logger';
import os from 'os';
import fs from 'fs';
import path from 'path';

const execPromise = util.promisify(exec);

/**
 * MediaSkill
 * Controls OS-level media playback and volume via native Windows Virtual Key codes.
 * Works universally across Spotify, Apple Music, YouTube, etc., without requiring API tokens.
 */
class MediaSkill {
    constructor() {
        // Windows Virtual Key Codes
        this.VK = {
            PLAY_PAUSE: '179', // 0xB3
            NEXT_TRACK: '176', // 0xB0
            PREV_TRACK: '177', // 0xB1
            VOL_MUTE: '173', // 0xAD
            VOL_DOWN: '174', // 0xAE
            VOL_UP: '175'  // 0xAF
        };
        logger.info('[MediaSkill] 🎵 Native OS Media & Audio Control Initialized.');
    }

    async executeIntent(args) {
        if (!args || !args.action) {
            return { success: false, error: 'No action provided to MediaSkill.' };
        }

        const { action } = args;
        logger.info(`[MediaSkill] 🎵 Executing Action: ${action}`);

        try {
            let vkCode;
            switch (action) {
                case 'playPause': vkCode = this.VK.PLAY_PAUSE; break;
                case 'nextTrack': vkCode = this.VK.NEXT_TRACK; break;
                case 'prevTrack': vkCode = this.VK.PREV_TRACK; break;
                case 'volumeUp': vkCode = this.VK.VOL_UP; break;
                case 'volumeDown': vkCode = this.VK.VOL_DOWN; break;
                case 'mute': vkCode = this.VK.VOL_MUTE; break;
                default:
                    return { success: false, error: `Unsupported Media action: ${action}. Supported: playPause, nextTrack, prevTrack, volumeUp, volumeDown, mute.` };
            }

            await this._triggerMediaKey(vkCode);
            return { success: true, payload: `Successfully executed media action: ${action}` };

        } catch (err) {
            logger.error(`[MediaSkill] Execution failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    async _triggerMediaKey(vkCode) {
        const psCommand = `
$code = @"
using System.Runtime.InteropServices;
public class Keyboard {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, uint dwExtraInfo);
}
"@
try {
    Add-Type -TypeDefinition $code -ErrorAction Stop
} catch {
    # Ignore if type already exists
}
[Keyboard]::keybd_event(${vkCode}, 0, 0, 0)
`;

        const tempScriptPath = path.join(os.tmpdir(), `nexus_media_${Date.now()}.ps1`);
        await fs.promises.writeFile(tempScriptPath, psCommand, 'utf8');

        try {
            await execPromise(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tempScriptPath}"`);
        } finally {
            if (fs.existsSync(tempScriptPath)) {
                fs.unlinkSync(tempScriptPath);
            }
        }
    }
}

export default new MediaSkill();
