#!/bin/bash

echo "停止 Claude Feishu Bridge..."
pm2 stop claude-feishu-bridge
pm2 save
echo "已停止"
