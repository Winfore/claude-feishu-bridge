import { describe, it, expect, beforeEach } from 'vitest';
import { lsHandler } from '../../src/server/handlers/ls-handler.js';
import { cdHandler } from '../../src/server/handlers/cd-handler.js';
import { pwdHandler } from '../../src/server/handlers/pwd-handler.js';
import { helpHandler } from '../../src/server/handlers/help-handler.js';
import { upHandler } from '../../src/server/handlers/up-handler.js';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';

const TEST_WORKSPACE = './test-workspace-handlers-temp';

describe('Handlers', () => {
  let userContext;
  let mockSessions;

  beforeEach(async () => {
    userContext = new Map();
    mockSessions = {
      switchProject: async () => {}
    };

    await mkdir(TEST_WORKSPACE, { recursive: true });
    await mkdir(join(TEST_WORKSPACE, 'subdir'), { recursive: true });
    await writeFile(join(TEST_WORKSPACE, 'test.txt'), 'test content');
    await writeFile(join(TEST_WORKSPACE, 'subdir', 'nested.txt'), 'nested content');
  });

  afterEach(async () => {
    try {
      await rm(TEST_WORKSPACE, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  describe('lsHandler', () => {
    it('should return error when user context not initialized', async () => {
      const ctx = { senderId: 'user-1', args: '' };
      const result = await lsHandler(ctx, { workspaceRoot: TEST_WORKSPACE, userContext });
      expect(result.success).toBe(false);
      expect(result.message).toContain('初始化');
    });

    it('should list directory contents', async () => {
      userContext.set('user-1', { currentPath: '' });
      const ctx = { senderId: 'user-1', args: '' };
      const result = await lsHandler(ctx, { workspaceRoot: TEST_WORKSPACE, userContext });

      expect(result.success).toBe(true);
      expect(result.message).toContain('📁');
      expect(result.message).toContain('subdir');
      expect(result.message).toContain('test.txt');
    });

    it('should show empty directory message', async () => {
      await mkdir(join(TEST_WORKSPACE, 'empty-dir'), { recursive: true });
      userContext.set('user-1', { currentPath: 'empty-dir' });
      const ctx = { senderId: 'user-1', args: '' };
      const result = await lsHandler(ctx, { workspaceRoot: TEST_WORKSPACE, userContext });

      expect(result.success).toBe(true);
      expect(result.message).toContain('为空');
    });

    it('should handle subdirectory listing', async () => {
      userContext.set('user-1', { currentPath: 'subdir' });
      const ctx = { senderId: 'user-1', args: '' };
      const result = await lsHandler(ctx, { workspaceRoot: TEST_WORKSPACE, userContext });

      expect(result.success).toBe(true);
      expect(result.message).toContain('nested.txt');
    });
  });

  describe('cdHandler', () => {
    it('should return error when directory name is missing', async () => {
      const ctx = { senderId: 'user-1', args: '' };
      const result = await cdHandler(ctx, { workspaceRoot: TEST_WORKSPACE, userContext, sessions: mockSessions });
      expect(result.success).toBe(false);
      expect(result.message).toContain('用法');
    });

    it('should return error when user context not initialized', async () => {
      const ctx = { senderId: 'user-1', args: 'subdir' };
      const result = await cdHandler(ctx, { workspaceRoot: TEST_WORKSPACE, userContext, sessions: mockSessions });
      expect(result.success).toBe(false);
      expect(result.message).toContain('初始化');
    });

    it('should change to subdirectory', async () => {
      userContext.set('user-1', { currentPath: '' });
      const ctx = { senderId: 'user-1', args: 'subdir' };
      const result = await cdHandler(ctx, { workspaceRoot: TEST_WORKSPACE, userContext, sessions: mockSessions });

      expect(result.success).toBe(true);
      expect(result.message).toContain('已进入');
      expect(userContext.get('user-1').currentPath).toBe('subdir');
    });

    it('should return error for non-existent directory', async () => {
      userContext.set('user-1', { currentPath: '' });
      const ctx = { senderId: 'user-1', args: 'nonexistent' };
      const result = await cdHandler(ctx, { workspaceRoot: TEST_WORKSPACE, userContext, sessions: mockSessions });

      expect(result.success).toBe(false);
      expect(result.message).toContain('不存在');
    });

    it('should return error when trying to access outside workspace', async () => {
      userContext.set('user-1', { currentPath: '' });
      const ctx = { senderId: 'user-1', args: '../../../etc' };
      const result = await cdHandler(ctx, { workspaceRoot: TEST_WORKSPACE, userContext, sessions: mockSessions });

      expect(result.success).toBe(false);
      expect(result.message).toContain('工作空间之外');
    });

    it('should return error when cd into a file', async () => {
      userContext.set('user-1', { currentPath: '' });
      const ctx = { senderId: 'user-1', args: 'test.txt' };
      const result = await cdHandler(ctx, { workspaceRoot: TEST_WORKSPACE, userContext, sessions: mockSessions });

      expect(result.success).toBe(false);
      expect(result.message).toContain('不是目录');
    });
  });

  describe('pwdHandler', () => {
    it('should show uninitialized when no user context', async () => {
      const ctx = { senderId: 'user-1', args: '' };
      const result = await pwdHandler(ctx, { workspaceRoot: TEST_WORKSPACE, userContext });
      expect(result.success).toBe(true);
      expect(result.message).toContain('未初始化');
    });

    it('should show current path', async () => {
      userContext.set('user-1', { currentPath: 'subdir' });
      const ctx = { senderId: 'user-1', args: '' };
      const result = await pwdHandler(ctx, { workspaceRoot: TEST_WORKSPACE, userContext });

      expect(result.success).toBe(true);
      expect(result.message).toContain('subdir');
      expect(result.message).toContain('相对');
      expect(result.message).toContain('绝对');
    });

    it('should show project root when currentPath is empty', async () => {
      userContext.set('user-1', { currentPath: '' });
      const ctx = { senderId: 'user-1', args: '' };
      const result = await pwdHandler(ctx, { workspaceRoot: TEST_WORKSPACE, userContext });

      expect(result.success).toBe(true);
      expect(result.message).toContain('project');
    });
  });

  describe('helpHandler', () => {
    it('should return help message', async () => {
      const result = await helpHandler();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Claude Code');
      expect(result.message).toContain('/ls');
      expect(result.message).toContain('/cd');
      expect(result.message).toContain('/pwd');
    });

    it('should include all main commands', async () => {
      const result = await helpHandler();

      expect(result.message).toContain('/clear');
      expect(result.message).toContain('/context');
      expect(result.message).toContain('/..');
    });
  });

  describe('upHandler', () => {
    it('should return error when user context not initialized', async () => {
      const ctx = { senderId: 'user-1', args: '' };
      const result = await upHandler(ctx, { workspaceRoot: TEST_WORKSPACE, userContext, sessions: mockSessions });
      expect(result.success).toBe(false);
      expect(result.message).toContain('初始化');
    });

    it('should go up to parent directory', async () => {
      userContext.set('user-1', { currentPath: 'subdir', workingDir: join(TEST_WORKSPACE, 'subdir') });
      const ctx = { senderId: 'user-1', args: '' };
      const result = await upHandler(ctx, { workspaceRoot: TEST_WORKSPACE, userContext, sessions: mockSessions });

      expect(result.success).toBe(true);
      expect(userContext.get('user-1').currentPath).toBe('');
    });

    it('should return error when already at root', async () => {
      userContext.set('user-1', { currentPath: '', workingDir: TEST_WORKSPACE });
      const ctx = { senderId: 'user-1', args: '' };
      const result = await upHandler(ctx, { workspaceRoot: TEST_WORKSPACE, userContext, sessions: mockSessions });

      expect(result.success).toBe(false);
      expect(result.message).toContain('根目录');
    });

    it('should handle nested paths', async () => {
      await mkdir(join(TEST_WORKSPACE, 'a', 'b'), { recursive: true });
      userContext.set('user-1', { currentPath: 'a/b', workingDir: join(TEST_WORKSPACE, 'a', 'b') });
      const ctx = { senderId: 'user-1', args: '' };
      const result = await upHandler(ctx, { workspaceRoot: TEST_WORKSPACE, userContext, sessions: mockSessions });

      expect(result.success).toBe(true);
      expect(userContext.get('user-1').currentPath).toBe('a');
    });
  });
});
