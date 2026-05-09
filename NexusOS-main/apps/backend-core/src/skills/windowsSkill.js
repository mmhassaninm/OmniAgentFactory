import { exec } from 'child_process';
import util from 'util';
import logger from '@nexus/logger';

const execAsync = util.promisify(exec);

/**
 * Windows Executive Skill
 * Responsible for native OS manipulations on the host machine.
 */
class WindowsSkill {
    async executeIntent(args) {
        if (!args || !args.command) {
            return { success: false, error: "No command provided to Windows Executive." };
        }

        let { command } = args;
        logger.info(`[WindowsSkill] 🦅 Executing Native OS Command: ${command}`);

        // Sanitize common LLM hallucinations for Windows CMD
        if (command.startsWith('open ')) {
            command = command.replace('open ', 'start ');
        }
        if (command.startsWith('browser ')) {
            command = command.replace('browser ', 'start ');
        }

        try {
            // Note: In an actual production environment, extreme caution and sandboxing 
            // is required here. Since this is God-Mode via User intent, we execute directly.

            // Fire and forget for 'start' commands so Node doesn't hang waiting for the app to close
            if (command.toLowerCase().startsWith('start ')) {
                exec(command, { shell: 'cmd.exe' }, (error) => {
                    if (error) logger.warn(`[WindowsSkill] Background start warning: ${error.message}`);
                });
                return { success: true, payload: `Dispatched native command: ${command}` };
            }

            const { stdout, stderr } = await execAsync(command, { shell: 'powershell.exe' });

            // Anti-Chinese Shield (Language Sanitizer)
            const sanitize = (text) => {
                if (!text) return text;
                return text.replace(/[\u4e00-\u9fff]/g, '[تم حجب خطأ نظام غير مفهوم - جاري المعالجة]');
            };

            const safeStdout = sanitize(stdout);
            const safeStderr = sanitize(stderr);

            if (safeStderr && safeStderr.trim().length > 0) {
                logger.warn(`[WindowsSkill] Execution returned stderr: ${safeStderr}`);
                // Some commands output to stderr even on success, so we don't strictly fail
            }

            return {
                success: true,
                payload: safeStdout ? safeStdout.trim() : "Command executed successfully with no output."
            };
        } catch (err) {
            logger.error(`[WindowsSkill] Execution failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }
}

export default new WindowsSkill();
