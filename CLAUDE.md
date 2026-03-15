# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code 飞书桥接服务 - A bridge service enabling bidirectional integration between Claude and Feishu (飞书). It allows:
1. **Claude to operate Feishu** - via MCP tools (send messages, create documents, notifications)
2. **Feishu remote control of Claude** - send commands from mobile, execute on desktop
3. **Task completion notifications** - automatic push notifications when tasks complete
4. **Project-based workspace management** - all projects organized under a workspace root directory

## Commands

```bash
npm start          # Start the bridge server (production)
npm run dev        # Start with auto-reload (--watch flag)
npm run mcp        # Run the MCP server standalone
npm test           # Run all tests (Vitest)
npm run test:watch # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

### PM2 生产部署

```bash
# 安装 PM2（首次）
npm install -g pm2

# 启动服务
npm run start:pm2

# 或使用启动脚本
./scripts/start.sh

# 查看状态
npm run status:pm2

# 查看日志
npm run logs:pm2

# 重启服务
npm run restart:pm2

# 停止服务
npm run stop:pm2
```

**PM2 常用命令**：
- `pm2 monit` - 实时监控
- `pm2 logs` - 查看日志
- `pm2 flush` - 清空日志
- `pm2 save` - 保存进程列表
- `pm2 startup` - 设置开机自启

## Architecture

The system has been refactored into a modular structure for better maintainability:

```
src/
├── index.js                # Entry point - loads config, starts BridgeServer
├── bridge-server.js        # HTTP server handling Feishu webhooks, routes commands to sessions
├── config/                 # Configuration management
│   ├── defaults.js         # Default configuration values
│   └── validator.js        # Configuration validation and loading
├── session/                # Session management (refactored from single file)
│   ├── session-manager.js  # Core session lifecycle management
│   ├── session-storage.js  # Persistence (JSONL + metadata)
│   ├── session-executor.js # Claude API calls, tool execution, MCP integration
│   └── session-cleanup.js  # Auto-cleanup for idle/completed sessions
├── server/                 # Server components
│   └── handlers/           # Command handlers (refactored from bridge-server.js)
│       ├── index.js        # Export all handlers
│       ├── ls-handler.js   # /ls command - list directory
│       ├── cd-handler.js   # /cd command - change directory
│       ├── up-handler.js   # /.. command - go up
│       ├── pwd-handler.js  # /pwd command - print working directory
│       ├── clear-handler.js # /clear command - clear context
│       ├── context-handler.js # /context command - show context
│       └── help-handler.js # /help command - show help
├── tools/                  # Tool modules
│   └── skill-tool.js       # Skill loading tool
├── skills/                 # Skill loader
│   └── skill-loader.js     # Load and parse SKILL.md files
├── feishu-longpoll.js      # Feishu WebSocket long-polling client
├── feishu-client.js        # Feishu API client
├── mcp-server.js           # MCP server exposing Feishu tools to Claude
└── utils/                  # Shared utilities
    ├── errors.js           # Custom error classes
    └── logger.js           # Unified logging with levels and formatting
```

### Module Responsibilities

**Session Module**:
- `session-manager.js`: Session creation, continuation, project switching, authorization management
- `session-storage.js`: JSONL history files, metadata persistence, file operations
- `session-executor.js`: Anthropic API integration, built-in tools, MCP client management
- `session-cleanup.js`: Timeout detection, automatic cleanup of idle/completed sessions

**Server Module**:
- `bridge-server.js`: HTTP server, message routing, user context management
- `handlers/`: Command handlers for /ls, /cd, /.., /pwd, /help (each in separate file)

**Config Module**:
- `validator.js`: Validates required environment variables, provides defaults
- `defaults.js`: Centralized default values for all configuration options

**Utils Module**:
- `logger.js`: Unified logging with emoji, timestamps, and log levels (DEBUG, INFO, WARN, ERROR)
- `errors.js`: Custom error classes (ConfigError, SessionError, FeishuError, ToolExecutionError, AuthorizationError)

### Key Data Flows

1. **Feishu → Claude**: Feishu webhook → `/webhook` endpoint → `handleFeishuMessage()` → `SessionManager.createSession()` or `continueSession()` → `SessionExecutor` calls Anthropic API

2. **Claude → Feishu**: Claude calls MCP tools → `SessionExecutor.callMCPTool()` → `mcp-server.js` → `FeishuClient` methods → Feishu API

3. **Session End Notification**: API call completes → `onSessionEnd` callback → `handleSessionEnd()` → `feishu.sendText()` to originating chat

4. **Tool Authorization**: Tool needs auth → `onToolNeedsAuth` callback → sends card to Feishu → user approves/rejects → `SessionManager.approveToolExecution()` or `rejectToolExecution()`

### Session Persistence

Sessions are stored in `./sessions/` via `SessionStorage`:
- `*.meta.json` - Session metadata (id, projectName, workingDir, source, chatId, createdAt)
- `*.jsonl` - Conversation history (append-only JSONL format)

On restart, `SessionManager.loadPersistedSessions()` restores sessions from meta files.

**Performance Optimization:**
- Large history files (>100 messages) only load the last 50 messages
- `loadHistoryTail()` efficiently reads the end of large files
- `getHistoryStats()` provides quick metadata without parsing

### Progress Feedback

During execution, progress is reported at key stages:
- `thinking` - Starting to process prompt
- `tool_call` - About to execute a built-in tool
- `mcp_call` - About to call an MCP tool
- `tool_result` - Tool execution completed

Progress updates are throttled to once per 5 seconds per session to avoid message spam.

## Configuration

Required environment variables (`.env`):

```
# Feishu Configuration
FEISHU_APP_ID        # Feishu app ID (required)
FEISHU_APP_SECRET    # Feishu app secret (required)
FEISHU_ENCRYPT_KEY   # (optional) For callback signature verification
FEISHU_VERIFICATION_TOKEN  # (optional) For callback verification

