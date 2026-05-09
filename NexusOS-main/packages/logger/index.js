import chalk from 'chalk';
import dayjs from 'dayjs';

/**
 * NexusOS Centralized Logger
 * Formatting: [YYYY-MM-DD HH:mm:ss] [LEVEL] Message
 */
class NexusLogger {
    constructor(moduleName = 'System') {
        this.moduleName = moduleName;
    }

    _formatMessage(level, message) {
        const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');
        return `[${timestamp}] [${this.moduleName}] [${level}] ${message}`;
    }

    info(message) {
        console.log(chalk.blue(this._formatMessage('INFO', message)));
    }

    success(message) {
        console.log(chalk.green(this._formatMessage('SUCCESS', message)));
    }

    warn(message) {
        console.warn(chalk.yellow(this._formatMessage('WARN', message)));
    }

    error(message, error = null) {
        console.error(chalk.red(this._formatMessage('ERROR', message)));
        if (error) {
            console.error(chalk.red(error.stack || error));
        }
    }

    debug(message) {
        if (process.env.NODE_ENV !== 'production') {
            console.debug(chalk.gray(this._formatMessage('DEBUG', message)));
        }
    }
}

export const createLogger = (moduleName) => new NexusLogger(moduleName);
export default new NexusLogger();
