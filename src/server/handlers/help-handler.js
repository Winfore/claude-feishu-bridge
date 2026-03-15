/**
 * /help 命令处理器 - 显示帮助信息
 */

export async function helpHandler() {
  return {
    success: true,
    message: `🤖 Claude Code 飞书远程控制

💬 对话命令:
/clear - 清空对话历史
/context - 查看上下文信息

📁 目录命令:
/ls - 列出当前目录内容
/cd <目录名> - 进入子目录
/.. 或 .. - 返回上级目录
/pwd - 显示当前路径

💡 提示:
• 直接发送消息即可与 Claude 对话
• 对话历史会自动保存，长时间不回复可继续
• 只能在工作空间目录下操作
• 危险操作需要授权确认`
  };
}
