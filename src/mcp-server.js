/**
 * 飞书 MCP Server
 * 为 Claude Code 提供飞书操作工具
 * 使用官方 SDK
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import * as lark from '@larksuiteoapi/node-sdk';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件所在目录，然后加载项目根目录的 .env
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

// 初始化飞书客户端
const client = new lark.Client({
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
  appType: lark.AppType.SelfBuild,
  domain: lark.Domain.Feishu,
});

// 通知配置
const NOTIFY_CHAT_ID = process.env.NOTIFY_CHAT_ID;

// 创建 MCP Server
const server = new Server(
  {
    name: 'feishu-mcp-server',
    version: '2.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// 定义工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'feishu_send_message',
        description: '发送飞书消息到指定聊天。可以发送文本或富文本消息。',
        inputSchema: {
          type: 'object',
          properties: {
            chat_id: {
              type: 'string',
              description: '聊天 ID，可以是群聊或私聊'
            },
            message: {
              type: 'string',
              description: '消息内容'
            },
            msg_type: {
              type: 'string',
              enum: ['text', 'post'],
              description: '消息类型， text 为纯文本,post 为富文本',
              default: 'text'
            }
          },
          required: ['chat_id', 'message']
        }
      },
      {
        name: 'feishu_create_document',
        description: '创建飞书云文档。返回文档 ID 和链接。',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: '文档标题'
            },
            content: {
              type: 'string',
              description: '文档初始内容 (Markdown 格式)'
            },
            folder_token: {
              type: 'string',
              description: '目标文件夹 token (可选)'
            }
          },
          required: ['title']
        }
      },
      {
        name: 'feishu_list_chats',
        description: '获取机器人所在的群聊列表。返回群聊 ID 和名称。',
        inputSchema: {
          type: 'object',
          properties: {
            page_size: {
              type: 'number',
              description: '每页数量,默认 50',
              default: 50
            }
          }
        }
      },
      {
        name: 'feishu_notify',
        description: '发送任务完成通知。用于在 Claude Code 完成任务后通知用户。',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: '通知标题'
            },
            summary: {
              type: 'string',
              description: '任务摘要,简要描述完成的工作'
            },
            chat_id: {
              type: 'string',
              description: '发送到的聊天 ID,不填则使用默认通知群'
            }
          },
          required: ['title', 'summary']
        }
      },
      {
        name: 'feishu_get_user',
        description: '获取飞书用户信息。',
        inputSchema: {
          type: 'object',
          properties: {
            user_id: {
              type: 'string',
              description: '用户 ID'
            }
          },
          required: ['user_id']
        }
      }
    ]
  };
});

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'feishu_send_message': {
        const { chat_id, message, msg_type = 'text' } = args;

        const response = await client.im.message.create({
          params: {
            receive_id_type: 'chat_id',
          },
          data: {
            receive_id: chat_id,
            msg_type: msg_type === 'post' ? 'post' : 'text',
            content: msg_type === 'post'
              ? JSON.stringify({ zh_cn: { title: '', content: [[{ tag: 'text', text: message }]] } })
              : JSON.stringify({ text: message }),
          },
        });

        if (response.code !== 0) {
          throw new Error(`发送消息失败: ${response.msg}`);
        }

        return {
          content: [{
            type: 'text',
            text: `消息已发送到 ${chat_id}`
          }]
        };
      }

      case 'feishu_create_document': {
        const { title, content, folder_token } = args;

        const body = { title };
        if (folder_token) {
          body.folder_token = folder_token;
        }

        const response = await client.docx.document.create({
          data: body,
        });

        if (response.code !== 0) {
          throw new Error(`创建文档失败: ${response.msg}`);
        }

        const docId = response.data.document.document_id;

        // 如果有内容,写入文档
        if (content) {
          try {
            await client.docx.documentBlockChildren.create({
              path: {
                document_id: docId,
                block_id: docId,
              },
              params: {
                document_revision_id: -1,
              },
              data: {
                index: 0,
                children: [
                  {
                    block_type: 2,
                    text: {
                      elements: [{ text_run: { content } }],
                      style: {},
                    },
                  },
                ],
              },
            });
          } catch (writeError) {
            console.error('写入文档内容失败:', writeError);
          }
        }

        return {
          content: [{
            type: 'text',
            text: `文档已创建:\n- 标题: ${title}\n- ID: ${docId}\n- 链接: https://feishu.cn/docx/${docId}${content ? '\n- 内容: 已写入' : ''}`
          }]
        };
      }

      case 'feishu_list_chats': {
        const { page_size = 50 } = args;

        const response = await client.im.chat.list({
          params: {
            page_size,
          },
        });

        if (response.code !== 0) {
          throw new Error(`获取群列表失败: ${response.msg}`);
        }

        const chats = response.data?.items || [];
        const list = chats.map(c => `- ${c.name}: ${c.chat_id}`).join('\n');

        return {
          content: [{
            type: 'text',
            text: `群聊列表:\n${list}`
          }]
        };
      }

      case 'feishu_notify': {
        const { title, summary, chat_id } = args;
        const targetChat = chat_id || NOTIFY_CHAT_ID;

        if (!targetChat) {
          return {
            content: [{
              type: 'text',
              text: '未配置通知目标，请设置 NOTIFY_CHAT_ID 或传入 chat_id'
            }],
            isError: true
          };
        }

        // 发送卡片通知
        const sessionId = process.env.CLAUDE_SESSION_ID || `cc_${Date.now().toString(36)}`;
        const workingDir = process.cwd();

        // 使用 interactive 卡片消息
        const cardContent = {
          config: { wide_screen_mode: true },
          header: {
            title: { tag: 'plain_text', content: `✅ ${title}` },
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
                { is_short: true, text: { tag: 'lark_md', content: `**会话ID**\n\`${sessionId}\`` } },
                { is_short: true, text: { tag: 'lark_md', content: `**工作目录**\n\`${workingDir}\`` } }
              ]
            },
            {
              tag: 'note',
              elements: [
                { tag: 'plain_text', content: `⏰ ${new Date().toLocaleString('zh-CN')}` }
              ]
            }
          ]
        };

        const response = await client.im.message.create({
          params: {
            receive_id_type: 'chat_id',
          },
          data: {
            receive_id: targetChat,
            msg_type: 'interactive',
            content: JSON.stringify(cardContent),
          },
        });

        if (response.code !== 0) {
          throw new Error(`发送通知失败: ${response.msg}`);
        }

        return {
          content: [{
            type: 'text',
            text: `通知已发送: ${title}`
          }]
        };
      }

      case 'feishu_get_user': {
        const { user_id } = args;

        const response = await client.contact.user.get({
          path: {
            user_id,
          },
          params: {
            user_id_type: 'open_id',
          },
        });

        if (response.code !== 0) {
          throw new Error(`获取用户信息失败: ${response.msg}`);
        }

        const user = response.data?.user;
        return {
          content: [{
            type: 'text',
            text: `用户信息:\n- 姓名: ${user?.name || '无'}\n- 部门: ${user?.department_ids?.join(', ') || '无'}\n- 邮箱: ${user?.email || '无'}`
          }]
        };
      }

      default:
        return {
          content: [{
            type: 'text',
            text: `未知工具: ${name}`
          }],
          isError: true
        };
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `执行失败: ${error.message}`
      }],
      isError: true
    };
  }
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Feishu MCP Server started (using official SDK)');
}

main().catch(console.error);
