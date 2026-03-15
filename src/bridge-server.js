/**
 * 桥接服务
 * 处理飞书消息，管理会话，转发指令到 Claude Code
 * 支持长连接模式（无需公网域名）
 *
 * 用户隔离模式：每个用户独立会话
 * 工作空间独占：同一工作空间只能被一个用户使用
 */

import { FeishuLongPollClient } from './feishu-longpoll.js';
import { SessionManager } from './session/session-manager.js';
import { logger } from './utils/logger.js';
import { lsHandler, cdHandler, upHandler, pwdHandler, helpHandler, clearHandler, contextHandler } from './server/handlers/index.js';
import { readdir, stat } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import 'dotenv/config';

export class BridgeServer {
  constructor(config) {
    this.config = config;

    // 初始化飞书长连接客户端
    this.feishu = new FeishuLongPollClient({
      appId: config.appId,
      appSecret: config.appSecret,
      encryptKey: config.encryptKey,
      verificationToken: config.verificationToken
    });

    // 初始化会话管理器
    this.sessions = new SessionManager({
      sessionsDir: './sessions',
      workspaceRoot: config.workspaceRoot || config.defaultWorkingDir || process.cwd(),
      anthropicApiKey: config.anthropicApiKey,
      baseURL: config.baseURL,
      model: config.model,
      onSessionEnd: (session) => this.handleSessionEnd(session),
      onToolNeedsAuth: (session, toolUse) => this.handleToolNeedsAuth(session, toolUse),
      onProgress: (sessionId, progress) => this.handleProgress(sessionId, progress)
    });

    // 消息处理器映射
    this.commandHandlers = new Map();
    // 用户上下文（按用户ID隔离）
    // userId -> { projectName, sessionId, chatId }
    this.userContext = new Map();
    this.setupDefaultHandlers();

    // 权限控制
    this.allowedUsers = config.allowedUsers ? config.allowedUsers.split(',') : null;
    this.adminUsers = config.adminUsers ? config.adminUsers.split(',') : [];

    // 工作空间占用记录
    // projectName -> userId（当前占用者）
    this.workspaceOwner = new Map();

    // 防止重复发送（记录最近发送的消息哈希）
    this.recentlySent = new Map();

    // 防止重复处理消息（记录最近处理的消息ID）
    this.processedMessages = new Set();
    this.maxProcessedMessages = 100; // 最多记录100条消息ID

    // 进度更新节流（同一会话每 5 秒最多发送一次）
    this.progressThrottle = new Map(); // sessionId -> lastProgressTime
    this.progressThrottleMs = 5000;
  }

  /**
   * 获取用户默认项目名（使用用户真实姓名）
   */
  async getUserDefaultProject(userId) {
    try {
      const userInfo = await this.feishu.getUserInfo(userId);
      // 使用用户姓名，去除空格和特殊字符
      const name = userInfo.name || userInfo.en_name || `user_${userId.slice(-8)}`;
      return name.replace(/\s+/g, '_').replace(/[^\w\u4e00-\u9fa5-]/g, '');
    } catch (error) {
      logger.error('获取用户信息失败:', error);
      return `user_${userId.slice(-8)}`;
    }
  }

  /**
   * 检查工作空间是否被其他用户占用
   * @returns {string|null} 占用者的用户ID，如果未被占用则返回 null
   */
  getWorkspaceOwner(projectName, excludeUserId) {
    const owner = this.workspaceOwner.get(projectName);
    if (owner && owner !== excludeUserId) {
      return owner;
    }
    return null;
  }

  /**
   * 占用工作空间
   */
  occupyWorkspace(projectName, userId) {
    this.workspaceOwner.set(projectName, userId);
  }

  /**
   * 释放工作空间
   */
  releaseWorkspace(projectName) {
    this.workspaceOwner.delete(projectName);
  }

  /**
   * 设置默认命令处理器
   */
  setupDefaultHandlers() {
    const workspaceRoot = this.config.workspaceRoot;

    // 创建处理器上下文
    const handlerContext = {
      workspaceRoot,
      userContext: this.userContext,
      sessions: this.sessions
    };

    // 注册所有命令处理器
    this.registerHandler('ls', (ctx) => lsHandler(ctx, handlerContext));
    this.registerHandler('cd', (ctx) => cdHandler(ctx, handlerContext));
    this.registerHandler('..', (ctx) => upHandler(ctx, handlerContext));
    this.registerHandler('pwd', (ctx) => pwdHandler(ctx, handlerContext));
    this.registerHandler('help', () => helpHandler());
    this.registerHandler('clear', (ctx) => clearHandler(ctx, handlerContext));
    this.registerHandler('context', (ctx) => contextHandler(ctx, handlerContext));
  }

