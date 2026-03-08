# 工作空间管理说明

## 概念

系统采用**基于项目的工作空间管理**：

- **工作空间根目录**：`WORKSPACE_ROOT`（如 `D:/project`）
- **项目**：工作空间下的子目录（如 `D:/project/test`）
- **会话**：与 Claude 的对话，绑定到特定项目
- **所有文件操作**：限制在项目目录内

## 配置

在 `.env` 中设置：

```bash
WORKSPACE_ROOT=D:/project
```

## 使用流程

### 1. 创建新项目会话

```
/new test 创建一个 hello world 程序
```

这会：
- 在 `D:/project/test` 创建目录（如果不存在）
- 创建新会话，工作目录为 `D:/project/test`
- 执行指令："创建一个 hello world 程序"

### 2. 查看所有项目

```
/projects
```

显示 `D:/project` 下的所有目录。

### 3. 查看活跃会话

```
/sessions
```

显示所有活跃会话及其对应的项目。

### 4. 继续会话

```
/continue <会话ID> 添加一个 README 文件
```

在原项目目录中继续工作。

### 5. 切换项目

```
/switch <会话ID> another-project
```

将会话切换到 `D:/project/another-project`。

### 6. 查看会话状态

```
/status <会话ID>
```

显示会话的项目名、工作目录、状态等信息。

## 示例场景

### 场景 1：创建多个项目

```
/new frontend 创建一个 React 项目
/new backend 创建一个 Express API
/new docs 写一份项目文档
```

结果：
- `D:/project/frontend` - React 项目
- `D:/project/backend` - Express API
- `D:/project/docs` - 文档

### 场景 2：在项目间切换

```
/sessions
# 看到会话 cc_xxx_xxx 在 frontend 项目

/switch cc_xxx_xxx backend
# 现在这个会话在 backend 项目中工作
```

### 场景 3：查看所有项目

```
/projects
# 显示：
# 1. frontend
# 2. backend
# 3. docs
# 4. test
```

## 安全限制

- 所有文件操作限制在 `WORKSPACE_ROOT` 下
- 不能访问工作空间外的文件
- 项目目录自动创建，无需手动创建

## 会话管理

- **自动超时**：30 分钟无活动自动清理
- **已完成会话**：5 分钟后自动清理
- **会话持久化**：重启服务后可恢复

## 命令总结

| 命令 | 说明 | 示例 |
|------|------|------|
| `/new <项目名> <指令>` | 创建新会话 | `/new test 创建 hello world` |
| `/continue <会话ID> <指令>` | 继续会话 | `/continue cc_xxx 添加测试` |
| `/sessions` | 列出活跃会话 | `/sessions` |
| `/projects` | 列出所有项目 | `/projects` |
| `/status <会话ID>` | 查看会话状态 | `/status cc_xxx` |
| `/switch <会话ID> <项目名>` | 切换项目 | `/switch cc_xxx backend` |
| `/kill <会话ID>` | 终止会话 | `/kill cc_xxx` |
| `/help` | 显示帮助 | `/help` |
