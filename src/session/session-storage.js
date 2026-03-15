/**
 * Session 持久化存储
 * 负责会话的保存、加载、历史记录管理
 */

import { readFile, writeFile, mkdir, readdir, unlink, open, stat } from 'fs/promises';
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
   * 加载会话历史记录（支持分页）
   * @param {string} sessionId - 会话ID
   * @param {object} options - 选项
   * @param {number} options.limit - 最大加载消息数（0 表示全部）
   * @param {number} options.offset - 跳过的消息数
   * @param {boolean} options.tailOnly - 只加载最后 N 条（推荐用于恢复会话）
   */
  async loadHistory(sessionId, options = {}) {
    const { limit = 0, offset = 0, tailOnly = false } = options;

    try {
      const historyPath = this.getHistoryPath(sessionId);
      if (!existsSync(historyPath)) {
        return [];
      }

      if (tailOnly && limit > 0) {
        return await this.loadHistoryTail(sessionId, limit);
      }

      const history = [];
      const fileStream = createReadStream(historyPath);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      let skipped = 0;
      let loaded = 0;

      for await (const line of rl) {
        if (line.trim()) {
          if (skipped < offset) {
            skipped++;
            continue;
          }

          try {
            history.push(JSON.parse(line));
            loaded++;

            if (limit > 0 && loaded >= limit) {
              break;
            }
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
   * 高效加载最后 N 条历史记录
   * 使用逆向读取，避免加载整个文件
   */
  async loadHistoryTail(sessionId, count) {
    try {
      const historyPath = this.getHistoryPath(sessionId);
      if (!existsSync(historyPath)) {
        return [];
      }

      const stats = await stat(historyPath);
      const fileSize = stats.size;

      if (fileSize < 100 * 1024) {
        const all = await this.loadHistory(sessionId);
        return all.slice(-count);
      }

      const fd = await open(historyPath, 'r');
      const bufferSize = Math.min(64 * 1024, fileSize);
      const buffer = Buffer.alloc(bufferSize);

      const lines = [];
      let position = fileSize;
      let remainingData = '';

      try {
        while (position > 0 && lines.length < count) {
          const readSize = Math.min(bufferSize, position);
          position -= readSize;

          const { bytesRead } = await fd.read(buffer, 0, readSize, position);
          const chunk = buffer.slice(0, bytesRead).toString('utf-8') + remainingData;

          const chunkLines = chunk.split('\n');
          remainingData = chunkLines[0];

          for (let i = chunkLines.length - 1; i >= 1 && lines.length < count; i--) {
            const line = chunkLines[i].trim();
            if (line) {
              try {
                lines.unshift(JSON.parse(line));
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }

        if (remainingData.trim() && lines.length < count) {
          try {
            lines.unshift(JSON.parse(remainingData.trim()));
          } catch (e) {
            // 忽略
          }
        }
      } finally {
        await fd.close();
      }

      logger.debug(`尾部加载历史记录: ${sessionId}, ${lines.length} 条消息`);
      return lines;
    } catch (error) {
      logger.error(`尾部加载历史记录失败: ${sessionId}`, error);
      return [];
    }
  }

  /**
   * 获取历史记录统计信息
   */
  async getHistoryStats(sessionId) {
    try {
      const historyPath = this.getHistoryPath(sessionId);
      if (!existsSync(historyPath)) {
        return { exists: false, messageCount: 0, fileSize: 0 };
      }

      const stats = await stat(historyPath);

      let lineCount = 0;
      const fileStream = createReadStream(historyPath);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      for await (const line of rl) {
        if (line.trim()) lineCount++;
      }

      return {
        exists: true,
        messageCount: lineCount,
        fileSize: stats.size,
        lastModified: stats.mtime
      };
    } catch (error) {
      logger.error(`获取历史统计失败: ${sessionId}`, error);
      return { exists: false, messageCount: 0, fileSize: 0 };
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
