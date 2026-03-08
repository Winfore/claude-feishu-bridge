/**
 * /.. 命令处理器 - 返回上级目录
 */

import { dirname, join } from 'path';
import { logger } from '../../utils/logger.js';

export async function upHandler(ctx, { workspaceRoot, userContext, sessions }) {
  const userCtx = userContext.get(ctx.senderId);
  if (!userCtx) {
    return { success: false, message: '❌ 请先发送消息初始化' };
  }

  const currentPath = userCtx.currentPath || '';
  if (!currentPath || currentPath === '') {
    return { success: false, message: '❌ 已经在根目录，无法返回上级' };
  }

  const newPath = dirname(currentPath);
  const fullPath = join(workspaceRoot, newPath);

  // 更新用户上下文
  userCtx.currentPath = newPath === '.' ? '' : newPath;
  userCtx.workingDir = fullPath;
  userContext.set(ctx.senderId, userCtx);

  // 更新会话的工作目录
  if (userCtx.sessionId) {
    try {
      await sessions.switchProject(userCtx.sessionId, userCtx.currentPath || '');
    } catch (e) {
      logger.warn('切换会话项目失败', e);
    }
  }

  return {
    success: true,
    message: `✅ 已返回: /${userCtx.currentPath || 'project'}\n\n使用 /ls 查看目录内容`
  };
}
