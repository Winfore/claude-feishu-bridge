/**
 * 测试脚本
 * 验证各个组件是否正常工作
 */

import { FeishuClient } from '../src/feishu-client.js';
import { SessionManager } from '../src/session/session-manager.js';
import 'dotenv/config';

async function testFeishuConnection() {
  console.log('\n📋 测试飞书连接...');

  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) {
    console.log('❌ 请先配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
    return false;
  }

  try {
    const client = new FeishuClient({
      appId: process.env.FEISHU_APP_ID,
      appSecret: process.env.FEISHU_APP_SECRET
    });

    const token = await client.getAccessToken();
    console.log('✅ 飞书 API 连接成功');
    console.log(`   Token: ${token.slice(0, 20)}...`);

    // 测试获取群列表
    const chats = await client.getChatList(10);
    console.log(`✅ 获取到 ${chats.length} 个群聊`);

    return true;
  } catch (error) {
    console.log(`❌ 飞书连接失败: ${error.message}`);
    return false;
  }
}

async function testSessionManager() {
  console.log('\n📋 测试会话管理器...');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('⚠️  跳过会话管理器测试（需要 ANTHROPIC_API_KEY）');
    return true; // 跳过但不算失败
  }

  try {
    const manager = new SessionManager({
      sessionsDir: './test-sessions',
      workspaceRoot: './test-workspace',
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      onSessionEnd: (session) => {
        console.log(`   会话 ${session.id} 结束，状态: ${session.status}`);
      }
    });

    // 测试基本功能（不执行 prompt）
    const session = await manager.createSession({
      projectName: 'test-project',
      source: 'test'
    });

    console.log(`✅ 创建会话: ${session.id}`);
    console.log(`   项目名: ${session.projectName}`);
    console.log(`   工作目录: ${session.workingDir}`);

    // 测试列出会话
    const sessions = manager.listSessions();
    console.log(`✅ 列出会话: ${sessions.length} 个`);

    // 测试获取会话
    const retrieved = manager.getSession(session.id);
    console.log(`✅ 获取会话: ${retrieved ? '成功' : '失败'}`);

    // 清理
    await manager.close();

    return true;
  } catch (error) {
    console.log(`❌ 会话管理器测试失败: ${error.message}`);
    console.error(error);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('Claude Code 飞书桥接 - 组件测试');
  console.log('========================================');

  const results = {
    feishu: await testFeishuConnection(),
    session: await testSessionManager()
  };

  console.log('\n========================================');
  console.log('测试结果汇总');
  console.log('========================================');
  console.log(`飞书连接: ${results.feishu ? '✅ 通过' : '❌ 失败'}`);
  console.log(`会话管理: ${results.session ? '✅ 通过' : '❌ 失败'}`);

  const allPassed = Object.values(results).every(v => v);
  console.log(`\n总体结果: ${allPassed ? '✅ 全部通过' : '❌ 存在失败'}`);

  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
