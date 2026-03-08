/**
 * Skills 系统测试脚本
 */

import { loadAllSkills, generateSkillsPrompt, parseSkillInvocation } from './src/skills/skill-loader.js';

async function testSkills() {
  console.log('=== Skills 系统测试 ===\n');

  // 1. 加载所有 skills
  console.log('1. 加载 Skills...');
  const skills = await loadAllSkills();
  console.log(`   找到 ${skills.length} 个 skills:\n`);

  for (const skill of skills) {
    console.log(`   📦 ${skill.name}`);
    const desc = skill.description.length > 80
      ? skill.description.substring(0, 80) + '...'
      : skill.description;
    console.log(`      描述: ${desc}`);
    console.log(`      路径: ${skill.path}`);
    console.log(`      用户可调用: ${skill.userInvocable ? '是' : '否'}`);
    if (Array.isArray(skill.allowedTools) && skill.allowedTools.length > 0) {
      console.log(`      允许的工具: ${skill.allowedTools.join(', ')}`);
    }
    console.log('');
  }

  // 2. 生成系统提示
  console.log('\n2. 生成系统提示...');
  const prompt = await generateSkillsPrompt();
  console.log(`   生成的提示长度: ${prompt.length} 字符`);
  console.log(`   预览:\n`);
  console.log(prompt.substring(0, 500) + '...\n');

  // 3. 测试 skill 调用解析
  console.log('\n3. 测试 Skill 调用解析...');
  const testCases = [
    '/writestory 写第一章',
    '/claude-to-im status',
    '/docs-write',
    'hello world',
    '/unknown-skill test'
  ];

  for (const input of testCases) {
    const parsed = parseSkillInvocation(input);
    console.log(`   输入: "${input}"`);
    if (parsed) {
      console.log(`   ✅ 解析成功: skill=${parsed.skillName}, args="${parsed.arguments}"`);
    } else {
      console.log(`   ❌ 不是 skill 调用`);
    }
    console.log('');
  }

  console.log('\n=== 测试完成 ===');
}

testSkills().catch(console.error);
