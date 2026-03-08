/**
 * Session Manager - 重构版
 * 核心会话管理逻辑，协调各个子模块
 */

import { randomUUID } from 'crypto';
import { mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { SessionError } from '../utils/errors.js';
import { SessionStorage } from './session-storage.js';
import { SessionExecutor } from './session-executor.js';
import { SessionCleanup } from './session-cleanup.js';

export class SessionManager {
  constructor(config = {}) {
    this.sessions = new Map(); // sessionId -> Session
    this.workspaceRoot = config.workspaceRoot || process.cwd();
    this.onSessionEnd = config.onSessionEnd || (() => {});
    this.onToolNeedsAuth = config.onToolNeedsAuth || (() => {});

    // 等待授权的工具调用
    this.pendingAuth = new Map(); // sessionId -> { toolCallId -> { resolve, reject, toolUse } }

    // 初始化子模块
    this.storage = new SessionStorage(config.sessionsDir);
    this.executor = new SessionExecutor({
      anthropicApiKey: config.anthropicApiKey,
      baseURL: config.baseURL,
      model: config.model
    });
    this.cleanup = new SessionCleanup(this, this.storage, {
      sessionTimeout: config.sessionTimeout,
      completedSessionCleanupDelay: config.completedSessionCleanupDelay
    });

    // 启动自动清理
    this.cleanup.start();

    logger.info(`工作空间根目录: ${this.workspaceRoot}`);
  }

  /**
   * 加载持久化的会话
   */
  async loadPersistedSessions() {
    const persistedSessions = await this.storage.listPersistedSessions();
    logger.info(`发现 ${persistedSessions.length} 个持久化会话`);

    for (const meta of persistedSessions) {
      const history = await this.storage.loadHistory(meta.sessionId);

      const session = {
        id: meta.sessionId,
        projectName: meta.projectName,
        workingDir: meta.workingDir,
        source: meta.source,
        chatId: meta.chatId,
        userId: meta.userId,
        createdAt: new Date(meta.createdAt).getTime(),
        status: 'idle',
        messages: history,
        lastPrompt: null,
        output: '',
        lastActivityTime: Date.now()
      };

      this.sessions.set(meta.sessionId, session);
      logger.debug(`恢复会话: ${meta.sessionId}`);
    }

    return persistedSessions.length;
  }

  /**
   * 恢复单个会话
   */
  async restoreSession(sessionId) {
    const meta = await this.storage.loadMeta(sessionId);
    if (!meta) {
      return null;
    }

    const history = await this.storage.loadHistory(sessionId);

    const session = {
      id: sessionId,
      projectName: meta.projectName,
      workingDir: meta.workingDir,
      source: meta.source,
      chatId: meta.chatId,
      userId: meta.userId,
      createdAt: new Date(meta.createdAt).getTime(),
      status: 'idle',
      messages: history,
      lastPrompt: null,
      output: '',
      lastActivityTime: Date.now()
    };

    this.sessions.set(sessionId, session);
    logger.info(`恢复会话: ${sessionId}`);
    return session;
  }

  /**
   * 保存会话元数据
   */
  async saveSessionMeta(session) {
    const metadata = {
      sessionId: session.id,
      projectName: session.projectName,
      workingDir: session.workingDir,
      source: session.source,
      chatId: session.chatId,
      userId: session.userId,
      createdAt: new Date(session.createdAt).toISOString()
    };

    await this.storage.saveMeta(session.id, metadata);
  }

  /**
   * 追加历史记录
   */
  async appendHistory(session, message) {
    await this.storage.appendHistory(session.id, message);
  }

  /**
   * 创建新会话（基于项目名）
   */
  async createSession(options = {}) {
    const sessionId = options.sessionId || this.generateSessionId();
    const projectName = options.projectName || options.workingDir;

    if (!projectName) {
      throw new SessionError('必须指定项目名称');
    }

    // 构建项目目录路径
    const projectDir = join(this.workspaceRoot, projectName);

    // 确保项目目录存在
    await mkdir(projectDir, { recursive: true });

    const session = {
      id: sessionId,
      projectName,
      workingDir: projectDir,
      source: options.source || 'unknown',
      chatId: options.chatId,
      userId: options.userId,
      createdAt: Date.now(),
      status: 'idle',
      messages: [],
      lastPrompt: null,
      output: '',
      lastActivityTime: Date.now()
    };

    this.sessions.set(sessionId, session);
    await this.saveSessionMeta(session);

    // 执行初始提示
    if (options.prompt) {
      await this.executePrompt(session, options.prompt);
    }

    logger.session(sessionId, `创建会话: ${projectName}`);
    return session;
  }

  /**
   * 切换会话到不同的项目
   */
  async switchProject(sessionId, projectName) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionError(`会话不存在: ${sessionId}`);
    }

    const newProjectDir = join(this.workspaceRoot, projectName);
    await mkdir(newProjectDir, { recursive: true });

    session.projectName = projectName;
    session.workingDir = newProjectDir;
    await this.saveSessionMeta(session);

    logger.session(sessionId, `切换到项目: ${projectName}`);
    return session;
  }

  /**
   * 列出工作空间中的所有项目
   */
  async listProjects() {
    try {
      const entries = await readdir(this.workspaceRoot, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch (error) {
      logger.error('读取工作空间失败', error);
      return [];
    }
  }

  /**
   * 继续现有会话
   */
  async continueSession(sessionId, prompt) {
    let session = this.sessions.get(sessionId);

    if (!session) {
      // 尝试从文件恢复
      session = await this.restoreSession(sessionId);
      if (!session) {
        throw new SessionError(`会话不存在: ${sessionId}`);
      }
    }

    if (session.status === 'running') {
      throw new SessionError('会话正在执行中，请等待完成');
    }

    // 清理可能遗留的待授权请求
    if (this.pendingAuth.has(sessionId)) {
      logger.warn(`清理遗留的待授权请求: ${sessionId}`);
      const pending = this.pendingAuth.get(sessionId);

      for (const [toolCallId, { resolve, timeoutId }] of pending.entries()) {
        if (timeoutId) clearTimeout(timeoutId);
        resolve({
          type: 'tool_result',
          tool_use_id: toolCallId,
          content: JSON.stringify({ success: false, error: '会话已继续，旧授权请求已取消' }),
          is_error: true
        });
      }
      this.pendingAuth.delete(sessionId);
    }

    // 执行新的 prompt
    await this.executePrompt(session, prompt);
    return session;
  }

  /**
   * 使用 Anthropic API 执行 prompt（支持工具调用）
   */
  async executePrompt(session, prompt) {
    logger.session(session.id, `开始执行，状态: ${session.status}`);

    // 等待 MCP 初始化完成
    await this.executor.waitForMCP();

    // 检查是否有遗留的 pendingAuth
    if (this.pendingAuth.has(session.id)) {
      logger.warn(`会话 ${session.id} 有遗留的 pendingAuth，清理中...`);
      this.pendingAuth.delete(session.id);
    }

    session.status = 'running';
    session.lastPrompt = prompt;
    session.startTime = Date.now();
    session.lastActivityTime = Date.now();

    try {
      // 添加用户消息到历史
      session.messages.push({
        role: 'user',
        content: prompt
      });

      // 获取所有可用工具
      const allTools = this.executor.getAllTools();
      logger.debug(`可用工具: ${allTools.length} 个`);

      // 工具调用循环
      while (true) {
        // 调用 Claude API
        const response = await this.executor.anthropic.messages.create({
          model: this.executor.model,
          max_tokens: 8192,
          messages: session.messages,
          system: this.executor.buildSystemPrompt(session.workingDir),
          tools: allTools
        });

        // 检查是否有工具调用
        const toolUses = response.content.filter(block => block.type === 'tool_use');

        if (toolUses.length === 0) {
          // 没有工具调用，返回文本回复
          const assistantMessage = response.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('\n');

          session.messages.push({
            role: 'assistant',
            content: response.content
          });

          session.output = assistantMessage;
          session.status = 'completed';
          session.endTime = Date.now();
          session.lastActivityTime = Date.now();

          // 保存历史
          await this.appendHistory(session, {
            role: 'user',
            content: prompt,
            timestamp: session.startTime
          });
          await this.appendHistory(session, {
            role: 'assistant',
            content: assistantMessage,
            timestamp: session.endTime
          });

          // 触发回调
          this.onSessionEnd(session);
          logger.session(session.id, '执行完成');
          return;
        }

        // 有工具调用，需要执行
        logger.session(session.id, `Claude 请求调用 ${toolUses.length} 个工具`);

        // 先添加助手消息到历史
        session.messages.push({
          role: 'assistant',
          content: response.content
        });

        // 执行所有工具调用
        const toolResults = [];
        const authNeededTools = [];

        for (const toolUse of toolUses) {
          logger.debug(`工具: ${toolUse.name}, 参数: ${JSON.stringify(toolUse.input)}`);

          // 检查是否为 MCP 工具
          if (this.executor.isMCPTool(toolUse.name)) {
            try {
              const result = await this.executor.callMCPTool(toolUse.name, toolUse.input);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: typeof result === 'string' ? result : JSON.stringify(result)
              });
            } catch (error) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify({ success: false, error: error.message }),
                is_error: true
              });
            }
          } else if (this.executor.needsAuth(toolUse.name)) {
            // 内置工具需要授权
            authNeededTools.push(toolUse);
          } else {
            // 内置工具自动执行
            const result = await this.executor.executeTool(toolUse.name, toolUse.input, session.workingDir);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result)
            });
          }
        }

        // 如果有需要授权的工具，通知并等待
        if (authNeededTools.length > 0) {
          logger.session(session.id, `${authNeededTools.length} 个工具需要授权`);

          const authPromises = authNeededTools.map(async (toolUse) => {
            if (!this.pendingAuth.has(session.id)) {
              this.pendingAuth.set(session.id, new Map());
            }
            this.pendingAuth.get(session.id).set(toolUse.id, { toolUse });

            const authPromise = this.waitForAuth(session.id, toolUse.id);
            await this.onToolNeedsAuth(session, toolUse);

            return authPromise;
          });

          const authResults = await Promise.all(authPromises);
          toolResults.push(...authResults);
        }

        // 添加工具结果到消息历史
        session.messages.push({
          role: 'user',
          content: toolResults
        });

        // 继续循环，让 Claude 处理工具结果
      }

    } catch (error) {
      session.status = 'error';
      session.output = `错误: ${error.message}`;
      session.endTime = Date.now();
      session.lastActivityTime = Date.now();

      logger.error('执行 prompt 失败', error);
      this.onSessionEnd(session);
      throw error;
    }
  }

  /**
   * 等待工具授权
   */
  async waitForAuth(sessionId, toolCallId, timeout = 5 * 60 * 1000) {
    return new Promise((resolve, reject) => {
      const pending = this.pendingAuth.get(sessionId);
      if (!pending || !pending.has(toolCallId)) {
        reject(new Error('授权请求不存在'));
        return;
      }

      const entry = pending.get(toolCallId);
      entry.resolve = resolve;
      entry.reject = reject;

      // 设置超时
      entry.timeoutId = setTimeout(() => {
        pending.delete(toolCallId);
        resolve({
          type: 'tool_result',
          tool_use_id: toolCallId,
          content: JSON.stringify({ success: false, error: '授权超时' }),
          is_error: true
        });
      }, timeout);
    });
  }

  /**
   * 批准工具执行
   */
  async approveToolExecution(sessionId, toolCallId) {
    const pending = this.pendingAuth.get(sessionId);
    if (!pending || !pending.has(toolCallId)) {
      throw new SessionError('授权请求不存在或已过期');
    }

    const { resolve, toolUse, timeoutId } = pending.get(toolCallId);
    if (timeoutId) clearTimeout(timeoutId);
    pending.delete(toolCallId);

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionError('会话不存在');
    }

    try {
      const result = await this.executor.executeTool(toolUse.name, toolUse.input, session.workingDir);
      resolve({
        type: 'tool_result',
        tool_use_id: toolCallId,
        content: JSON.stringify(result)
      });
    } catch (error) {
      resolve({
        type: 'tool_result',
        tool_use_id: toolCallId,
        content: JSON.stringify({ success: false, error: error.message }),
        is_error: true
      });
    }
  }

  /**
   * 拒绝工具执行
   */
  async rejectToolExecution(sessionId, toolCallId, reason = '用户拒绝') {
    const pending = this.pendingAuth.get(sessionId);
    if (!pending || !pending.has(toolCallId)) {
      throw new SessionError('授权请求不存在或已过期');
    }

    const { resolve, timeoutId } = pending.get(toolCallId);
    if (timeoutId) clearTimeout(timeoutId);
    pending.delete(toolCallId);

    resolve({
      type: 'tool_result',
      tool_use_id: toolCallId,
      content: JSON.stringify({ success: false, error: reason }),
      is_error: true
    });
  }

  /**
   * 终止会话
   */
  terminateSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'terminated';
      logger.session(sessionId, '会话已终止');
    }
  }

  /**
   * 获取会话状态
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * 列出所有活跃会话
   */
  listSessions() {
    return Array.from(this.sessions.values())
      .filter(s => s.status !== 'completed' && s.status !== 'error' && s.status !== 'terminated')
      .map(s => ({
        id: s.id,
        projectName: s.projectName,
        chatId: s.chatId,
        workingDir: s.workingDir,
        status: s.status,
        createdAt: s.createdAt,
        lastPrompt: s.lastPrompt
      }));
  }

  /**
   * 列出所有会话
   */
  listAllSessions() {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      projectName: s.projectName,
      chatId: s.chatId,
      workingDir: s.workingDir,
      status: s.status,
      createdAt: s.createdAt,
      lastPrompt: s.lastPrompt
    }));
  }

  /**
   * 生成会话 ID
   */
  generateSessionId() {
    const timestamp = Date.now().toString(36);
    const random = randomUUID().slice(0, 8);
    return `cc_${timestamp}_${random}`;
  }

  /**
   * 关闭 SessionManager
   */
  async close() {
    this.cleanup.stop();
    await this.executor.close();
    logger.info('SessionManager 已关闭');
  }
}
