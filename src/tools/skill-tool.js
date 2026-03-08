/**
 * Skill Tool - 按需加载 Skills
 *
 * 工作方式：
 * 1. 工具描述中列出所有可用的 skills（名称+描述）
 * 2. Claude 识别到需要某个 skill 时，调用此工具
 * 3. 加载并返回该 skill 的完整内容
 */

import { loadAllSkills, findSkill } from '../skills/skill-loader.js';
import { logger } from '../utils/logger.js';

/**
 * 生成 skill 工具的定义
 */
export async function createSkillTool() {
  const skills = await loadAllSkills();

  // 构建工具描述（包含所有可用 skills）
  const description = skills.length === 0
    ? 'Load a specialized skill that provides domain-specific instructions and workflows. No skills are currently available.'
    : [
        'Load a specialized skill that provides domain-specific instructions and workflows.',
        '',
        'When you recognize that a task matches one of the available skills listed below, use this tool to load the full skill instructions.',
        '',
        'The skill will inject detailed instructions, workflows, and access to bundled resources into the conversation context.',
        '',
        'The following skills are available:',
        '',
        '<available_skills>',
        ...skills.map(skill => [
          '  <skill>',
          `    <name>${skill.name}</name>`,
          `    <description>${skill.description}</description>`,
          `    <user_invocable>${skill.userInvocable}</user_invocable>`,
          '  </skill>'
        ].join('\n')),
        '</available_skills>',
        '',
        'Invoke this tool when a task matches one of the available skills above.'
      ].join('\n');

  // 示例
  const examples = skills
    .map(s => `'${s.name}'`)
    .slice(0, 3)
    .join(', ');
  const hint = examples ? ` (e.g., ${examples})` : '';

  return {
    name: 'load_skill',
    description,
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: `The name of the skill from available_skills${hint}`
        }
      },
      required: ['name']
    }
  };
}

/**
 * 执行 skill 工具
 */
export async function executeSkillTool(params) {
  const { name } = params;

  logger.info(`加载 Skill: ${name}`);

  const skill = await findSkill(name);

  if (!skill) {
    const allSkills = await loadAllSkills();
    const available = allSkills.map(s => s.name).join(', ') || 'none';
    throw new Error(`Skill "${name}" not found. Available skills: ${available}`);
  }

  // 返回 skill 的完整内容
  const output = [
    `<skill_content name="${skill.name}">`,
    `# Skill: ${skill.name}`,
    '',
    skill.content.trim(),
    '',
    `Skill directory: ${skill.directory}`,
    'Relative paths in this skill are relative to this directory.',
    '</skill_content>'
  ].join('\n');

  logger.success(`Skill 加载成功: ${name}`);

  return {
    success: true,
    skill: name,
    content: output
  };
}
