import { describe, it, expect } from 'vitest';
import {
  BridgeError,
  ConfigError,
  SessionError,
  FeishuError,
  ToolExecutionError,
  AuthorizationError
} from '../../src/utils/errors.js';

describe('Error Classes', () => {
  describe('BridgeError', () => {
    it('should create error with message, code and details', () => {
      const error = new BridgeError('Test error', 'TEST_CODE', { key: 'value' });
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toEqual({ key: 'value' });
      expect(error.name).toBe('BridgeError');
    });

    it('should create error with default empty details', () => {
      const error = new BridgeError('Test error', 'TEST_CODE');
      expect(error.details).toEqual({});
    });

    it('should be instance of Error', () => {
      const error = new BridgeError('Test error', 'TEST_CODE');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ConfigError', () => {
    it('should create error with CONFIG_ERROR code', () => {
      const error = new ConfigError('Missing config', { field: 'API_KEY' });
      expect(error.message).toBe('Missing config');
      expect(error.code).toBe('CONFIG_ERROR');
      expect(error.details).toEqual({ field: 'API_KEY' });
      expect(error.name).toBe('ConfigError');
    });

    it('should be instance of BridgeError', () => {
      const error = new ConfigError('Test');
      expect(error).toBeInstanceOf(BridgeError);
    });
  });

  describe('SessionError', () => {
    it('should create error with SESSION_ERROR code', () => {
      const error = new SessionError('Session not found', { sessionId: 'sess-123' });
      expect(error.message).toBe('Session not found');
      expect(error.code).toBe('SESSION_ERROR');
      expect(error.details).toEqual({ sessionId: 'sess-123' });
      expect(error.name).toBe('SessionError');
    });

    it('should be instance of BridgeError', () => {
      const error = new SessionError('Test');
      expect(error).toBeInstanceOf(BridgeError);
    });
  });

  describe('FeishuError', () => {
    it('should create error with FEISHU_ERROR code', () => {
      const error = new FeishuError('API failed', { endpoint: '/messages' });
      expect(error.message).toBe('API failed');
      expect(error.code).toBe('FEISHU_ERROR');
      expect(error.details).toEqual({ endpoint: '/messages' });
      expect(error.name).toBe('FeishuError');
    });

    it('should be instance of BridgeError', () => {
      const error = new FeishuError('Test');
      expect(error).toBeInstanceOf(BridgeError);
    });
  });

  describe('ToolExecutionError', () => {
    it('should create error with TOOL_EXECUTION_ERROR code', () => {
      const error = new ToolExecutionError('Tool failed', { toolName: 'read_file' });
      expect(error.message).toBe('Tool failed');
      expect(error.code).toBe('TOOL_EXECUTION_ERROR');
      expect(error.details).toEqual({ toolName: 'read_file' });
      expect(error.name).toBe('ToolExecutionError');
    });

    it('should be instance of BridgeError', () => {
      const error = new ToolExecutionError('Test');
      expect(error).toBeInstanceOf(BridgeError);
    });
  });

  describe('AuthorizationError', () => {
    it('should create error with AUTHORIZATION_ERROR code', () => {
      const error = new AuthorizationError('Unauthorized', { userId: 'user-123' });
      expect(error.message).toBe('Unauthorized');
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.details).toEqual({ userId: 'user-123' });
      expect(error.name).toBe('AuthorizationError');
    });

    it('should be instance of BridgeError', () => {
      const error = new AuthorizationError('Test');
      expect(error).toBeInstanceOf(BridgeError);
    });
  });

  describe('Error inheritance chain', () => {
    it('all custom errors should be instances of Error', () => {
      const errors = [
        new ConfigError('test'),
        new SessionError('test'),
        new FeishuError('test'),
        new ToolExecutionError('test'),
        new AuthorizationError('test')
      ];

      errors.forEach(error => {
        expect(error).toBeInstanceOf(Error);
      });
    });

    it('all custom errors should be instances of BridgeError', () => {
      const errors = [
        new ConfigError('test'),
        new SessionError('test'),
        new FeishuError('test'),
        new ToolExecutionError('test'),
        new AuthorizationError('test')
      ];

      errors.forEach(error => {
        expect(error).toBeInstanceOf(BridgeError);
      });
    });
  });
});