# Anthropic API Configuration
ANTHROPIC_API_KEY    # Anthropic API key (required)
ANTHROPIC_BASE_URL   # (optional) Custom API endpoint for proxy
CLAUDE_MODEL         # (optional) Model name, default: claude-opus-4-20250514
MAX_TOKENS           # (optional) max_tokens, default: 8192

# Workspace Configuration
WORKSPACE_ROOT       # Root directory for all projects (e.g., D:/project)
SESSION_TIMEOUT      # (optional) Session timeout in ms, default: 7200000 (2 hours)
SESSIONS_DIR         # (optional) Session storage directory, default: ./sessions

# Server Configuration
BRIDGE_PORT          # Server port (default: 3100)
BRIDGE_HOST          # Server host (default: localhost)

# Security
ALLOWED_USERS        # (optional) Comma-separated user IDs whitelist
ADMIN_USERS          # (optional) Comma-separated admin user IDs

# Notifications
NOTIFY_CHAT_ID       # Default chat for feishu_notify tool

# Logging
LOG_LEVEL            # (optional) Log level: DEBUG, INFO, WARN, ERROR (default: INFO)

# Tool Execution (optional)
TOOL_TIMEOUT         # Tool execution timeout in ms, default: 30000
OUTPUT_LIMIT         # Output truncation limit, default: 10000
SEARCH_FILES_LIMIT   # File search result limit, default: 100
SEARCH_CONTENT_LIMIT # Content search result limit, default: 50
```

Configuration is validated on startup via `config/validator.js`. Missing required fields will cause startup failure with clear error messages.

## Workspace Management

The system uses **project-based workspace management**:

- **Workspace Root**: `WORKSPACE_ROOT` (e.g., `D:/project`)
- **Projects**: Subdirectories under workspace root (e.g., `D:/project/test`)
- **Sessions**: Conversations with Claude, bound to specific projects
- **File Operations**: Restricted to project directories

### Example Usage

```bash
# Create new session with project
/new test 创建一个 hello world 程序
# → Creates D:/project/test directory
# → Session works in D:/project/test

# List all projects
/projects
# → Shows all directories under D:/project

