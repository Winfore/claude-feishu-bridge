/**
 * /ls 命令处理器 - 列出目录内容
 */

import { readdir } from 'fs/promises';
import { join } from 'path';
import { logger } from '../../utils/logger.js';

export async function lsHandler(ctx, { workspaceRoot, userContext }) {
  const userCtx = userContext.get(ctx.senderId);
  if (!userCtx) {
    return { success: false, message: '❌ 请先发送消息初始化' };
  }

  const currentPath = userCtx.currentPath || '';
  const fullPath = join(workspaceRoot, currentPath);

  try {
    const entries = await readdir(fullPath, { withFileTypes: true });
    if (entries.length === 0) {
      return { success: true, message: `📁 当前目录为空\n\n路径: /${currentPath || 'project'}` };
    }

    const folders = entries.filter(e => e.isDirectory()).map(e => `📁 ${e.name}/`);
    const files = entries.filter(e => e.isFile()).map(e => `📄 ${e.name}`);

    const list = [...folders, ...files].join('\n');
    return {
      success: true,
      message: `📁 当前目录: /${currentPath || 'project'}\n\n${list}\n\n💡 使用 /cd <目录名> 进入目录`
    };
  } catch (error) {
    logger.error('读取目录失败', error);
    return { success: false, message: `❌ 读取目录失败: ${error.message}` };
  }
}
