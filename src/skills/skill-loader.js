/**
 * Skill Loader - 加载和解析 SKILL.md 文件
 *
 * 扫描以下目录：
 * - ~/.claude/skills/
 * - ~/.agents/skills/
 * - ./.claude/skills/
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';

const SKILL_PATHS = [
  path.join(os.homedir(), '.claude', 'skills'),
  path.join(os.homedir(), '.agents', 'skills'),
  path.join(process.cwd(), '.claude', 'skills')
];

// 缓存相关常量
const CACHE_TTL = 60 * 1000; // 缓存有效期：60 秒
let skillsCache = null;
let cacheTimestamp = 0;

/**
 * 清除缓存（用于强制刷新）
 */
export function clearSkillsCache() {
  skillsCache = null;
  cacheTimestamp = 0;
}

/**
 * 加载所有 skills（带缓存）
 * @param {Object} options - 选项
 * @param {boolean} options.forceRefresh - 强制刷新缓存
 */
export async function loadAllSkills(options = {}) {
  const { forceRefresh = false } = options;

  // 如果有缓存且未过期，直接返回
  if (!forceRefresh && skillsCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return skillsCache;
  }

  // 重新加载
  const skills = await loadAllSkillsFromDisk();
  skillsCache = skills;
  cacheTimestamp = Date.now();

  return skills;
}

/**
 * 从磁盘加载所有 skills
 */
async function loadAllSkillsFromDisk() {
  const skills = [];
  const loaded = new Set(); // 防止重复加载

  for (const basePath of SKILL_PATHS) {
    if (!fs.existsSync(basePath)) {
      continue;
    }

    try {
      const dirs = fs.readdirSync(basePath, { withFileTypes: true });

      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;

        const skillPath = path.join(basePath, dir.name);

        // 查找 SKILL.md 或 skill.md
        const skillFile = ['SKILL.md', 'skill.md']
          .map(f => path.join(skillPath, f))
          .find(f => fs.existsSync(f));

        if (skillFile) {
          const skill = await parseSkillFile(skillFile);

          if (skill && !loaded.has(skill.name)) {
            skills.push(skill);
            loaded.add(skill.name);
            console.log(`[Skill] Loaded: ${skill.name} from ${skillFile}`);
          }
        }
      }
    } catch (error) {
      console.error(`[Skill] Error scanning ${basePath}:`, error.message);
    }
  }

  return skills;
}

/**
 * 解析单个 skill 文件
 */
async function parseSkillFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');

    // 统一换行符（处理 Windows \r\n）
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 解析 frontmatter（支持 --- 和 +++ 格式）
    const match = content.match(/^(---|\+\+\+)\n([\s\S]*?)\n(---|\+\+\+)\n([\s\S]*)$/);

    if (!match) {
      console.warn(`[Skill] No frontmatter found in ${filePath}`);
      return null;
    }

    const [, , frontmatterText, , body] = match;

    // 解析 YAML frontmatter
    let metadata;
    try {
      metadata = yaml.load(frontmatterText);
    } catch (error) {
      console.error(`[Skill] Failed to parse frontmatter in ${filePath}:`, error.message);
      return null;
    }

    // 处理 allowed-tools（可能是数组或字符串）
    let allowedTools = metadata['allowed-tools'] || metadata.allowedTools || [];
    if (typeof allowedTools === 'string') {
      allowedTools = allowedTools.split(',').map(t => t.trim()).filter(Boolean);
    } else if (!Array.isArray(allowedTools)) {
      allowedTools = [];
    }

    // 处理 description（可能是多行字符串）
    let description = metadata.description || '';
    if (typeof description === 'object' && description !== null) {
      // 可能是 YAML 对象，转换为字符串
      description = JSON.stringify(description);
    }
    if (typeof description === 'string') {
      description = description.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    }

    return {
      name: metadata.name,
      description,
      userInvocable: metadata.user_invocable === true || metadata.user_invocable === 'true',
      allowedTools,
      argumentHint: metadata['argument-hint'] || '',
      content: body.trim(),
      path: filePath,
      directory: path.dirname(filePath)
    };
  } catch (error) {
    console.error(`[Skill] Error parsing ${filePath}:`, error.message);
    return null;
  }
}

/**
 * 根据名称查找 skill
 */
export async function findSkill(name) {
  const skills = await loadAllSkills();
  return skills.find(s => s.name === name);
}

/**
 * 获取所有用户可调用的 skills
 */
export async function getUserInvocableSkills() {
  const skills = await loadAllSkills();
  return skills.filter(s => s.userInvocable);
}

/**
 * 生成 skills 的系统提示部分
 */
export async function generateSkillsPrompt() {
  const skills = await loadAllSkills();

  if (skills.length === 0) {
    return '';
  }

  let prompt = '\n\n# Available Skills\n\n';
  prompt += 'You have access to the following skills. Use them when appropriate based on user requests.\n\n';

  for (const skill of skills) {
    prompt += `## /${skill.name}\n\n`;
    prompt += `**Description:** ${skill.description}\n\n`;

    if (skill.userInvocable) {
      prompt += `**User Invocable:** Yes (user can call with \`/${skill.name}\`)\n\n`;
    }

    if (skill.argumentHint) {
      prompt += `**Arguments:** ${skill.argumentHint}\n\n`;
    }

    if (skill.allowedTools && skill.allowedTools.length > 0) {
      prompt += `**Allowed Tools:** ${skill.allowedTools.join(', ')}\n\n`;
    }

    // 注入完整 skill 内容
    prompt += skill.content + '\n\n';
    prompt += '---\n\n';
  }

  return prompt;
}

/**
 * 检查用户输入是否是 skill 调用
 */
export function parseSkillInvocation(userInput) {
  const match = userInput.match(/^\/([a-z0-9-_]+)(?:\s+(.*))?$/i);

  if (!match) {
    return null;
  }

  return {
    skillName: match[1],
    arguments: match[2] || ''
  };
}

// 如果直接运行此文件，输出所有 skills（用于调试）
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const skills = await loadAllSkills();
  console.log(JSON.stringify(skills, null, 2));
}