# Switch session to different project
/switch <sessionId> another-project
# → Switches to D:/project/another-project
```

## Feishu Bot Commands

Handled in `setupDefaultHandlers()` in `bridge-server.js`:

| Command | Handler | Description |
|---------|---------|-------------|
| `/new <project> <prompt>` | `new` | Create new session with project |
| `/continue <id> <prompt>` | `continue` | Continue existing session |
| `/sessions` | `sessions` | List all active sessions |
| `/projects` | `projects` | List all projects in workspace |
| `/status <id>` | `status` | Get session status |
| `/switch <id> <project>` | `switch` | Switch session to different project |
| `/kill <id>` | `kill` | Terminate session |
| `/help` | `help` | Show help |

Plain messages (no `/` prefix) auto-continue the most recent session in that chat, or create a new session.

## MCP Tools

Defined in `mcp-server.js`:

- `feishu_send_message` - Send text/rich message to chat
- `feishu_create_document` - Create cloud document with optional content
- `feishu_list_chats` - List bot's group chats
- `feishu_notify` - Send task completion card notification
- `feishu_get_user` - Get user info by ID

## Session Management

### Session Lifecycle

1. **Creation**: `/new <project> <prompt>` creates session and project directory
2. **Execution**: Calls Anthropic API with conversation history
3. **Completion**: Saves history, triggers callback, sends notification
4. **Timeout**: Auto-cleanup after 30 minutes of inactivity
5. **Cleanup**: Completed sessions removed after 5 minutes

### Session Isolation

- Each session has independent conversation history
- Each session bound to specific project directory
- Sessions identified by unique `sessionId`
- Multiple sessions can run concurrently

### Auto-Cleanup

- **Idle sessions**: 30 minutes without activity → auto-cleanup
- **Completed sessions**: 5 minutes after completion → auto-cleanup
- Cleanup runs every 5 minutes

## Adding New Features

### New Feishu Bot Command

Add handler in `setupDefaultHandlers()`:

```javascript
this.registerHandler('mycommand', async (ctx) => {
  // ctx contains: chatId, messageId, senderId, content, args
  return { success: true, message: 'Response text', sessionId: optional };
});
```

### New MCP Tool

1. Add tool definition in `ListToolsRequestSchema` handler
2. Add case in `CallToolRequestSchema` handler switch statement
3. Use `feishu` client instance for API calls

### New Feishu API Method

Add method to `FeishuLongPollClient` class in `feishu-longpoll.js`. All methods should:
- Call `await this.client.im.message.create()` or similar SDK methods
- Check `response.code === 0` and throw on error

## Development Notes

- Uses ES modules (`"type": "module"` in package.json)
- No TypeScript, no build step - run directly with Node.js
- Session IDs format: `cc_${timestamp}_${randomUUID}`
- Uses `@anthropic-ai/sdk` for Claude API calls
- Uses `@larksuiteoapi/node-sdk` for Feishu API
- Long-polling mode: no public domain or HTTPS required

### Development Rules ⚠️ IMPORTANT

**Rule 1: Every code change requires corresponding tests**
- Any modification (new feature, bug fix, refactoring) must include tests
- Tests should cover core logic and edge cases
- Test files should be placed in `test/` directory
- Test framework: Vitest

**Rule 2: All tests must pass after modifications**
- Run `npm test` before committing
- All tests must pass (100% pass rate required)
- Fix failing tests or update them to match new behavior
- Do not commit code that breaks tests

**Current Test Status:**
- Test files: 5
- Test cases: 87
- Coverage: ~20%

**Workflow:**
```bash
# 1. Modify code
# 2. Add/update tests
# 3. Run tests
npm test
# 4. Ensure all tests pass ✅
# 5. Commit code
```

See `DEVELOPMENT_RULES.md` for detailed guidelines.

### Code Organization

- **Modular architecture**: Each module has a single responsibility
- **Dependency injection**: Dependencies passed via constructors for testability
- **Error handling**: Custom error classes in `utils/errors.js`
- **Logging**: Unified logger in `utils/logger.js` with levels and formatting
- **Configuration**: Validated on startup via `config/validator.js`

### Logging

Use the unified logger instead of `console.log`:

```javascript
import { logger } from './utils/logger.js';

logger.info('General information');
logger.error('Error message', error);
logger.session(sessionId, 'Session-specific log');
logger.feishu('Feishu-related log');
logger.mcp('MCP-related log');
```

Set `LOG_LEVEL` environment variable to control verbosity: DEBUG, INFO, WARN, ERROR.

### Error Handling

Use custom error classes for better error categorization:

```javascript
import { SessionError, ConfigError, ToolExecutionError } from './utils/errors.js';

throw new SessionError('Session not found', { sessionId });
throw new ConfigError('Missing required config', { field: 'ANTHROPIC_API_KEY' });
throw new ToolExecutionError('Tool execution failed', { toolName, error: err.message });
```

### Security

**Path Traversal Protection:**
- All file paths are normalized before checking
- Paths outside working directory are rejected
- Cross-drive paths (Windows) are detected

**Dangerous Command Blacklist:**
The `execute_command` tool blocks dangerous commands:
- `rm -rf /` - Recursive root delete
- Fork bombs
- Disk overwrite commands
- `mkfs` formatting
- `dd` to device files

## Refactoring History

See `REFACTORING.md` for detailed refactoring documentation. Key changes:
- Split 1379-line `session-manager.js` into 4 focused modules
- Added configuration validation and defaults
- Unified error handling and logging
- Improved testability through dependency injection

## Migration from spawn-based approach

The original implementation used `spawn` to call `claude` CLI, which doesn't work because:
- Claude CLI is an interactive tool, not an API
- Cannot get structured responses
- Cannot manage persistent conversations

The current implementation uses `@anthropic-ai/sdk` to directly call Claude API:
- Proper conversation history management
- Structured API responses
- Better error handling
- Session persistence and recovery
