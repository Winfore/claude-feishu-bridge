/**
 * /pwd 命令处理器 - 显示当前路径
 */

import { join } from 'path';

export async function pwdHandler(ctx, { workspaceRoot, userContext }) {
  const userCtx = userContext.get(ctx.senderId);
  if (!userCtx) {
    return { success: true, message: '📍 当前路径: 未初始化' };
  }

  const currentPath = userCtx.currentPath || '';
  return {
    success: true,
    message: `📍 当前路径:\n• 相对: /${currentPath || 'project'}\n• 绝对: ${join(workspaceRoot, currentPath)}`
  };
}
