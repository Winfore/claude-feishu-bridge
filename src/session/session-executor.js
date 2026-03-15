/**
 * Session 执行器
 * 负责 Claude API 调用、工具执行、MCP 集成
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFile, writeFile, mkdir, readdir, unlink, stat, rename } from 'fs/promises';
import { join, resolve, relative, dirname, normalize, isAbsolute } from 'path';
import { existsSync } from 'fs';
import { glob } from 'glob';
import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { homedir } from 'os';
import { logger } from '../utils/logger.js';
import { ToolExecutionError } from '../utils/errors.js';
import { createSkillTool, executeSkillTool } from '../tools/skill-tool.js';
import { DEFAULTS } from '../config/defaults.js';

/**
 * 工具定义：Claude 可以调用的工具
 */
const TOOLS = [
  {
    name: 'read_file',
    description: '读取文件内容。用于查看文件、理解代码等。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要读取的文件路径（相对于工作目录）' }
      },
      required: ['path']
    }
  },
  {
    name: 'list_directory',
    description: '列出目录内容。用于查看目录结构、查找文件等。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要列出的目录路径（相对于工作目录），默认为当前目录' }
      },
      required: []
    }
  },
  {
    name: 'search_files',
    description: '使用 glob 模式搜索文件。例如 "*.js" 搜索所有 JS 文件。',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob 搜索模式，如 "**/*.js"' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'search_content',
    description: '在文件中搜索内容（类似 grep）。用于查找代码、文本等。',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '要搜索的正则表达式或文本' },
        path: { type: 'string', description: '搜索路径（相对于工作目录），默认为当前目录' },
        file_pattern: { type: 'string', description: '文件过滤模式，如 "*.js"' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'write_file',
    description: '写入或创建文件。用于创建新文件、修改现有文件等。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要写入的文件路径（相对于工作目录）' },
        content: { type: 'string', description: '要写入的文件内容' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'delete_file',
    description: '删除文件或目录。谨慎使用！',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要删除的文件或目录路径（相对于工作目录）' }
      },
      required: ['path']
    }
  },
  {
    name: 'create_directory',
    description: '创建目录（包括父目录）。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要创建的目录路径（相对于工作目录）' }
      },
      required: ['path']
    }
  },
  {
    name: 'move_file',
    description: '移动或重命名文件。',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: '源文件路径' },
        destination: { type: 'string', description: '目标文件路径' }
      },
      required: ['source', 'destination']
    }
  },
  {
    name: 'execute_command',
    description: '执行 shell 命令。谨慎使用！用于运行构建、测试等命令。',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的命令' },
        timeout: { type: 'number', description: '超时时间（毫秒），默认 30000' }
      },
      required: ['command']
    }
  }
];

// 需要授权的工具列表
const TOOLS_NEEDING_AUTH = new Set([
  'write_file',
  'delete_file',
  'move_file',
  'execute_command'
]);

export class SessionExecutor {
  constructor(config = {}) {
    this.model = config.model || DEFAULTS.model;
    this.maxTokens = config.maxTokens || DEFAULTS.maxTokens;
    this.toolTimeout = config.toolTimeout || DEFAULTS.toolTimeout;
    this.outputLimit = config.outputLimit || DEFAULTS.outputLimit;
    this.searchFilesLimit = config.searchFilesLimit || DEFAULTS.searchFilesLimit;
    this.searchContentLimit = config.searchContentLimit || DEFAULTS.searchContentLimit;

    this.onProgress = config.onProgress || (() => {});

    // 初始化 Anthropic 客户端
    const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    const clientConfig = {
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        'anthropic-dangerous-direct-browser-access': 'true'
      }
    };

    if (config.baseURL) {
      clientConfig.baseURL = config.baseURL;
      clientConfig.defaultHeaders['x-api-key'] = apiKey;
      logger.info(`使用自定义 API 地址: ${clientConfig.baseURL}`);
    }

    this.anthropic = new Anthropic(clientConfig);

    // MCP 客户端相关
    this.mcpClients = new Map();
    this.mcpTools = [];
    this.mcpReady = false;

    // Skills 工具
    this.skillTool = null;
    this.skillsReady = false;

