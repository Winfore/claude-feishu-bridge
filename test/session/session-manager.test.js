import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { SessionManager } from '../../src/session/session-manager.js';
import { SessionStorage } from '../../src/session/session-storage.js';
import { SessionError } from '../../src/utils/errors.js';

const TEST_WORKSPACE = './test-workspace-temp';
const TEST_SESSIONS_DIR = './test-sessions-manager-temp';

vi.mock('../../src/session/session-executor.js', () => ({
  SessionExecutor: class {
    constructor() {
      this.anthropic = { messages: { create: vi.fn() } };
      this.model = 'test-model';
    }
    async waitForMCP() { return true; }
    getAllTools() { return []; }
    buildSystemPrompt(dir) { return `Working dir: ${dir}`; }
    isMCPTool() { return false; }
    needsAuth() { return false; }
    async executeTool() { return { success: true }; }
    async close() {}
  }
}));

describe('SessionManager', () => {
  let manager;

  beforeEach(async () => {
    vi.clearAllMocks();
    await mkdir(TEST_WORKSPACE, { recursive: true });
    manager = new SessionManager({
      workspaceRoot: TEST_WORKSPACE,
      sessionsDir: TEST_SESSIONS_DIR,
      anthropicApiKey: 'test-key',
      onSessionEnd: vi.fn(),
      onToolNeedsAuth: vi.fn()
    });
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    if (manager) {
      await manager.close();
    }
    try {
      await rm(TEST_WORKSPACE, { recursive: true, force: true });
      await rm(TEST_SESSIONS_DIR, { recursive: true, force: true });
    } catch (e) {
      // ignore cleanup errors
    }
  });

  describe('generateSessionId', () => {
    it('should generate unique session IDs', () => {
      const id1 = manager.generateSessionId();
      const id2 = manager.generateSessionId();
      expect(id1).not.toBe(id2);
    });

    it('should have correct format: cc_<timestamp>_<random>', () => {
      const id = manager.generateSessionId();
      expect(id).toMatch(/^cc_[a-z0-9]+_[a-f0-9]{8}$/);
    });
  });

  describe('createSession', () => {
    it('should create session with project name', async () => {
      const session = await manager.createSession({
        projectName: 'test-project',
        source: 'test',
        chatId: 'chat-123'
      });

      expect(session.id).toBeDefined();
      expect(session.projectName).toBe('test-project');
      expect(session.workingDir).toBe(join(TEST_WORKSPACE, 'test-project'));
      expect(session.status).toBe('idle');
    });

    it('should throw error when projectName is missing', async () => {
      await expect(manager.createSession({})).rejects.toThrow(SessionError);
    });

    it('should create project directory', async () => {
      await manager.createSession({ projectName: 'new-project' });
      const session = manager.getSession(manager.listAllSessions()[0].id);
      expect(session.workingDir).toContain('new-project');
    });

    it('should store session in sessions map', async () => {
      const session = await manager.createSession({ projectName: 'stored-project' });
      expect(manager.getSession(session.id)).toBeDefined();
    });

    it('should accept custom sessionId', async () => {
      const session = await manager.createSession({
        sessionId: 'custom-id-123',
        projectName: 'custom-project'
      });
      expect(session.id).toBe('custom-id-123');
    });
  });

  describe('getSession', () => {
    it('should return session by id', async () => {
      const created = await manager.createSession({ projectName: 'get-test' });
      const session = manager.getSession(created.id);
      expect(session).toBeDefined();
      expect(session.projectName).toBe('get-test');
    });

    it('should return undefined for non-existent session', () => {
      const session = manager.getSession('non-existent');
      expect(session).toBeUndefined();
    });
  });

  describe('listSessions', () => {
    it('should list active sessions only', async () => {
      await manager.createSession({ projectName: 'active-project' });

      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(1);
    });

    it('should exclude completed sessions', async () => {
      const session = await manager.createSession({ projectName: 'to-complete' });
      session.status = 'completed';

      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(0);
    });

    it('should exclude error sessions', async () => {
      const session = await manager.createSession({ projectName: 'to-error' });
      session.status = 'error';

      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(0);
    });

    it('should exclude terminated sessions', async () => {
      const session = await manager.createSession({ projectName: 'to-terminate' });
      session.status = 'terminated';

      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(0);
    });
  });

  describe('listAllSessions', () => {
    it('should list all sessions including completed', async () => {
      const session = await manager.createSession({ projectName: 'all-test' });
      session.status = 'completed';

      const sessions = manager.listAllSessions();
      expect(sessions).toHaveLength(1);
    });
  });

  describe('terminateSession', () => {
    it('should set session status to terminated', async () => {
      const session = await manager.createSession({ projectName: 'to-terminate' });
      manager.terminateSession(session.id);

      expect(manager.getSession(session.id).status).toBe('terminated');
    });

    it('should not throw for non-existent session', () => {
      expect(() => manager.terminateSession('non-existent')).not.toThrow();
    });
  });

  describe('switchProject', () => {
    it('should switch session to different project', async () => {
      const session = await manager.createSession({ projectName: 'original-project' });
      await manager.switchProject(session.id, 'new-project');

      expect(session.projectName).toBe('new-project');
      expect(session.workingDir).toBe(join(TEST_WORKSPACE, 'new-project'));
    });

    it('should throw error for non-existent session', async () => {
      await expect(manager.switchProject('non-existent', 'project')).rejects.toThrow(SessionError);
    });

    it('should create new project directory', async () => {
      const session = await manager.createSession({ projectName: 'switch-test' });
      await manager.switchProject(session.id, 'created-project');
      expect(session.workingDir).toContain('created-project');
    });
  });

  describe('listProjects', () => {
    it('should list project directories', async () => {
      await manager.createSession({ projectName: 'project-1' });
      await manager.createSession({ projectName: 'project-2' });

      const projects = await manager.listProjects();
      expect(projects).toContain('project-1');
      expect(projects).toContain('project-2');
    });
  });

  describe('pendingAuth management', () => {
    it('getPendingAuth should return null for non-existent auth', () => {
      const auth = manager.getPendingAuth('non-existent', 'tool-1');
      expect(auth).toBeNull();
    });
  });

  describe('saveSessionMeta / appendHistory', () => {
    it('should save session metadata', async () => {
      const session = await manager.createSession({ projectName: 'meta-test' });
      const storage = new SessionStorage(TEST_SESSIONS_DIR);
      await new Promise(resolve => setTimeout(resolve, 50));
      const meta = await storage.loadMeta(session.id);

      expect(meta).toBeDefined();
      expect(meta.projectName).toBe('meta-test');
    });
  });
});
