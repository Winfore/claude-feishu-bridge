/**
 * 默认配置值
 */

export const DEFAULTS = {
  // 服务器配置
  port: 3100,
  host: 'localhost',

  // Claude API 配置
  model: 'claude-opus-4-20250514',
  maxTokens: 8192,

  // 工具执行配置
  toolTimeout: 30000,
  outputLimit: 10000,
  searchFilesLimit: 100,
  searchContentLimit: 50,

  // 会话配置
  sessionTimeout: 2 * 60 * 60 * 1000, // 2 小时
  completedSessionCleanupDelay: 5 * 60 * 1000, // 5 分钟
  fileRetentionDays: 30, // 磁盘文件保留 30 天

  // 清理配置
  cleanupInterval: 5 * 60 * 1000, // 5 分钟

  // 目录配置
  sessionsDir: './sessions',
  workspaceRoot: process.cwd()
};
