# Claude Code 飞书桥接服务

[English](#english) | 中文

实现 Claude Code 与飞书的双向集成，让你可以通过飞书远程控制 Claude Code 执行编程任务。

## 核心功能

- **飞书远程控制** - 在飞书中发送命令，远程控制电脑上的 Claude Code
- **Claude 操作飞书** - Claude Code 可通过 MCP 工具发送消息、创建文档、推送通知
- **任务完成通知** - 任务执行完成后自动推送结果到飞书
- **多会话管理** - 支持多项目、多会话并行，会话持久化与恢复
- **进度反馈** - 执行过程中实时报告状态

## 架构

```
📱 飞书 App                    💻 电脑
    │                              │
    │  1. 发送指令                  │
    │  ─────────────────────────>  │
    │               ┌──────────────┼── WebSocket 长连接
    │               │ Bridge Server│   (无需公网域名!)
    │               └──────────────┼─────────┐
    │                              │  Claude Code CLI
    │  2. 执行完成，推送通知         │  (多个会话)
    │  <─────────────────────────  │
    │                              │
    │  3. Claude Code 可调用飞书工具 │
    │  <────────────────────────>  │
```

## 特性

- **长连接模式** - 无需公网域名、无需内网穿透、无需 HTTPS 证书
- **远程控制** - 手机发指令，电脑执行代码任务
- **会话管理** - 支持多会话、会话持久化、断线恢复
- **MCP 工具** - Claude Code 可直接调用飞书 API
- **进度反馈** - 执行工具时实时报告进度
- **性能优化** - 大历史文件分页加载，Skills 缓存

## 快速开始

### 1. 创建飞书应用

1. 访问 [飞书开放平台](https://open.feishu.cn/app)
2. 创建企业自建应用
3. 开通以下权限：
   - `im:message` - 获取与发送消息
   - `im:message:send_as_bot` - 以应用身份发消息
   - `docx:document` - 文档操作
   - `contact:user.base:readonly` - 获取用户信息（可选）

4. **启用长连接模式**（重要！）：
   - 进入应用配置 → 事件订阅 → 订阅方式
   - 选择 **使用长连接接收事件**
   - 添加事件：`im.message.receive_v1`

### 2. 安装

```bash
# 克隆项目
git clone https://github.com/your-username/claude-feishu-bridge.git
cd claude-feishu-bridge

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入飞书应用配置
```

### 3. 配置

编辑 `.env` 文件：

```env
# 飞书应用配置（必填）
FEISHU_APP_ID=cli_xxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxx

# Anthropic API 配置（必填）
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx

# 工作空间根目录
WORKSPACE_ROOT=/path/to/your/projects

# 桥接服务配置
BRIDGE_PORT=3100
BRIDGE_HOST=localhost

# 可选：API 调优
MAX_TOKENS=8192
TOOL_TIMEOUT=30000
OUTPUT_LIMIT=10000
```

### 4. 启动服务

#### 开发模式

```bash
npm run dev
```

#### 生产模式（PM2）

```bash
# 安装 PM2（首次）
npm install -g pm2

# 启动服务
npm run start:pm2

# 查看状态
npm run status:pm2

# 查看日志
npm run logs:pm2

# 重启服务
npm run restart:pm2

# 停止服务
npm run stop:pm2
```

### 5. 配置 Claude Code MCP

在 Claude Code 的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "feishu": {
      "command": "node",
      "args": ["/path/to/claude-feishu-bridge/src/mcp-server.js"],
      "env": {
        "FEISHU_APP_ID": "your_app_id",
        "FEISHU_APP_SECRET": "your_app_secret",
        "NOTIFY_CHAT_ID": "your_notify_chat_id"
      }
    }
  }
}
```

## 使用方式

### 飞书机器人命令

在飞书中向机器人发送以下命令：

| 命令 | 说明 | 示例 |
|------|------|------|
| `/ls` | 列出当前目录文件 | `/ls` |
| `/cd <目录>` | 切换工作目录 | `/cd src/components` |
| `/..` | 返回上级目录 | `/..` |
| `/pwd` | 显示当前工作目录 | `/pwd` |
| `/clear` | 清除上下文 | `/clear` |
| `/context` | 查看当前上下文 | `/context` |
| `/help` | 显示帮助 | `/help` |

**直接发送消息**（不带 `/` 前缀）会自动在最近的会话中继续执行。

### Claude Code 调用飞书工具

配置 MCP 后，Claude Code 可以使用以下工具：

```javascript
// 发送消息
feishu_send_message({
  chat_id: "oc_xxx",
  message: "任务已完成！",
  msg_type: "text"
})

