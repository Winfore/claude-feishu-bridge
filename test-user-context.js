/**
 * 测试用户上下文初始化
 */

import { BridgeServer } from './src/bridge-server.js';

async function testUserContext() {
  console.log('=== 测试用户上下文初始化 ===\n');

  // 创建 BridgeServer 实例
  const server = new BridgeServer({
    appId: 'test',
    appSecret: 'test',
    workspaceRoot: './test-workspace',
    anthropicApiKey: 'test'
  });

  const testUserId = 'test-user-123';
  const testChatId = 'test-chat-456';

  console.log('1. 测试首次初始化用户上下文...');
  const userCtx1 = await server.ensureUserContext(testUserId, testChatId);
  console.log(`   ✅ 用户上下文已创建`);
  console.log(`   - userId: ${userCtx1.userId}`);
  console.log(`   - currentPath: ${userCtx1.currentPath}`);
  console.log(`   - workingDir: ${userCtx1.workingDir}`);
  console.log(`   - chatId: ${userCtx1.chatId}\n`);

  console.log('2. 测试重复调用（应该返回现有上下文）...');
  const userCtx2 = await server.ensureUserContext(testUserId, testChatId);
  console.log(`   ✅ 返回现有上下文`);
  console.log(`   - 是同一个对象: ${userCtx1 === userCtx2}\n`);

  console.log('3. 测试 userContext Map...');
  const storedCtx = server.userContext.get(testUserId);
  console.log(`   ✅ 可以从 Map 中获取`);
  console.log(`   - 存在: ${!!storedCtx}`);
  console.log(`   - userId 匹配: ${storedCtx.userId === testUserId}\n`);

  console.log('4. 测试命令处理器上下文...');
  const handlerContext = {
    workspaceRoot: server.config.workspaceRoot,
    userContext: server.userContext,
    sessions: server.sessions
  };
  console.log(`   ✅ handlerContext 已创建`);
  console.log(`   - userContext 类型: ${handlerContext.userContext.constructor.name}`);
  console.log(`   - userContext.get 存在: ${typeof handlerContext.userContext.get === 'function'}\n`);

  console.log('5. 模拟 lsHandler 调用...');
  const ctx = { senderId: testUserId };
  const userCtxFromHandler = handlerContext.userContext.get(ctx.senderId);
  console.log(`   ✅ lsHandler 可以获取用户上下文`);
  console.log(`   - 存在: ${!!userCtxFromHandler}`);
  console.log(`   - currentPath: ${userCtxFromHandler.currentPath}\n`);

  // 清理
  await server.sessions.close();

  console.log('=== 测试完成 ===');
}

testUserContext().catch(console.error);
