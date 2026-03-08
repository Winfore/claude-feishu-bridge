/**
 * 飞书长连接客户端
 * 使用官方 SDK 的 WebSocket 长连接模式，无需公网域名
 */

import * as lark from '@larksuiteoapi/node-sdk';

export class FeishuLongPollClient {
  constructor(config) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.encryptKey = config.encryptKey;
    this.verificationToken = config.verificationToken;

    // 创建 lark client
    this.client = new lark.Client({
      appId: this.appId,
      appSecret: this.appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });

    // WebSocket 客户端
    this.wsClient = null;
    // 事件处理器
    this.messageHandler = null;
  }

  /**
   * 启动长连接
   * @param {function} onMessage - 消息处理回调
   */
  async start(onMessage) {
    this.messageHandler = onMessage;

    // 创建 WebSocket 客户端
    this.wsClient = new lark.WSClient({
      appId: this.appId,
      appSecret: this.appSecret,
      domain: lark.Domain.Feishu,
    });

    // 卡片动作处理器
    this.cardActionHandler = null;

    // 使用 EventDispatcher 注册事件处理器
    const eventDispatcher = new lark.EventDispatcher({}).register({
      // 处理消息事件
      'im.message.receive_v1': async (data) => {
        if (this.messageHandler) {
          try {
            await this.messageHandler(data);
          } catch (error) {
            console.error('处理消息失败:', error);
          }
        }
      },
      // 处理卡片按钮点击事件
      'card.action.trigger': async (data) => {
        if (this.cardActionHandler) {
          try {
            await this.cardActionHandler(data);
          } catch (error) {
            console.error('处理卡片动作失败:', error);
          }
        }
        // 返回 toast 响应
        return {
          toast: {
            type: 'success',
            content: '操作成功',
            i18n: {
              zh_cn: '操作成功',
              en_us: 'Action success',
            },
          },
        };
      },
    });

    // 启动长连接
    await this.wsClient.start({ eventDispatcher });

    console.log('✅ 飞书长连接已建立');
    return this.wsClient;
  }

  /**
   * 停止长连接
   */
  async stop() {
    if (this.wsClient) {
      await this.wsClient.stop();
      console.log('飞书长连接已断开');
    }
  }

  /**
   * 设置卡片动作处理器
   * @param {function} handler - 处理卡片按钮点击的回调
   */
  onCardAction(handler) {
    this.cardActionHandler = handler;
  }

  /**
   * 发送文本消息
   */
  async sendText(receiveId, text, receiveType = 'chat_id') {
    const response = await this.client.im.message.create({
      params: {
        receive_id_type: receiveType,
      },
      data: {
        receive_id: receiveId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      },
    });

    if (response.code !== 0) {
      throw new Error(`发送消息失败: ${response.msg}`);
    }
    return response.data;
  }

  /**
   * 回复消息
   */
  async replyMessage(messageId, msgType, content) {
    const response = await this.client.im.message.reply({
      path: {
        message_id: messageId,
      },
      params: {
        receive_id_type: 'chat_id',
      },
      data: {
        msg_type: msgType,
        content: typeof content === 'string' ? content : JSON.stringify(content),
      },
    });

    if (response.code !== 0) {
      throw new Error(`回复消息失败: ${response.msg}`);
    }
    return response.data;
  }

  /**
   * 发送卡片消息
   */
  async sendCard(receiveId, card, receiveType = 'chat_id') {
    const response = await this.client.im.message.create({
      params: {
        receive_id_type: receiveType,
      },
      data: {
        receive_id: receiveId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
    });

    if (response.code !== 0) {
      throw new Error(`发送卡片失败: ${response.msg}`);
    }
    return response.data;
  }

  /**
   * 获取群列表
   */
  async getChatList(pageSize = 50) {
    const response = await this.client.im.chat.list({
      params: {
        page_size: pageSize,
      },
    });

    if (response.code !== 0) {
      throw new Error(`获取群列表失败: ${response.msg}`);
    }
    return response.data?.items || [];
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(userId) {
    const response = await this.client.contact.user.get({
      path: {
        user_id: userId,
      },
      params: {
        user_id_type: 'open_id',
      },
    });

    if (response.code !== 0) {
      throw new Error(`获取用户信息失败: ${response.msg}`);
    }
    return response.data?.user;
  }

  /**
   * 创建云文档
   */
  async createDocument(title, folderToken = null) {
    const body = { title };
    if (folderToken) {
      body.folder_token = folderToken;
    }

    const response = await this.client.docx.document.create({
      data: body,
    });

    if (response.code !== 0) {
      throw new Error(`创建文档失败: ${response.msg}`);
    }
    return response.data;
  }

  /**
   * 写入文档内容
   */
  async writeDocumentBlock(documentId, index, text) {
    const response = await this.client.docx.documentBlockChildren.create({
      path: {
        document_id: documentId,
        block_id: documentId,
      },
      params: {
        document_revision_id: -1,
      },
      data: {
        index: index || 0,
        children: [
          {
            block_type: 2,
            text: {
              elements: [
                {
                  text_run: {
                    content: text,
                  },
                },
              ],
              style: {},
            },
          },
        ],
      },
    });

    if (response.code !== 0) {
      throw new Error(`写入文档失败: ${response.msg}`);
    }
    return response.data;
  }

  /**
   * 创建任务完成通知卡片
   */
  createTaskCard(title, summary, sessionId, workingDir) {
    return {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: '✅ ' + title },
        template: 'green',
      },
      elements: [
        {
          tag: 'div',
          text: { tag: 'lark_md', content: `**摘要**\n${summary}` },
        },
        {
          tag: 'div',
          fields: [
            { is_short: true, text: { tag: 'lark_md', content: `**会话ID**\n\`${sessionId}\`` } },
            { is_short: true, text: { tag: 'lark_md', content: `**工作目录**\n\`${workingDir}\`` } },
          ],
        },
        {
          tag: 'note',
          elements: [
            {
              tag: 'plain_text',
              content: `💡 回复 /continue ${sessionId} <指令> 继续此会话`,
            },
          ],
        },
      ],
    };
  }

  /**
   * 创建工具授权请求卡片
   * @param {string} sessionId - 会话ID
   * @param {object} toolUse - 工具调用信息
   * @param {string} workingDir - 工作目录
   */
  createToolAuthCard(sessionId, toolUse, workingDir) {
    const toolDescriptions = {
      write_file: '📝 写入文件',
      delete_file: '🗑️ 删除文件',
      move_file: '📦 移动文件',
      execute_command: '⚡ 执行命令'
    };

    const toolName = toolUse.name;
    const toolDesc = toolDescriptions[toolName] || toolName;
    const params = toolUse.input || {};

    // 构建参数描述
    let paramDesc = '';
    if (toolName === 'write_file') {
      paramDesc = `**文件**: \`${params.path || '未知'}\`\n**内容长度**: ${(params.content || '').length} 字符`;
    } else if (toolName === 'delete_file') {
      paramDesc = `**路径**: \`${params.path || '未知'}\``;
    } else if (toolName === 'move_file') {
      paramDesc = `**源**: \`${params.source || '未知'}\`\n**目标**: \`${params.destination || '未知'}\``;
    } else if (toolName === 'execute_command') {
      paramDesc = `**命令**: \`${params.command || '未知'}\``;
    }

    return {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: '⚠️ 操作授权请求' },
        template: 'orange',
      },
      elements: [
        {
          tag: 'div',
          text: { tag: 'lark_md', content: `**操作类型**: ${toolDesc}\n\n${paramDesc}\n\n**工作目录**: \`${workingDir}\`` },
        },
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '✅ 允许' },
              type: 'primary',
              value: {
                action: 'approve_tool',
                sessionId: sessionId,
                toolCallId: toolUse.id,
                toolName: toolName
              }
            },
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '❌ 拒绝' },
              type: 'danger',
              value: {
                action: 'reject_tool',
                sessionId: sessionId,
                toolCallId: toolUse.id,
                toolName: toolName
              }
            }
          ]
        },
        {
          tag: 'note',
          elements: [
            {
              tag: 'plain_text',
              content: '💡 此操作可能修改或删除文件，请确认后执行',
            },
          ],
        },
      ],
    };
  }

  /**
   * 发送工具授权卡片
   */
  async sendToolAuthCard(chatId, sessionId, toolUse, workingDir) {
    const card = this.createToolAuthCard(sessionId, toolUse, workingDir);
    return await this.sendCard(chatId, card);
  }
}
