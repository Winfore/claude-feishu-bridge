/**
 * 飞书 API 客户端
 * 处理所有飞书相关的 API 调用
 */

export class FeishuClient {
  constructor(config) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.tenantAccessToken = null;
    this.tokenExpireTime = 0;
  }

  /**
   * 获取 tenant_access_token
   */
  async getAccessToken() {
    if (this.tenantAccessToken && Date.now() < this.tokenExpireTime) {
      return this.tenantAccessToken;
    }

    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: this.appId,
        app_secret: this.appSecret
      })
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`获取 token 失败: ${data.msg}`);
    }

    this.tenantAccessToken = data.tenant_access_token;
    this.tokenExpireTime = Date.now() + (data.expire - 300) * 1000; // 提前5分钟过期
    return this.tenantAccessToken;
  }

  /**
   * 发送消息
   * @param {string} receiveId - 接收者 ID
   * @param {string} msgType - 消息类型 (text/post/image/etc)
   * @param {object} content - 消息内容
   * @param {string} receiveType - 接收类型 (open_id/chat_id/user_id/email)
   */
  async sendMessage(receiveId, msgType, content, receiveType = 'chat_id') {
    const token = await this.getAccessToken();

    const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=' + receiveType, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        receive_id: receiveId,
        msg_type: msgType,
        content: typeof content === 'string' ? content : JSON.stringify(content)
      })
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`发送消息失败: ${data.msg}`);
    }
    return data.data;
  }

  /**
   * 发送文本消息
   */
  async sendText(receiveId, text, receiveType = 'chat_id') {
    return this.sendMessage(receiveId, 'text', { text }, receiveType);
  }

  /**
   * 发送富文本消息
   */
  async sendPost(receiveId, title, content, receiveType = 'chat_id') {
    return this.sendMessage(receiveId, 'post', {
      zh_cn: {
        title,
        content: Array.isArray(content) ? content : [[{ tag: 'text', text: content }]]
      }
    }, receiveType);
  }

  /**
   * 回复消息
   */
  async replyMessage(messageId, msgType, content) {
    const token = await this.getAccessToken();

    const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reply`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        msg_type: msgType,
        content: typeof content === 'string' ? content : JSON.stringify(content)
      })
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`回复消息失败: ${data.msg}`);
    }
    return data.data;
  }

  /**
   * 创建云文档
   * @param {string} title - 文档标题
   * @param {string} folderToken - 文件夹 token (可选)
   */
  async createDocument(title, folderToken = null) {
    const token = await this.getAccessToken();

    const body = { title };
    if (folderToken) {
      body.folder_token = folderToken;
    }

    const response = await fetch('https://open.feishu.cn/open-apis/docx/v1/documents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`创建文档失败: ${data.msg}`);
    }
    return data.data;
  }

  /**
   * 写入文档内容
   * @param {string} documentId - 文档 ID
   * @param {number} index - 插入位置
   * @param {string} text - 文本内容
   */
  async writeDocumentBlock(documentId, index, text) {
    const token = await this.getAccessToken();

    // 创建文本块
    const response = await fetch(
      `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          index: index || 0,
          children: [
            {
              block_type: 2, // text block
              text: {
                elements: [
                  {
                    text_run: {
                      content: text
                    }
                  }
                ],
                style: {}
              }
            }
          ]
        })
      }
    );

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`写入文档失败: ${data.msg}`);
    }
    return data.data;
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(userId) {
    const token = await this.getAccessToken();

    const response = await fetch(
      `https://open.feishu.cn/open-apis/contact/v3/users/${userId}?user_id_type=open_id`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`获取用户信息失败: ${data.msg}`);
    }
    return data.data.user;
  }

  /**
   * 获取群列表
   */
  async getChatList(pageSize = 50) {
    const token = await this.getAccessToken();

    const response = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/chats?page_size=${pageSize}`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`获取群列表失败: ${data.msg}`);
    }
    return data.data?.items || [];
  }

  /**
   * 发送卡片消息 (用于通知)
   */
  async sendCard(receiveId, card, receiveType = 'chat_id') {
    return this.sendMessage(receiveId, 'interactive', card, receiveType);
  }

  /**
   * 创建任务完成通知卡片
   */
  createTaskCard(title, summary, sessionId, workingDir) {
    return {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: '✅ ' + title },
        template: 'green'
      },
      elements: [
        {
          tag: 'div',
          text: { tag: 'lark_md', content: `**摘要**\n${summary}` }
        },
        {
          tag: 'div',
          fields: [
            { is_short: true, text: { tag: 'lark_md', content: `**会话ID**\n${sessionId}` } },
            { is_short: true, text: { tag: 'lark_md', content: `**工作目录**\n${workingDir}` } }
          ]
        },
      ]
    };
  }
}
