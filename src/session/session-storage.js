/**
 * Session 持久化存储
 * 负责会话的保存、加载、历史记录管理
 */

import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync, createReadStream } from 'fs';
import { createInterface } from 'readline';
import { logger } from '../utils/logger.js';
import { SessionError } from '../utils/errors.js';

export class SessionStorage {
  constructor(sessionsDir = './sessions') {
    this.sessionsDir = sessionsDir;
    this._ensureSessionsDir();
  }

  async _ensureSessionsDir() {
    if (!existsSync(this.sessionsDir)) {
      await mkdir(this.sessionsDir, { recursive: true });
      logger.info(`创建会话目录: ${this.sessionsDir}`);
    }
  }

  /**
   * 获取会话元数据文件路径
   */
  getMetaPath(sessionId) {
    return join(this.sessionsDir, `${sessionId}.meta.json`);
  }

  /**
   * 获取会话历史文件路径
   */
  getHistoryPath(sessionId) {
    return join(this.sessionsDir, `${sessionId}.jsonl`);
  }

  /**
   * 保存会话元数据
   */
  async saveMeta(sessionId, metadata) {
    try {
      const metaPath = this.getMetaPath(sessionId);
      await writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
      logger.debug(`保存会话元数据: ${sessionId}`);
    } catch (error) {
      logger.error(`保存会话元数据失败: ${sessionId}`, error);
      throw new SessionError('Failed to save session metadata', { sessionId, error: error.message });
    }
  }

  /**
   * 加载会话元数据
   */
  async loadMeta(sessionId) {
    try {
      const metaPath = this.getMetaPath(sessionId);
      if (!existsSync(metaPath)) {
        return null;
      }
      const content = await readFile(metaPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.error(`加载会话元数据失败: ${sessionId}`, error);
      return null;
    }
  }

  /**
   * 追加消息到历史记录（JSONL 格式）
   */
  async appendHistory(sessionId, message) {
    try {
      const historyPath = this.getHistoryPath(sessionId);
      const line = JSON.stringify(message) + '\n';

      // 追加模式写入
      const { appendFile } = await import('fs/promises');
      await appendFile(historyPath, line, 'utf-8');

      logger.debug(`追加历史记录: ${sessionId}`);
    } catch (error) {
      logger.error(`追加历史记录失败: ${sessionId}`, error);
      throw new SessionError('Failed to append history', { sessionId, error: error.message });
    }
  }

  /**
   * 加载会话历史记录
   */
  async loadHistory(sessionId) {
    try {
      const historyPath = this.getHistoryPath(sessionId);
      if (!existsSync(historyPath)) {
        return [];
      }

      const history = [];
      const fileStream = createReadStream(historyPath);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      for await (const line of rl) {
        if (line.trim()) {
          try {
            history.push(JSON.parse(line));
          } catch (e) {
            logger.warn(`解析历史记录行失败: ${sessionId}`, e);
          }
        }
      }

      logger.debug(`加载历史记录: ${sessionId}, ${history.length} 条消息`);
      return history;
    } catch (error) {
      logger.error(`加载历史记录失败: ${sessionId}`, error);
      return [];
    }
  }

  /**
   * 删除会话文件
   */
  async deleteSession(sessionId) {
    try {
      const metaPath = this.getMetaPath(sessionId);
      const historyPath = this.getHistoryPath(sessionId);

      if (existsSync(metaPath)) {
        await unlink(metaPath);
      }
      if (existsSync(historyPath)) {
        await unlink(historyPath);
      }

      logger.info(`删除会话文件: ${sessionId}`);
    } catch (error) {
      logger.error(`删除会话文件失败: ${sessionId}`, error);
      throw new SessionError('Failed to delete session files', { sessionId, error: error.message });
    }
  }

  /**
   * 列出所有持久化的会话
   */
  async listPersistedSessions() {
    try {
      await this._ensureSessionsDir();
      const files = await readdir(this.sessionsDir);
      const metaFiles = files.filter(f => f.endsWith('.meta.json'));

      const sessions = [];
      for (const file of metaFiles) {
        const sessionId = file.replace('.meta.json', '');
        const meta = await this.loadMeta(sessionId);
        if (meta) {
          sessions.push({ sessionId, ...meta });
        }
      }

      return sessions;
    } catch (error) {
      logger.error('列出持久化会话失败', error);
      return [];
    }
  }

  /**
   * 清理过期会话文件
   */
  async cleanupExpiredSessions(maxAge) {
    try {
      const sessions = await this.listPersistedSessions();
      const now = Date.now();
      let cleaned = 0;

      for (const session of sessions) {
        const age = now - new Date(session.createdAt).getTime();
        if (age > maxAge) {
          await this.deleteSession(session.sessionId);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.info(`清理了 ${cleaned} 个过期会话文件`);
      }
    } catch (error) {
      logger.error('清理过期会话失败', error);
    }
  }
}
