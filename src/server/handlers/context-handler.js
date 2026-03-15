/**
 * /context 命令处理器 - 查看上下文信息
 */

export async function contextHandler(ctx, handlerContext) {
  const { sessions, userContext } = handlerContext;
  const userCtx = userContext.get(ctx.senderId);

  if (!userCtx?.sessionId) {
    return { success: false, message: '⚠️ 当前没有活跃会话\n💡 发送任意消息即可开始对话' };
  }

  const session = sessions.getSession(userCtx.sessionId);
  if (!session) {
    return { success: false, message: '⚠️ 会话不存在或已过期\n💡 发送任意消息即可开始新对话' };
  }

  const messageCount = session.messages?.length || 0;
  const totalChars = session.messages?.reduce((sum, m) => {
    const content = m.content;
    if (typeof content === 'string') {
      return sum + content.length;
    }
    if (Array.isArray(content)) {
      return sum + content.reduce((s, c) => s + (c.text?.length || 0), 0);
    }
    return sum;
  }, 0) || 0;

  const estimatedTokens = Math.ceil(totalChars / 4);
  const lastActivity = session.lastActivityTime
    ? new Date(session.lastActivityTime).toLocaleString('zh-CN')
    : '未知';

  const statusMap = {
    idle: '空闲',
    running: '执行中',
    completed: '已完成',
    error: '错误',
    terminated: '已终止'
  };

  return {
    success: true,
    message: `📊 上下文信息

🆔 会话 ID: ${session.id}
📁 项目: ${session.projectName}
📌 状态: ${statusMap[session.status] || session.status}
💬 消息数: ${messageCount}
🔢 估算 Token: ~${estimatedTokens.toLocaleString()}
⏰ 最后活动: ${lastActivity}
📂 工作目录: ${session.workingDir}`
  };
}
