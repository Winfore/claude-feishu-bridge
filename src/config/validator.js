/**
 * 配置验证器
 */

import { ConfigError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { DEFAULTS } from './defaults.js';

/**
 * 验证必填配置项
 */
export function validateConfig(config) {
  const errors = [];

  // 必填项检查
  if (!config.appId) {
    errors.push('FEISHU_APP_ID is required');
  }

  if (!config.appSecret) {
    errors.push('FEISHU_APP_SECRET is required');
  }

  if (!config.anthropicApiKey) {
    errors.push('ANTHROPIC_API_KEY is required');
  }

  if (errors.length > 0) {
    throw new ConfigError('Configuration validation failed', { errors });
  }

  logger.success('Configuration validated successfully');
}

/**
 * 加载并合并配置
 */
export function loadConfig(envConfig = {}) {
  const config = {
    // 飞书应用配置
    appId: envConfig.FEISHU_APP_ID,
    appSecret: envConfig.FEISHU_APP_SECRET,
    encryptKey: envConfig.FEISHU_ENCRYPT_KEY,
    verificationToken: envConfig.FEISHU_VERIFICATION_TOKEN,

    // 服务器配置
    port: parseInt(envConfig.BRIDGE_PORT) || DEFAULTS.port,
    host: envConfig.BRIDGE_HOST || DEFAULTS.host,

    // 工作空间根目录（兼容旧配置 DEFAULT_WORKING_DIR）
    workspaceRoot: envConfig.WORKSPACE_ROOT || envConfig.DEFAULT_WORKING_DIR || DEFAULTS.workspaceRoot,

    // Anthropic API 配置
    anthropicApiKey: envConfig.ANTHROPIC_API_KEY,
    baseURL: envConfig.ANTHROPIC_BASE_URL,
    model: envConfig.CLAUDE_MODEL || DEFAULTS.model,

    // 会话配置
    sessionTimeout: parseInt(envConfig.SESSION_TIMEOUT) || DEFAULTS.sessionTimeout,

    // 权限控制
    allowedUsers: envConfig.ALLOWED_USERS,
    adminUsers: envConfig.ADMIN_USERS,

    // 通知配置
    notifyChatId: envConfig.NOTIFY_CHAT_ID,

    // 目录配置
    sessionsDir: envConfig.SESSIONS_DIR || DEFAULTS.sessionsDir
  };

  // 验证配置
  validateConfig(config);

  return config;
}