  /**
   * 注册命令处理器
   */
  registerHandler(command, handler) {
    this.commandHandlers.set(command.toLowerCase(), handler);
  }

  /**
   * 处理命令
   */
  async handleCommand(command, context) {
    const handler = this.commandHandlers.get(command.toLowerCase());
    if (!handler) {
      return { success: false, message: `未知命令: ${command}\n使用 /help 查看可用命令` };
    }
    return handler(context);
  }

  /**
   * 处理飞书消息（长连接模式）
   */
  async handleFeishuMessage(event) {
    const { sender, message } = event;
    const senderId = sender?.sender_id?.open_id;

    // 权限检查
    if (this.allowedUsers && !this.allowedUsers.includes(senderId)) {
      logger.warn(`拒绝用户 ${senderId} 的请求`);
      return;
    }

    const chatId = message.chat_id;
    const messageId = message.message_id;

    // 防止重复处理同一条消息
    if (this.processedMessages.has(messageId)) {
      logger.debug(`跳过已处理的消息: ${messageId}`);
      return;
    }

    // 记录已处理的消息
    this.processedMessages.add(messageId);
    if (this.processedMessages.size > this.maxProcessedMessages) {
      // 清理旧记录（保留最新的50条）
      const arr = Array.from(this.processedMessages);
      this.processedMessages = new Set(arr.slice(-50));
    }

    // 解析消息内容
    let content = '';
    try {
      const msgContent = JSON.parse(message.content);
      content = msgContent.text || '';
    } catch {
      content = message.content;
    }

    // 移除 @mention 标记（飞书群聊中 @机器人 时会包含 @_user_1 这样的标记）
    if (message.mentions && message.mentions.length > 0) {
      for (const mention of message.mentions) {
        // 移除 mention.key (如 "@_user_1") 及其后的空格
        content = content.replace(new RegExp(mention.key + '\\s*', 'g'), '');
      }
    }

    content = content.trim();

    if (!content) return;

    // 解析命令
    const isCommand = content.startsWith('/');
    const context = {
      chatId,
      messageId,
      senderId,
      content,
      args: ''
    };

    try {
      let result;

      if (isCommand) {
        // 确保用户上下文已初始化
        await this.ensureUserContext(senderId, chatId);

        // 解析命令：/cmd args
        const [cmd, ...argsParts] = content.slice(1).split(/\s+/);
        context.args = argsParts.join(' ');
        result = await this.handleCommand(cmd, context);

        // 发送命令响应（如果有）
        if (result?.message) {
          await this.feishu.replyMessage(messageId, 'text', { text: result.message });
        }
      } else {
        // 普通消息：自动在用户的当前项目中继续/创建会话
        await this.handleUserMessage(chatId, messageId, senderId, content);
      }

    } catch (error) {
      logger.error('处理消息失败:', error);
      await this.feishu.replyMessage(messageId, 'text', {
        text: `❌ 处理失败: ${error.message}`
      });
    }
  }

  /**
   * 确保用户上下文已初始化
   */
  async ensureUserContext(senderId, chatId) {
    let userCtx = this.userContext.get(senderId);

    if (!userCtx) {
      const workspaceRoot = this.config.workspaceRoot;
      const defaultPath = await this.getUserDefaultProject(senderId);
      userCtx = {
        userId: senderId,
        currentPath: defaultPath,
        workingDir: join(workspaceRoot, defaultPath),
        sessionId: null,
        chatId: chatId
      };
      this.userContext.set(senderId, userCtx);
      logger.info(`初始化用户上下文: ${senderId}, 默认路径: ${defaultPath}`);
    } else {
      // 更新 chatId
      userCtx.chatId = chatId;
      this.userContext.set(senderId, userCtx);
    }

    return userCtx;
  }

