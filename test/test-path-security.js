/**
 * 路径安全检查测试
 * 验证路径遍历防护是否正常工作
 */

import { SessionExecutor } from '../src/session/session-executor.js';
import { ToolExecutionError } from '../src/utils/errors.js';
import 'dotenv/config';

async function testPathSecurity() {
  console.log('========================================');
  console.log('路径安全检查测试');
  console.log('========================================\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('⚠️  跳过测试（需要 ANTHROPIC_API_KEY）');
    return true;
  }

  const executor = new SessionExecutor({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY
  });

  await executor.waitForMCP(5000);

  const workingDir = 'D:/project/claude-feishu-bridge';
  const tests = [];

  // 测试 1: 正常路径应该允许
  tests.push({
    name: '正常路径: foo/bar',
    path: 'foo/bar',
    shouldBlock: false
  });

  // 测试 2: 相对路径遍历应该被阻止
  tests.push({
    name: '路径遍历: ../../../etc/passwd',
    path: '../../../etc/passwd',
    shouldBlock: true
  });

  // 测试 3: 带有 ./ 和 .. 的复杂路径
  tests.push({
    name: '复杂路径: ./foo/../bar',
    path: './foo/../bar',
    shouldBlock: false
  });

  // 测试 4: 绝对路径（不同盘符）
  tests.push({
    name: '绝对路径（跨盘符）: C:/Windows/System32',
    path: 'C:/Windows/System32',
    shouldBlock: true
  });

  // 测试 5: 空路径（当前目录）
  tests.push({
    name: '空路径（当前目录）',
    path: '',
    shouldBlock: false
  });

  // 测试 6: 当前目录
  tests.push({
    name: '当前目录: .',
    path: '.',
    shouldBlock: false
  });

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await executor.executeTool('list_directory', { path: test.path }, workingDir);
      const wasBlocked = false;

      if (test.shouldBlock && !wasBlocked) {
        console.log(`❌ ${test.name} - 应该被阻止但没有`);
        failed++;
      } else if (!test.shouldBlock && !wasBlocked) {
        console.log(`✅ ${test.name} - 正确允许`);
        passed++;
      }
    } catch (error) {
      const wasBlocked = error instanceof ToolExecutionError;

      if (test.shouldBlock && wasBlocked) {
        console.log(`✅ ${test.name} - 正确阻止`);
        passed++;
      } else if (!test.shouldBlock && wasBlocked) {
        console.log(`❌ ${test.name} - 不应该被阻止但被阻止了`);
        failed++;
      } else {
        // 其他错误（如目录不存在），这是正常的
        if (test.shouldBlock) {
          console.log(`❌ ${test.name} - 应该被路径检查阻止，但抛出了其他错误: ${error.message}`);
          failed++;
        } else {
          console.log(`✅ ${test.name} - 通过路径检查（其他错误是预期的）`);
          passed++;
        }
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  console.log(`========================================`);

  return failed === 0;
}

async function testDangerousCommands() {
  console.log('\n========================================');
  console.log('危险命令黑名单测试');
  console.log('========================================\n');

  const executor = new SessionExecutor({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY
  });

  const dangerousCommands = [
    { name: 'rm -rf /', command: 'rm -rf /' },
    { name: 'fork bomb', command: ':(){ :|:& };:' },
    { name: '覆盖磁盘', command: 'cat /dev/zero > /dev/sda' },
    { name: '格式化', command: 'mkfs.ext4 /dev/sda1' },
    { name: 'dd 写设备', command: 'dd if=/dev/zero of=/dev/sda' }
  ];

  let passed = 0;
  let failed = 0;

  for (const { name, command } of dangerousCommands) {
    const result = await executor.toolExecuteCommand(command, '.', 5000);

    if (result.success === false && result.error === '危险命令被阻止') {
      console.log(`✅ ${name} - 正确阻止`);
      passed++;
    } else {
      console.log(`❌ ${name} - 未能阻止`);
      failed++;
    }
  }

  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  console.log(`========================================`);

  return failed === 0;
}

async function main() {
  const results = {
    pathSecurity: await testPathSecurity(),
    dangerousCommands: await testDangerousCommands()
  };

  const allPassed = Object.values(results).every(v => v);
  console.log(`\n总体结果: ${allPassed ? '✅ 全部通过' : '❌ 存在失败'}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
