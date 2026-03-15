# 开发规范

## 代码修改规则

### 规则 1: 每次修改需要新增对应的测试

**要求：**
- 任何代码修改（新增功能、bug 修复、重构）都必须包含相应的测试
- 测试应覆盖修改的核心逻辑和边界情况
- 测试文件应放在 `test/` 目录下，与源文件对应

**测试框架：** Vitest

**示例：**
```javascript
// 修改：添加新的命令处理器
// src/server/handlers/status-handler.js
export async function statusHandler(ctx, { sessions }) {
  const session = sessions.getSession(ctx.args);
  if (!session) {
    return { success: false, message: '会话不存在' };
  }
  return { success: true, message: `状态: ${session.status}` };
}

// 必须添加：对应的测试
// test/handlers/handlers.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('statusHandler', () => {
  it('should return session status', async () => {
    const mockSessions = {
      getSession: (id) => ({ id, status: 'idle' })
    };
    const result = await statusHandler(
      { args: 'session-id' },
      { sessions: mockSessions }
    );
    expect(result.success).toBe(true);
  });

  it('should handle non-existent session', async () => {
    const mockSessions = {
      getSession: () => null
    };
    const result = await statusHandler(
      { args: 'invalid-id' },
      { sessions: mockSessions }
    );
    expect(result.success).toBe(false);
  });
});
```

### 规则 2: 修改后需要测试全部通过

**要求：**
- 提交代码前必须运行 `npm test` 并确保所有测试通过
- 如果测试失败，必须修复问题或更新测试
- 不允许提交导致测试失败的代码

**工作流程：**
```bash
# 1. 修改代码
vim src/session/session-manager.js

# 2. 添加/更新测试
vim test/session/session-manager.test.js

# 3. 运行测试
npm test

# 4. 确保所有测试通过
# ✅ 全部通过 → 可以提交
# ❌ 有失败 → 修复问题，重复步骤 3

# 5. 提交代码
git add .
git commit -m "feat: add new feature with tests"
```

**测试失败处理：**
- 如果是新增功能导致旧测试失败 → 更新旧测试以适应新行为
- 如果是 bug 修复导致测试失败 → 检查测试是否正确，修复代码或测试
- 如果是重构导致测试失败 → 更新测试以匹配新的实现

## 测试覆盖率

**当前状态：**
- 测试框架：Vitest
- 测试文件：5 个
- 测试用例：87 个
- 覆盖率：约 20%

**覆盖详情：**
| 模块 | 覆盖率 |
|-----|--------|
| src/utils/errors.js | 100% |
| src/config/defaults.js | 100% |
| src/session/session-storage.js | 82% |
| src/server/handlers | 60% |

**目标：**
- 短期（1-2 周）：40%
- 中期（1-2 月）：60%
- 长期（3 月+）：80%+

**优先级：**
1. 核心模块：session-manager, session-executor, session-storage ✅
2. 命令处理器：所有 handlers ✅
3. 工具模块：logger, errors, validator ✅
4. 集成测试：完整的命令执行流程

## 测试命令

```bash
# 运行所有测试
npm test

# 监听模式（开发时使用）
npm run test:watch

# 查看测试覆盖率
npm run test:coverage

# 运行特定测试文件
npm test -- test/session/session-manager.test.js
```

## 测试最佳实践

### 1. 测试命名
```javascript
// ✅ 好的命名
describe('SessionManager', () => {
  describe('createSession', () => {
    it('should create session with valid project name', async () => {});
    it('should throw error when project name is missing', async () => {});
  });
});

// ❌ 不好的命名
describe('test', () => {
  it('works', async () => {});
});
```

### 2. 测试隔离
```javascript
// ✅ 每个测试独立
import { beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  // 重置状态
  manager = new SessionManager(config);
});

afterEach(() => {
  // 清理资源
  manager.close();
});

// ❌ 测试间共享状态
const manager = new SessionManager(config); // 全局变量
```

### 3. Mock 外部依赖
```javascript
// ✅ Mock 外部 API
import { vi } from 'vitest';

const mockFeishu = {
  sendText: vi.fn().mockResolvedValue({ code: 0 })
};

// ❌ 直接调用真实 API
const feishu = new FeishuClient(config); // 会发送真实请求
```

### 4. 测试边界情况
```javascript
// ✅ 覆盖边界情况
it('should handle empty string', () => {});
it('should handle null value', () => {});
it('should handle very long input', () => {});
it('should handle special characters', () => {});

// ❌ 只测试正常情况
it('should work with valid input', () => {});
```

## 项目结构

```
test/
├── session/
│   ├── session-manager.test.js   # 会话管理测试
│   └── session-storage.test.js   # 存储测试
├── utils/
│   ├── logger.test.js            # 日志测试
│   └── errors.test.js            # 错误类测试
└── handlers/
    └── handlers.test.js          # 命令处理器测试
```

## 持续集成（CI）

**未来计划：**
- 配置 GitHub Actions
- 每次 push 自动运行测试
- Pull Request 必须通过测试才能合并
- 自动生成测试覆盖率报告

## 违规处理

**如果违反规则：**
1. 代码审查时会被拒绝
2. 需要补充测试后重新提交
3. 重复违规会影响代码质量评估

**例外情况：**
- 紧急 bug 修复（但需要在 24 小时内补充测试）
- 文档修改（不需要测试）
- 配置文件修改（不需要测试）

## 总结

**记住：**
- ✅ 修改代码 → 添加测试 → 运行测试 → 全部通过 → 提交
- ❌ 修改代码 → 直接提交（不允许）

**目标：**
- 提高代码质量
- 减少 bug
- 增强信心
- 便于重构

---

**规则生效日期**: 2026-03-08  
**最后更新**: 2026-03-11  
**适用范围**: 所有代码修改  
**强制执行**: 是  
**测试框架**: Vitest
