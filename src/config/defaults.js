/**
 * 默认配置值
 */

export const DEFAULTS = {
  // 服务器配置
  port: 3100,
  host: 'localhost',

  // Claude API 配置
  model: 'claude-opus-4-20250514',

  // 会话配置
  sessionTimeout: 30 * 60 * 1000, // 30 分钟
  completedSessionCleanupDelay: 5 * 60 * 1000, // 5 分钟

  // 清理配置
  cleanupInterval: 5 * 60 * 1000, // 5 分钟

  // 目录配置
  sessionsDir: './sessions',
  workspaceRoot: process.cwd()
};