// 创建文档
feishu_create_document({
  title: "项目文档",
  content: "# 概述\n\n这是项目说明..."
})

// 发送通知
feishu_notify({
  title: "构建完成",
  summary: "所有测试通过，已部署到生产环境"
})

// 获取群聊列表
feishu_list_chats()

// 获取用户信息
feishu_get_user({ user_id: "ou_xxx" })
```

### 任务完成自动通知

会话结束时，桥接服务会自动向飞书推送完成通知，包括：
- 执行状态（成功/失败）
- 执行耗时
- 输出摘要
- 会话 ID（可用于继续）

## 项目结构

```
claude-feishu-bridge/
├── src/
│   ├── index.js              # 主入口
│   ├── bridge-server.js      # 桥接服务
│   ├── feishu-longpoll.js    # 飞书长连接客户端
│   ├── feishu-client.js      # 飞书 API 客户端
│   ├── mcp-server.js         # MCP 工具服务
│   ├── session/              # 会话管理模块
│   │   ├── session-manager.js
│   │   ├── session-storage.js
│   │   ├── session-executor.js
│   │   └── session-cleanup.js
│   ├── server/handlers/      # 命令处理器
│   ├── config/               # 配置管理
│   ├── tools/                # 工具模块
│   ├── skills/               # 技能模块
│   └── utils/                # 工具函数
├── test/                     # 测试文件 (Vitest)
├── scripts/                  # 脚本文件
├── logs/                     # PM2 日志目录
├── ecosystem.config.cjs      # PM2 配置
├── vitest.config.js          # 测试配置
├── .env.example              # 环境变量示例
├── CLAUDE.md                 # 项目架构说明
├── DEVELOPMENT_RULES.md      # 开发规范
└── README.md
```

## 配置说明

### 环境变量

| 变量名 | 必填 | 说明 | 默认值 |
|--------|------|------|--------|
| `FEISHU_APP_ID` | 是 | 飞书应用 ID | - |
| `FEISHU_APP_SECRET` | 是 | 飞书应用 Secret | - |
| `ANTHROPIC_API_KEY` | 是 | Anthropic API Key | - |
| `ANTHROPIC_BASE_URL` | 否 | API 代理地址 | - |
| `CLAUDE_MODEL` | 否 | 模型名称 | `claude-opus-4-20250514` |
| `WORKSPACE_ROOT` | 否 | 工作空间根目录 | `./workspace` |
| `BRIDGE_PORT` | 否 | 服务端口 | `3100` |
| `BRIDGE_HOST` | 否 | 服务主机 | `localhost` |
| `SESSION_TIMEOUT` | 否 | 会话超时时间(ms) | `7200000` (2小时) |
| `ALLOWED_USERS` | 否 | 允许的用户ID | 空(允许所有) |
| `ADMIN_USERS` | 否 | 管理员用户ID | - |
| `NOTIFY_CHAT_ID` | 否 | 默认通知群聊ID | - |
| `LOG_LEVEL` | 否 | 日志级别 | `INFO` |
| `MAX_TOKENS` | 否 | Claude API max_tokens | `8192` |
| `TOOL_TIMEOUT` | 否 | 工具执行超时(ms) | `30000` |
| `OUTPUT_LIMIT` | 否 | 输出截断长度 | `10000` |
| `SEARCH_FILES_LIMIT` | 否 | 文件搜索结果限制 | `100` |
| `SEARCH_CONTENT_LIMIT` | 否 | 内容搜索结果限制 | `50` |

### 安全配置

在 `.env` 中配置用户白名单：

```env
ALLOWED_USERS=ou_xxx,ou_yyy
ADMIN_USERS=ou_admin
```

## 长连接模式 vs Webhook 模式

| 对比项 | Webhook 模式 | 长连接模式 ✅ |
|--------|-------------|-------------|
| 公网域名 | 需要 | **不需要** |
| 内网穿透 | 需要 | **不需要** |
| HTTPS 证书 | 需要 | **不需要** |
| 配置复杂度 | 高 | **低** |
| 稳定性 | 依赖穿透服务 | **更稳定** |

## 开发

### 运行测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch

# 查看覆盖率
npm run test:coverage
```

