/**
 * 统一日志工具
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

class Logger {
  constructor(level = 'INFO') {
    this.level = LOG_LEVELS[level] || LOG_LEVELS.INFO;
  }

  _log(level, emoji, ...args) {
    if (LOG_LEVELS[level] >= this.level) {
      const timestamp = new Date().toISOString();
      console.log(`${emoji} [${timestamp}]`, ...args);
    }
  }

  debug(...args) {
    this._log('DEBUG', '🔍', ...args);
  }

  info(...args) {
    this._log('INFO', 'ℹ️', ...args);
  }

  warn(...args) {
    this._log('WARN', '⚠️', ...args);
  }

  error(...args) {
    this._log('ERROR', '❌', ...args);
  }

  success(...args) {
    this._log('INFO', '✅', ...args);
  }

  session(sessionId, ...args) {
    this._log('INFO', '📝', `[${sessionId}]`, ...args);
  }

  feishu(...args) {
    this._log('INFO', '🔔', ...args);
  }

  mcp(...args) {
    this._log('INFO', '🔌', ...args);
  }
}

export const logger = new Logger(process.env.LOG_LEVEL || 'INFO');
