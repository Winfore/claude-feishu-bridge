/**
 * 自定义错误类
 */

export class BridgeError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.details = details;
  }
}

export class ConfigError extends BridgeError {
  constructor(message, details) {
    super(message, 'CONFIG_ERROR', details);
    this.name = 'ConfigError';
  }
}

export class SessionError extends BridgeError {
  constructor(message, details) {
    super(message, 'SESSION_ERROR', details);
    this.name = 'SessionError';
  }
}

export class FeishuError extends BridgeError {
  constructor(message, details) {
    super(message, 'FEISHU_ERROR', details);
    this.name = 'FeishuError';
  }
}

export class ToolExecutionError extends BridgeError {
  constructor(message, details) {
    super(message, 'TOOL_EXECUTION_ERROR', details);
    this.name = 'ToolExecutionError';
  }
}

export class AuthorizationError extends BridgeError {
  constructor(message, details) {
    super(message, 'AUTHORIZATION_ERROR', details);
    this.name = 'AuthorizationError';
  }
}
