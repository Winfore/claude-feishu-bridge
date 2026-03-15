import { describe, it, expect, beforeEach, vi } from 'vitest';

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

class TestLogger {
  constructor(level = 'INFO') {
    this.level = LOG_LEVELS[level] ?? LOG_LEVELS.INFO;
    this.logs = [];
  }

  _log(level, emoji, ...args) {
    if (LOG_LEVELS[level] >= this.level) {
      this.logs.push({ level, emoji, args });
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

describe('Logger', () => {
  let logger;

  describe('log level filtering', () => {
    it('should log all messages at DEBUG level', () => {
      logger = new TestLogger('DEBUG');
      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');
      expect(logger.logs).toHaveLength(4);
    });

    it('should skip DEBUG messages at INFO level', () => {
      logger = new TestLogger('INFO');
      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');
      expect(logger.logs).toHaveLength(3);
    });

    it('should skip DEBUG and INFO messages at WARN level', () => {
      logger = new TestLogger('WARN');
      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');
      expect(logger.logs).toHaveLength(2);
    });

    it('should only log ERROR messages at ERROR level', () => {
      logger = new TestLogger('ERROR');
      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');
      expect(logger.logs).toHaveLength(1);
      expect(logger.logs[0].level).toBe('ERROR');
    });

    it('should default to INFO level for invalid level', () => {
      logger = new TestLogger('INVALID');
      logger.debug('debug msg');
      logger.info('info msg');
      expect(logger.logs).toHaveLength(1);
    });
  });

  describe('log methods', () => {
    beforeEach(() => {
      logger = new TestLogger('DEBUG');
    });

    it('debug() should use debug emoji', () => {
      logger.debug('test');
      expect(logger.logs[0].emoji).toBe('🔍');
    });

    it('info() should use info emoji', () => {
      logger.info('test');
      expect(logger.logs[0].emoji).toBe('ℹ️');
    });

    it('warn() should use warn emoji', () => {
      logger.warn('test');
      expect(logger.logs[0].emoji).toBe('⚠️');
    });

    it('error() should use error emoji', () => {
      logger.error('test');
      expect(logger.logs[0].emoji).toBe('❌');
    });

    it('success() should use success emoji and INFO level', () => {
      logger.success('test');
      expect(logger.logs[0].emoji).toBe('✅');
      expect(logger.logs[0].level).toBe('INFO');
    });

    it('session() should include sessionId in args', () => {
      logger.session('sess-123', 'test message');
      expect(logger.logs[0].args).toContain('[sess-123]');
    });

    it('feishu() should use feishu emoji', () => {
      logger.feishu('test');
      expect(logger.logs[0].emoji).toBe('🔔');
    });

    it('mcp() should use mcp emoji', () => {
      logger.mcp('test');
      expect(logger.logs[0].emoji).toBe('🔌');
    });

    it('should handle multiple arguments', () => {
      logger.info('msg1', 'msg2', { key: 'value' });
      expect(logger.logs[0].args).toHaveLength(3);
    });
  });
});