### 开发规范

详见 [DEVELOPMENT_RULES.md](./DEVELOPMENT_RULES.md)

**核心规则：**
1. 每次修改需要新增对应的测试
2. 修改后需要测试全部通过

### 项目架构

详见 [CLAUDE.md](./CLAUDE.md)

## PM2 生产部署

### 方式一：使用 npm 脚本

```bash
# 安装 PM2
npm install -g pm2

# 启动
npm run start:pm2

# 管理命令
npm run status:pm2    # 查看状态
npm run logs:pm2      # 查看日志
npm run restart:pm2   # 重启
npm run stop:pm2      # 停止
```

### 方式二：使用脚本

```bash
# Linux/Mac
chmod +x scripts/start.sh scripts/stop.sh
./scripts/start.sh
./scripts/stop.sh
```

### PM2 配置说明

配置文件：`ecosystem.config.cjs`

- **内存限制**：500MB 自动重启
- **定时重启**：每天凌晨 4 点
- **日志位置**：`./logs/`
- **自动重启**：最多 10 次，指数退避

### 开机自启

```bash
pm2 startup
pm2 save
```

## 故障排查

### 长连接无法建立

- 检查飞书应用是否启用了长连接模式
- 确认网络可以访问公网（出网）
- 查看 App ID 和 App Secret 是否正确

### MCP 工具调用失败

- 检查 `.env` 中的飞书配置是否正确
- 确认应用有对应权限

### 会话无法继续

- 检查 `sessions` 目录是否存在
- 查看日志中的错误信息

## License

MIT

---

<a name="english"></a>
## English

# Claude Code Feishu Bridge

A bridge service enabling bidirectional integration between Claude Code and Feishu (Lark), allowing you to remotely control Claude Code via Feishu.

## Core Features

- **Remote Control via Feishu** - Send commands in Feishu to control Claude Code on your computer
- **Claude Operates Feishu** - Claude Code can send messages, create documents, and push notifications via MCP tools
- **Task Completion Notifications** - Automatic push notifications when tasks complete
- **Multi-session Management** - Support for multiple projects and sessions with persistence and recovery
- **Progress Feedback** - Real-time status reports during execution

## Key Advantages

- **Long Polling Mode** - No public domain, no tunneling, no HTTPS certificate required
- **Remote Control** - Send commands from mobile, execute on desktop
- **Session Management** - Multiple sessions, persistence, auto-recovery
- **MCP Tools** - Claude Code can directly call Feishu APIs
- **Performance Optimized** - Paginated history loading, Skills caching

## Quick Start

### 1. Create Feishu App

1. Visit [Feishu Open Platform](https://open.feishu.cn/app)
2. Create an enterprise app
3. Enable permissions:
   - `im:message` - Get and send messages
   - `im:message:send_as_bot` - Send as bot
   - `docx:document` - Document operations
   - `contact:user.base:readonly` - Get user info (optional)

4. **Enable Long Polling** (Important!):
   - Go to App Settings → Event Subscriptions → Subscription Mode
   - Select **Use Long Polling**
   - Add event: `im.message.receive_v1`

### 2. Install

```bash
git clone https://github.com/your-username/claude-feishu-bridge.git
cd claude-feishu-bridge
npm install
cp .env.example .env
# Edit .env with your Feishu app credentials
```

### 3. Start

```bash
# Development
npm run dev

# Production (PM2)
npm install -g pm2
npm run start:pm2
```

### 4. PM2 Commands

```bash
npm run status:pm2    # Check status
npm run logs:pm2      # View logs
npm run restart:pm2   # Restart
npm run stop:pm2      # Stop
```

## Testing

```bash
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## License

MIT