  /**
   * 处理用户普通消息（自动创建/继续会话）
   * 用户隔离：每个用户有独立的上下文和会话
   */
  async handleUserMessage(chatId, messageId, senderId, content) {
    const userCtx = await this.ensureUserContext(senderId, chatId);
    const workspaceRoot = this.config.workspaceRoot;

    let session = userCtx.sessionId ? this.sessions.getSession(userCtx.sessionId) : null;

    // 如果内存中没有会话，尝试从磁盘恢复
    if (!session && userCtx.sessionId) {
      session = await this.sessions.restoreSession(userCtx.sessionId);
      if (session) {
        logger.info(`从磁盘恢复会话: ${session.id}`);
      }
    }

    if (session && session.status === 'running') {
      await this.feishu.sendText(chatId, '⏳ 你有操作正在等待授权，请先处理上方的授权请求');
      return;
    }

    await this.feishu.sendText(chatId, '🤔 正在思考...');

    if (!session || session.status === 'error') {
      try {
        session = await this.sessions.createSession({
          source: 'feishu',
          chatId: chatId,
          userId: senderId,
          projectName: userCtx.currentPath || 'default',
          prompt: content
        });
        userCtx.sessionId = session.id;
        this.userContext.set(senderId, userCtx);
      } catch (error) {
        logger.error('[handleUserMessage] 创建会话失败:', error);
        await this.feishu.replyMessage(messageId, 'text', {
          text: `❌ 创建会话失败: ${error.message}`
        });
        return;
      }
    } else {
      try {
        await this.sessions.continueSession(session.id, content);
      } catch (error) {
        logger.error('[handleUserMessage] 继续会话失败:', error);
        await this.feishu.replyMessage(messageId, 'text', {
          text: `❌ 继续会话失败: ${error.message}`
        });
        return;
      }
    }
  }

  /**
   * 生成消息哈希（用于防重复）
   */
  getMessageHash(chatId, content) {
    const contentPreview = content.slice(0, 100);
    return `${chatId}:${contentPreview.length}:${contentPreview}`;
  }

  /**
   * 检查并记录消息是否已发送（防止重复）
   */
  isRecentlySent(chatId, content) {
    if (!this.recentlySent.has(chatId)) {
      this.recentlySent.set(chatId, new Set());
    }

    const hash = this.getMessageHash(chatId, content);
    const sentSet = this.recentlySent.get(chatId);

    if (sentSet.has(hash)) {
      return true;
    }

    sentSet.add(hash);

    if (sentSet.size > 10) {
      const arr = Array.from(sentSet);
      sentSet.clear();
      arr.slice(-10).forEach(h => sentSet.add(h));
    }

    return false;
  }

  /**
   * 会话结束回调
   */
  async handleSessionEnd(session) {
    logger.info(`会话 ${session.id} 结束，状态: ${session.status}`);

    if (session.chatId) {
      if ((session.status === 'completed' || session.status === 'idle') && session.output) {
        if (this.isRecentlySent(session.chatId, session.output)) {
          logger.debug(`[handleSessionEnd] 跳过重复消息，chatId=${session.chatId}`);
          return;
        }

        try {
          await this.feishu.sendText(session.chatId, session.output);
          logger.debug(`[handleSessionEnd] 消息已发送，chatId=${session.chatId}`);
        } catch (error) {
          logger.error('发送回复失败:', error);
        }
      } else if (session.status === 'error') {
        try {
          await this.feishu.sendText(session.chatId, `❌ ${session.output}`);
        } catch (error) {
          logger.error('发送错误信息失败:', error);
        }
      }
    }
  }

  /**
   * 工具需要授权时的回调
   */
  async handleToolNeedsAuth(session, toolUse) {
    logger.info(`[handleToolNeedsAuth] 工具 ${toolUse.name} 需要授权`);
    logger.debug(`[handleToolNeedsAuth] 会话: ${session.id}, 聊天: ${session.chatId}`);

    try {
      await this.feishu.sendToolAuthCard(
        session.chatId,
        session.id,
        toolUse,
        session.workingDir
      );
      logger.debug('[handleToolNeedsAuth] 授权卡片已发送');
    } catch (error) {
      logger.error('[handleToolNeedsAuth] 发送授权卡片失败:', error);
      this.sessions.resumeWithAuth(session.id, toolUse.id, false, session.workingDir);
    }
  }

