/**
 * /cd 命令处理器 - 进入目录
 */

import { stat } from 'fs/promises';
import { join, resolve } from 'path';
import { logger } from '../../utils/logger.js';

export async function cdHandler(ctx, { workspaceRoot, userContext, sessions }) {
  const dirName = ctx.args.trim();
  if (!dirName) {
    return { success: false, message: '❌ 用法: /cd <目录名>\n使用 /ls 查看当前目录' };
  }

  const userCtx = userContext.get(ctx.senderId);
  if (!userCtx) {
    return { success: false, message: '❌ 请先发送消息初始化' };
  }

  const currentPath = userCtx.currentPath || '';
  const newPath = join(currentPath, dirName);
  const fullPath = join(workspaceRoot, newPath);

  // 安全检查：确保路径在 workspaceRoot 内
  const resolvedFull = resolve(fullPath);
  const resolvedRoot = resolve(workspaceRoot);
  if (!resolvedFull.startsWith(resolvedRoot)) {
    return { success: false, message: '❌ 不能访问工作空间之外的目录' };
  }

  try {
    const s = await stat(fullPath);
    if (!s.isDirectory()) {
      return { success: false, message: `❌ "${dirName}" 不是目录` };
    }

    // 更新用户上下文
    userCtx.currentPath = newPath;
    userCtx.workingDir = fullPath;
    userContext.set(ctx.senderId, userCtx);

    // 更新会话的工作目录
    if (userCtx.sessionId) {
      try {
        await sessions.switchProject(userCtx.sessionId, newPath);
      } catch (e) {
        logger.warn('切换会话项目失败', e);
      }
    }

    return {
      success: true,
      message: `✅ 已进入: /${newPath}\n\n使用 /ls 查看目录内容`
    };
  } catch (error) {
    return { success: false, message: `❌ 目录不存在: ${dirName}` };
  }
}
