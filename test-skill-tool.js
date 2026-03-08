/**
 * 测试 Skill 工具（按需加载）
 */

import { createSkillTool, executeSkillTool } from './src/tools/skill-tool.js';

async function testSkillTool() {
  console.log('=== Skill 工具测试（按需加载）===\n');

  // 1. 创建 skill 工具
  console.log('1. 创建 Skill 工具...');
  const skillTool = await createSkillTool();

  console.log(`   工具名称: ${skillTool.name}`);
  console.log(`   描述长度: ${skillTool.description.length} 字符`);
  console.log(`   参数: ${JSON.stringify(skillTool.input_schema.properties)}\n`);

  // 2. 查看工具描述（包含 skill 列表）
  console.log('2. 工具描述预览（前 800 字符）:');
  console.log('   ' + skillTool.description.substring(0, 800).replace(/\n/g, '\n   '));
  console.log('   ...\n');

  // 3. 统计可用 skills
  const skillMatches = skillTool.description.match(/<skill>/g);
  const skillCount = skillMatches ? skillMatches.length : 0;
  console.log(`3. 发现 ${skillCount} 个可用 skills\n`);

  // 4. 提取 skill 名称
  const skillNames = [];
  const nameRegex = /<name>(.*?)<\/name>/g;
  let match;
  while ((match = nameRegex.exec(skillTool.description)) !== null) {
    skillNames.push(match[1]);
  }

  console.log('4. 可用的 Skills:');
  skillNames.forEach(name => {
    console.log(`   - ${name}`);
  });
  console.log('');

  // 5. 测试加载 skill
  if (skillNames.length > 0) {
    const testSkillName = skillNames[0];
    console.log(`5. 测试加载 Skill: ${testSkillName}`);

    try {
      const result = await executeSkillTool({ name: testSkillName });
      console.log(`   ✅ 加载成功`);
      console.log(`   返回内容长度: ${result.content.length} 字符`);
      console.log(`   内容预览（前 500 字符）:`);
      console.log('   ' + result.content.substring(0, 500).replace(/\n/g, '\n   '));
      console.log('   ...\n');
    } catch (error) {
      console.log(`   ❌ 加载失败: ${error.message}\n`);
    }
  }

  // 6. 测试加载不存在的 skill
  console.log('6. 测试加载不存在的 Skill...');
  try {
    await executeSkillTool({ name: 'non-existent-skill' });
    console.log('   ❌ 应该抛出错误但没有\n');
  } catch (error) {
    console.log(`   ✅ 正确抛出错误: ${error.message}\n`);
  }

  // 7. 对比：一次性加载 vs 按需加载
  console.log('7. 性能对比:');
  console.log(`   工具描述大小: ${(skillTool.description.length / 1024).toFixed(2)} KB`);
  console.log(`   如果一次性加载所有 skills: ~${(skillCount * 5).toFixed(0)} KB`);
  console.log(`   节省: ~${((skillCount * 5 - skillTool.description.length / 1024) / (skillCount * 5) * 100).toFixed(0)}%`);
  console.log('');

  console.log('=== 测试完成 ===');
}

testSkillTool().catch(console.error);