  /**
   * 处理执行进度
   */
  async handleProgress(sessionId, progress) {
    const session = this.sessions.getSession(sessionId);
    if (!session || !session.chatId) return;

    const now = Date.now();
    const lastTime = this.progressThrottle.get(sessionId) || 0;

    if (now - lastTime < this.progressThrottleMs) {
      return;
    }

    this.progressThrottle.set(sessionId, now);

    const shouldNotify = ['thinking', 'tool_call', 'mcp_call'].includes(progress.stage);

    if (shouldNotify) {
      const messages = {
        thinking: '🤔 正在思考...',
        tool_call: progress.needsAuth
          ? `🔒 工具需要授权: ${progress.tool}`
          : `🔧 执行工具: ${progress.tool}`,
        mcp_call: `🔌 调用服务: ${progress.tool}`
      };

      logger.session(sessionId, `进度: ${progress.stage}`, progress);
    }
  }

  /**
   * 启动服务（长连接模式）
   */
  async start() {
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    await this.sessions.loadPersistedSessions();

    await this.feishu.start(async (event) => {
      await this.handleFeishuMessage(event);
    });

    this.feishu.onCardAction(async (event) => {
      await this.handleCardAction(event);
    });

    logger.info('🌉 Bridge Server 已启动（长连接模式）');
    logger.info('📱 无需公网域名，直接通过 WebSocket 连接飞书');
    logger.info('👤 用户隔离模式：每个用户独立会话');
    logger.info('🔒 工作空间独占：同一项目只能被一个用户使用');
  }

  /**
   * 处理卡片按钮点击动作
   */
  async handleCardAction(event) {
    logger.debug('处理卡片动作:', JSON.stringify(event, null, 2));

    const { action, token } = event;
    const chatId = event.context?.open_chat_id || event.chat_id;

    if (!chatId) {
      logger.warn('无法获取 chatId');
      return;
    }

    if (!action || !action.value) {
      logger.warn('卡片动作没有 value');
      return;
    }

    const actionValue = action.value;
    logger.debug('动作值:', actionValue);

    try {
      if (actionValue.action === 'approve_tool') {
        const { sessionId, toolCallId, toolName } = actionValue;
        logger.info(`[handleCardAction] 批准工具: ${toolName}, 会话: ${sessionId}`);

        const allSessions = this.sessions.listAllSessions();
        logger.debug(`[handleCardAction] 当前活跃会话: ${allSessions.map(s => `${s.id}(${s.status})`).join(', ')}`);

        const session = this.sessions.getSession(sessionId);
        if (!session) {
          logger.warn(`[handleCardAction] 会话 ${sessionId} 不存在`);
          await this.feishu.sendText(chatId, `⚠️ 会话已结束，此授权请求已失效`);
          return;
        }

        const pendingTool = this.sessions.getPendingAuth(sessionId, toolCallId);
        if (!pendingTool) {
          logger.debug(`[handleCardAction] 授权请求已处理，跳过: ${toolCallId}`);
          return;
        }

        const success = await this.sessions.resumeWithAuth(sessionId, toolCallId, true, session.workingDir);
        if (success) {
          await this.feishu.sendText(chatId, `✅ 已批准执行: ${toolName}`);
        } else {
          await this.feishu.sendText(chatId, `⚠️ 授权处理失败，请重试`);
        }

      } else if (actionValue.action === 'reject_tool') {
        const { sessionId, toolCallId, toolName } = actionValue;
        logger.info(`[handleCardAction] 拒绝工具: ${toolName}, 会话: ${sessionId}`);

        const session = this.sessions.getSession(sessionId);
        if (!session) {
          await this.feishu.sendText(chatId, `⚠️ 会话已结束，此授权请求已失效`);
          return;
        }

        const pendingTool = this.sessions.getPendingAuth(sessionId, toolCallId);
        if (!pendingTool) {
          logger.debug(`[handleCardAction] 授权请求已处理，跳过: ${toolCallId}`);
          return;
        }

        const success = await this.sessions.resumeWithAuth(sessionId, toolCallId, false, session.workingDir);
        if (success) {
          await this.feishu.sendText(chatId, `❌ 已拒绝执行: ${toolName}`);
        } else {
          await this.feishu.sendText(chatId, `⚠️ 拒绝处理失败，请重试`);
        }

      } else {
        logger.warn('未知卡片动作:', actionValue);
      }
    } catch (error) {
      logger.error('处理卡片动作失败:', error);
      await this.feishu.sendText(chatId, `❌ 处理失败: ${error.message}`);
    }
  }

  /**
   * 停止服务
   */
  async stop() {
    await this.feishu.stop();
    logger.info('Bridge Server 已停止');
  }
}
