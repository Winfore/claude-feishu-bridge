/**
 * Session 自动清理策略
 * 负责超时会话、已完成会话的自动清理
 */

import { logger } from '../utils/logger.js';
import { DEFAULTS } from '../config/defaults.js';

export class SessionCleanup {
  constructor(sessionManager, storage, options = {}) {
    this.sessionManager = sessionManager;
    this.storage = storage;
    this.sessionTimeout = options.sessionTimeout || DEFAULTS.sessionTimeout;
    this.completedSessionCleanupDelay = options.completedSessionCleanupDelay || DEFAULTS.completedSessionCleanupDelay;
    this.cleanupInterval = options.cleanupInterval || DEFAULTS.cleanupInterval;
    this.cleanupTimer = null;
  }

  /**
   * 启动自动清理
   */
  start() {
    if (this.cleanupTimer) {
      return;
    }

    logger.info('启动会话自动清理');
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(err => {
        logger.error('自动清理失败', err);
      });
    }, this.cleanupInterval);
  }

  /**
   * 停止自动清理
   */
  stop() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.info('停止会话自动清理');
    }
  }

  /**
   * 执行清理
   */
  async cleanup() {
    const now = Date.now();
    const toDelete = [];

    for (const [sessionId, session] of this.sessionManager.sessions.entries()) {
      // 清理超时的空闲会话
      if (session.status === 'idle' &&
          session.lastActivityTime &&
          session.lastActivityTime + this.sessionTimeout < now) {
        logger.info(`清理超时会话: ${sessionId}`);
        toDelete.push(sessionId);
      }

      // 清理已完成的会话（延迟后）
      if ((session.status === 'completed' || session.status === 'error') &&
          session.endTime &&
          session.endTime + this.completedSessionCleanupDelay < now) {
        logger.info(`清理已完成会话: ${sessionId}`);
        toDelete.push(sessionId);
      }
    }

    // 删除会话（包括磁盘文件）
    for (const sessionId of toDelete) {
      this.sessionManager.sessions.delete(sessionId);
      this.sessionManager.pendingAuth.delete(sessionId);
      await this.storage.deleteSession(sessionId);
    }

    if (toDelete.length > 0) {
      logger.info(`清理了 ${toDelete.length} 个会话`);
    }
  }

  /**
   * 清理过期的持久化文件
   */
  async cleanupExpiredFiles(maxAge = 7 * 24 * 60 * 60 * 1000) {
    await this.storage.cleanupExpiredSessions(maxAge);
  }
}
