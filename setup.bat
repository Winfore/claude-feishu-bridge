@echo off
echo ========================================
echo Claude Code 飞书桥接服务 - 安装脚本
echo ========================================
echo.

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] 安装依赖...
call npm install
if %errorlevel% neq 0 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
)

echo.
echo [2/4] 检查配置文件...
if not exist .env (
    echo 复制 .env.example 到 .env
    copy .env.example .env >nul
    echo.
    echo [重要] 请编辑 .env 文件，填入你的飞书应用配置：
    echo   - FEISHU_APP_ID
    echo   - FEISHU_APP_SECRET
    echo.
    start notepad .env
) else (
    echo .env 已存在
)

echo.
echo [3/4] 创建会话目录...
if not exist sessions mkdir sessions

echo.
echo [4/4] 验证安装...
node -e "console.log('Node.js 版本:', process.version)"

echo.
echo ========================================
echo 安装完成！
echo.
echo 下一步：
echo   1. 编辑 .env 配置飞书应用信息
echo   2. 在飞书开放平台启用长连接模式
echo   3. 运行 npm start 启动服务
echo.
echo 提示：本项目使用长连接模式，无需公网域名和内网穿透！
echo ========================================
pause
