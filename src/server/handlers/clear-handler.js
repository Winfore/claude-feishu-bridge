/**
 * /clear 命令处理器 - 清空对话历史
 */

export async function clearHandler(ctx, handlerContext) {
  const { sessions, userContext } = handlerContext;
  const userCtx = userContext.get(ctx.senderId);

  if (!userCtx?.sessionId) {
    return { success: false, message: '⚠️ 当前没有活跃会话' };
  }

  const session = sessions.getSession(userCtx.sessionId);
  if (!session) {
    return { success: false, message: '⚠️ 会话不存在' };
  }

  const messageCount = session.messages?.length || 0;
  session.messages = [];

  return {
    success: true,
    message: `✅ 已清空对话历史（共 ${messageCount} 条消息）`
  };
}