    // 异步初始化 MCP 和 Skills
    this.initMCP().catch(err => {
      logger.warn('MCP 初始化失败，将只使用内置工具:', err.message);
    });
    this.initSkills().catch(err => {
      logger.warn('Skills 初始化失败:', err.message);
    });
  }

  /**
   * 初始化 MCP 客户端
   */
  async initMCP() {
    const settingsPath = join(homedir(), '.claude', 'settings.json');

    if (!existsSync(settingsPath)) {
      logger.info('未找到 MCP 配置文件，跳过 MCP 初始化');
      this.mcpReady = true;
      return;
    }

    try {
      const settingsContent = await readFile(settingsPath, 'utf-8');
      const settings = JSON.parse(settingsContent);

      if (!settings.mcpServers || Object.keys(settings.mcpServers).length === 0) {
        logger.info('MCP 配置为空，跳过初始化');
        this.mcpReady = true;
        return;
      }

      logger.info(`发现 ${Object.keys(settings.mcpServers).length} 个 MCP 服务器配置`);

      for (const [name, config] of Object.entries(settings.mcpServers)) {
        try {
          await this.connectMCPServer(name, config);
        } catch (error) {
          logger.warn(`连接 MCP 服务器失败: ${name}`, error.message);
        }
      }

      this.mcpReady = true;
      logger.success(`MCP 初始化完成，加载了 ${this.mcpTools.length} 个工具`);
    } catch (error) {
      logger.error('MCP 初始化失败', error);
      this.mcpReady = true;
    }
  }

  /**
   * 连接 MCP 服务器
   */
  async connectMCPServer(name, config) {
    const client = new Client({ name, version: '1.0.0' }, { capabilities: {} });

    let transport;
    if (config.command) {
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: { ...process.env, ...config.env }
      });
    } else if (config.url) {
      const url = new URL(config.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        transport = new SSEClientTransport(url);
      } else {
        throw new Error(`不支持的协议: ${url.protocol}`);
      }
    } else {
      throw new Error('MCP 配置必须包含 command 或 url');
    }

    await client.connect(transport);
    const tools = await client.listTools();

    this.mcpClients.set(name, { client, transport, tools: tools.tools });
    this.mcpTools.push(...tools.tools);

    logger.mcp(`连接 MCP 服务器: ${name}, ${tools.tools.length} 个工具`);
  }

  /**
   * 调用 MCP 工具
   */
  async callMCPTool(toolName, params) {
    for (const [name, { client }] of this.mcpClients.entries()) {
      const tool = this.mcpTools.find(t => t.name === toolName);
      if (tool) {
        logger.debug(`调用 MCP 工具: ${toolName} (服务器: ${name})`);
        const result = await client.callTool({ name: toolName, arguments: params });
        return result.content;
      }
    }
    throw new ToolExecutionError(`MCP 工具不存在: ${toolName}`);
  }

  /**
   * 检查是否为 MCP 工具
   */
  isMCPTool(toolName) {
    return this.mcpTools.some(t => t.name === toolName);
  }

  /**
   * 获取所有可用工具（内置 + MCP + Skill）
   */
  getAllTools() {
    const tools = [...TOOLS, ...this.mcpTools];

    // 添加 skill 工具
    if (this.skillTool) {
      tools.push(this.skillTool);
    }

    return tools;
  }

  /**
   * 初始化 Skills 工具
   */
  async initSkills() {
    try {
      logger.info('正在初始化 Skills 工具...');
      this.skillTool = await createSkillTool();
      this.skillsReady = true;

      // 从工具描述中提取 skill 数量
      const skillCount = (this.skillTool.description.match(/<skill>/g) || []).length;
      if (skillCount > 0) {
        logger.success(`Skills 工具初始化完成，发现 ${skillCount} 个可用 skill`);
      } else {
        logger.info('Skills 工具初始化完成，未找到可用 skills');
      }
    } catch (error) {
      logger.error('Skills 初始化失败', error);
      this.skillsReady = true;
    }
  }

  /**
   * 等待 MCP 初始化完成
   */
  async waitForMCP(timeout = 10000) {
    if (this.mcpReady) return true;

    const startTime = Date.now();
    while (!this.mcpReady && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.mcpReady;
  }

  /**
   * 等待 Skills 初始化完成
   */
  async waitForSkills(timeout = 5000) {
    if (this.skillsReady) return true;

    const startTime = Date.now();
    while (!this.skillsReady && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.skillsReady;
  }

  /**
   * 判断工具是否需要授权
   */
  needsAuth(toolName) {
    return TOOLS_NEEDING_AUTH.has(toolName);
  }

  /**
   * 报告执行进度
   */
  reportProgress(sessionId, stage, details = {}) {
    if (this.onProgress) {
      this.onProgress(sessionId, {
        stage,
        timestamp: Date.now(),
        ...details
      });
    }
  }

  /**
   * 构建系统提示
   */
  buildSystemPrompt(workingDir) {
    return `你是一个有用的 AI 助手，可以帮助用户完成各种编程任务。

当前工作目录: ${workingDir}

你可以使用以下工具来完成任务：
- read_file: 读取文件内容
- list_directory: 列出目录内容
- search_files: 搜索文件
- search_content: 搜索文件内容
- write_file: 写入文件（需要授权）
- delete_file: 删除文件（需要授权）
- create_directory: 创建目录
- move_file: 移动文件（需要授权）
- execute_command: 执行命令（需要授权）
- load_skill: 加载专业技能（按需加载）

注意：
1. 所有文件路径都是相对于工作目录的
2. 写入、删除、移动文件和执行命令需要用户授权
3. 请谨慎使用危险操作
4. 当任务匹配某个 skill 时，使用 load_skill 工具加载详细指令`;
  }

  /**
   * 执行工具
   */
  async executeTool(toolName, params, workingDir) {
    // Skill 工具
    if (toolName === 'load_skill') {
      return await executeSkillTool(params);
    }

    const absolutePath = params.path ? resolve(workingDir, params.path) : workingDir;

    // 安全检查：确保路径在工作目录内（规范化后比较）
    const normalizedWorkingDir = normalize(workingDir);
    const normalizedAbsolutePath = normalize(absolutePath);
    const relativePath = relative(normalizedWorkingDir, normalizedAbsolutePath);

    // 如果相对路径以 .. 开头或者是绝对路径（跨盘符），则拒绝
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new ToolExecutionError(`路径超出工作目录范围: ${params.path}`);
    }

    switch (toolName) {
      case 'read_file':
        return await this.toolReadFile(absolutePath);
      case 'list_directory':
        return await this.toolListDirectory(absolutePath);
      case 'search_files':
        return await this.toolSearchFiles(params.pattern, workingDir);
      case 'search_content':
        return await this.toolSearchContent(params.pattern, absolutePath, params.file_pattern);
      case 'write_file':
        return await this.toolWriteFile(absolutePath, params.content);
      case 'delete_file':
        return await this.toolDeleteFile(absolutePath);
      case 'create_directory':
        return await this.toolCreateDirectory(absolutePath);
      case 'move_file':
        const destPath = resolve(workingDir, params.destination);
        return await this.toolMoveFile(absolutePath, destPath);
      case 'execute_command':
        return await this.toolExecuteCommand(params.command, workingDir, params.timeout);
      default:
        throw new ToolExecutionError(`未知工具: ${toolName}`);
    }
  }

  // ========== 工具实现 ==========

  async toolReadFile(filePath) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const stats = await stat(filePath);
      return { success: true, content, size: stats.size, path: filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async toolListDirectory(dirPath) {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      const items = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file'
      }));
      return { success: true, path: dirPath, items };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async toolSearchFiles(pattern, baseDir) {
    try {
      const files = await glob(pattern, { cwd: baseDir, nodir: true, absolute: false });
      return {
        success: true,
        pattern,
        files: files.slice(0, this.searchFilesLimit),
        count: files.length,
        truncated: files.length > this.searchFilesLimit
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async toolSearchContent(pattern, basePath, filePattern = '*') {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const isWindows = process.platform === 'win32';
      const cmd = isWindows
        ? `findstr /s /i /n "${pattern}" ${filePattern}`
        : `grep -r -n --include="${filePattern}" "${pattern}" .`;

      const { stdout } = await execAsync(cmd, {
        cwd: basePath,
        maxBuffer: 1024 * 1024
      });

      const lines = stdout.split('\n').filter(l => l.trim()).slice(0, this.searchContentLimit);
      return {
        success: true,
        pattern,
        results: lines,
        truncated: stdout.split('\n').length > this.searchContentLimit
      };
    } catch (error) {
      if (error.stdout) {
        return { success: true, pattern, results: [], message: '未找到匹配内容' };
      }
      return { success: false, error: error.message };
    }
  }

  async toolWriteFile(filePath, content) {
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf-8');
      return { success: true, path: filePath, size: content.length };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async toolDeleteFile(filePath) {
    try {
      await unlink(filePath);
      return { success: true, path: filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async toolCreateDirectory(dirPath) {
    try {
      await mkdir(dirPath, { recursive: true });
      return { success: true, path: dirPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async toolMoveFile(sourcePath, destPath) {
    try {
      await rename(sourcePath, destPath);
      return { success: true, source: sourcePath, destination: destPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async toolExecuteCommand(command, cwd, timeout) {
    timeout = timeout || this.toolTimeout;
    // 危险命令黑名单
    const dangerousCommands = [
      /rm\s+-rf\s+\//,          // rm -rf /
      /:\(\)\{\s*:\|\:&\s*\};:/, // fork bomb
      />\s*\/dev\/(sda|hda)/,   // 覆盖磁盘
      /mkfs/,                    // 格式化
      /dd\s+if=.*of=\/dev/      // dd 写设备
    ];

    for (const pattern of dangerousCommands) {
      if (pattern.test(command)) {
        return { success: false, error: '危险命令被阻止' };
      }
    }

    return new Promise((resolve) => {
      const child = spawn(command, [], {
        shell: true,
        cwd,
        timeout
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          exitCode: code,
          stdout: stdout.slice(0, this.outputLimit),
          stderr: stderr.slice(0, this.outputLimit),
          truncated: stdout.length > this.outputLimit || stderr.length > this.outputLimit
        });
      });

      child.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });
    });
  }

  /**
   * 关闭所有 MCP 连接
   */
  async close() {
    for (const [name, { client, transport }] of this.mcpClients.entries()) {
      try {
        await client.close();
        await transport.close();
        logger.info(`关闭 MCP 连接: ${name}`);
      } catch (error) {
        logger.warn(`关闭 MCP 连接失败: ${name}`, error);
      }
    }
    this.mcpClients.clear();
    this.mcpTools = [];
  }
}
