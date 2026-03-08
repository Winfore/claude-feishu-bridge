#!/bin/bash

echo "========================================"
echo "Claude Code 飞书桥接服务 - 安装脚本"
echo "========================================"
echo

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 请先安装 Node.js"
    echo "下载地址: https://nodejs.org/"
    exit 1
fi

echo "[1/4] 安装依赖..."
npm install
if [ $? -ne 0 ]; then
    echo "[错误] 依赖安装失败"
    exit 1
fi

echo
echo "[2/4] 检查配置文件..."
if [ ! -f .env ]; then
    echo "复制 .env.example 到 .env"
    cp .env.example .env
    echo
    echo "[重要] 请编辑 .env 文件，填入你的飞书应用配置："
    echo "  - FEISHU_APP_ID"
    echo "  - FEISHU_APP_SECRET"
    echo
else
    echo ".env 已存在"
fi

echo
echo "[3/4] 创建会话目录..."
mkdir -p sessions

echo
echo "[4/4] 验证安装..."
echo "Node.js 版本: $(node -v)"

echo
echo "========================================"
echo "安装完成！"
echo
echo "下一步："
echo "  1. 编辑 .env 配置飞书应用信息"
echo "  2. 在飞书开放平台启用长连接模式"
echo "  3. 运行 npm start 启动服务"
echo
echo "提示：本项目使用长连接模式，无需公网域名和内网穿透！"
echo "========================================"
