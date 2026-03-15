import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { SessionStorage } from '../../src/session/session-storage.js';

const TEST_DIR = './test-sessions-temp';

describe('SessionStorage', () => {
  let storage;

  beforeEach(async () => {
    storage = new SessionStorage(TEST_DIR);
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  afterEach(async () => {
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
    } catch (e) {
      // ignore cleanup errors
    }
  });

  describe('getMetaPath / getHistoryPath', () => {
    it('should return correct meta file path', () => {
      const path = storage.getMetaPath('sess-123');
      expect(path).toBe(join(TEST_DIR, 'sess-123.meta.json'));
    });

    it('should return correct history file path', () => {
      const path = storage.getHistoryPath('sess-123');
      expect(path).toBe(join(TEST_DIR, 'sess-123.jsonl'));
    });
  });

  describe('saveMeta / loadMeta', () => {
    it('should save and load session metadata', async () => {
      const sessionId = 'test-sess-1';
      const metadata = {
        sessionId,
        projectName: 'test-project',
        workingDir: '/tmp/test',
        createdAt: new Date().toISOString()
      };

      await storage.saveMeta(sessionId, metadata);
      const loaded = await storage.loadMeta(sessionId);

      expect(loaded).toEqual(metadata);
    });

    it('should return null when loading non-existent metadata', async () => {
      const loaded = await storage.loadMeta('non-existent');
      expect(loaded).toBeNull();
    });

    it('should overwrite existing metadata', async () => {
      const sessionId = 'test-sess-2';
      const metadata1 = { projectName: 'project-1' };
      const metadata2 = { projectName: 'project-2' };

      await storage.saveMeta(sessionId, metadata1);
      await storage.saveMeta(sessionId, metadata2);
      const loaded = await storage.loadMeta(sessionId);

      expect(loaded.projectName).toBe('project-2');
    });
  });

  describe('appendHistory / loadHistory', () => {
    it('should append and load history messages', async () => {
      const sessionId = 'test-sess-3';
      const msg1 = { role: 'user', content: 'hello' };
      const msg2 = { role: 'assistant', content: 'hi there' };

      await storage.appendHistory(sessionId, msg1);
      await storage.appendHistory(sessionId, msg2);
      const history = await storage.loadHistory(sessionId);

      expect(history).toHaveLength(2);
      expect(history[0]).toEqual(msg1);
      expect(history[1]).toEqual(msg2);
    });

    it('should return empty array for non-existent history', async () => {
      const history = await storage.loadHistory('non-existent');
      expect(history).toEqual([]);
    });

    it('should handle JSONL format correctly', async () => {
      const sessionId = 'test-sess-4';
      await storage.appendHistory(sessionId, { key: 'value' });

      const content = await readFile(storage.getHistoryPath(sessionId), 'utf-8');
      expect(content.trim()).toBe('{"key":"value"}');
    });

    it('should append multiple messages as separate lines', async () => {
      const sessionId = 'test-sess-5';
      await storage.appendHistory(sessionId, { a: 1 });
      await storage.appendHistory(sessionId, { b: 2 });

      const content = await readFile(storage.getHistoryPath(sessionId), 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);
    });
  });

  describe('deleteSession', () => {
    it('should delete both meta and history files', async () => {
      const sessionId = 'test-sess-6';
      await storage.saveMeta(sessionId, { test: true });
      await storage.appendHistory(sessionId, { msg: 'test' });

      await storage.deleteSession(sessionId);

      expect(existsSync(storage.getMetaPath(sessionId))).toBe(false);
      expect(existsSync(storage.getHistoryPath(sessionId))).toBe(false);
    });

    it('should not throw when deleting non-existent session', async () => {
      await expect(storage.deleteSession('non-existent')).resolves.not.toThrow();
    });

    it('should delete only existing files', async () => {
      const sessionId = 'test-sess-7';
      await storage.saveMeta(sessionId, { test: true });

      await storage.deleteSession(sessionId);

      expect(existsSync(storage.getMetaPath(sessionId))).toBe(false);
    });
  });

  describe('listPersistedSessions', () => {
    it('should list all persisted sessions', async () => {
      await storage.saveMeta('sess-1', { projectName: 'project-1' });
      await storage.saveMeta('sess-2', { projectName: 'project-2' });

      const sessions = await storage.listPersistedSessions();

      expect(sessions).toHaveLength(2);
      const names = sessions.map(s => s.projectName);
      expect(names).toContain('project-1');
      expect(names).toContain('project-2');
    });

    it('should return empty array when no sessions exist', async () => {
      const sessions = await storage.listPersistedSessions();
      expect(sessions).toEqual([]);
    });

    it('should include sessionId in returned objects', async () => {
      await storage.saveMeta('sess-with-id', { projectName: 'test' });

      const sessions = await storage.listPersistedSessions();
      const found = sessions.find(s => s.projectName === 'test');

      expect(found.sessionId).toBe('sess-with-id');
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should delete sessions older than maxAge', async () => {
      const oldSessionId = 'old-session';
      const newSessionId = 'new-session';
      const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
      const newDate = new Date().toISOString();

      await storage.saveMeta(oldSessionId, { createdAt: oldDate });
      await storage.saveMeta(newSessionId, { createdAt: newDate });

      const oneHour = 1000 * 60 * 60;
      await storage.cleanupExpiredSessions(oneHour);

      const sessions = await storage.listPersistedSessions();
      expect(sessions.find(s => s.sessionId === oldSessionId)).toBeUndefined();
      expect(sessions.find(s => s.sessionId === newSessionId)).toBeDefined();
    });

    it('should not delete sessions within maxAge', async () => {
      const sessionId = 'fresh-session';
      await storage.saveMeta(sessionId, { createdAt: new Date().toISOString() });

      const oneHour = 1000 * 60 * 60;
      await storage.cleanupExpiredSessions(oneHour);

      const sessions = await storage.listPersistedSessions();
      expect(sessions.find(s => s.sessionId === sessionId)).toBeDefined();
    });
  });
});
