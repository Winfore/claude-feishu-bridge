#!/bin/bash

# Claude Feishu Bridge 启动脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Claude Feishu Bridge ===${NC}"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}错误: 未安装 Node.js${NC}"
    exit 1
fi

echo -e "${GREEN}Node.js 版本: $(node -v)${NC}"

# 检查 PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}PM2 未安装，正在安装...${NC}"
    npm install -g pm2
fi

echo -e "${GREEN}PM2 版本: $(pm2 -v)${NC}"

# 创建日志目录
mkdir -p logs

# 检查 .env 文件
if [ ! -f .env ]; then
    echo -e "${RED}错误: .env 文件不存在${NC}"
    echo -e "${YELLOW}请复制 .env.example 并填写配置${NC}"
    exit 1
fi

# 安装依赖
if [ ! -d node_modules ]; then
    echo -e "${YELLOW}安装依赖...${NC}"
    npm install
fi

# 启动服务
echo -e "${GREEN}启动服务...${NC}"
pm2 start ecosystem.config.cjs --env production

# 显示状态
pm2 status

echo -e "${GREEN}=== 启动完成 ===${NC}"
echo -e "查看日志: pm2 logs claude-feishu-bridge"
echo -e "查看状态: pm2 status"
echo -e "停止服务: pm2 stop claude-feishu-bridge"
