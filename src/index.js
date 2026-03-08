/**
 * Claude Code 飞书桥接服务
 * 主入口
 */

import { BridgeServer } from './bridge-server.js';
import { config as loadEnv } from 'dotenv';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadConfig } from './config/validator.js';
import { logger } from './utils/logger.js';

// 加载 .env 文件，覆盖系统环境变量
loadEnv({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PID_FILE = join(__dirname, '..', '.bridge.pid');

/**
 * 检查并确保单例运行
 */
function ensureSingleInstance() {
  if (existsSync(PID_FILE)) {
    try {
      const existingPid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);

      // 检查进程是否还在运行
      try {
        process.kill(existingPid, 0); // 0 信号不会杀死进程，只是检查是否存在
        logger.info(`检测到旧实例 (PID: ${existingPid})，正在终止...`);

        // 自动杀死旧进程
        try {
          process.kill(existingPid, 'SIGTERM');
          // 等待一下让进程优雅退出
          const startTime = Date.now();
          while (Date.now() - startTime < 2000) {
            try {
              process.kill(existingPid, 0);
              // 进程还在，继续等待
            } catch {
              // 进程已退出
              break;
            }
          }

          // 如果还在运行，强制杀死
          try {
            process.kill(existingPid, 0);
            logger.warn('进程未响应，强制终止...');
            process.kill(existingPid, 'SIGKILL');
          } catch {
            // 已经退出了
          }

          logger.success('旧实例已终止');
        } catch (killError) {
          logger.error(`无法终止旧进程: ${killError.message}`);
          process.exit(1);
        }

        unlinkSync(PID_FILE);
      } catch (e) {
        // 进程不存在，可以安全启动
        logger.info(`清理过期的 PID 文件 (PID: ${existingPid} 已不存在)`);
        unlinkSync(PID_FILE);
      }
    } catch (e) {
      // 读取失败，删除损坏的文件
      unlinkSync(PID_FILE);
    }
  }

  // 写入当前 PID
  writeFileSync(PID_FILE, process.pid.toString());
  logger.info(`单例锁定: PID ${process.pid}`);

  // 确保退出时清理 PID 文件
  const cleanup = () => {
    try {
      if (existsSync(PID_FILE)) {
        const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
        if (pid === process.pid) {
          unlinkSync(PID_FILE);
        }
      }
    } catch (e) {}
  };

  process.on('exit', cleanup);
}

// 确保单例
ensureSingleInstance();

// 加载并验证配置
const config = loadConfig(process.env);

logger.info(`工作空间根目录: ${config.workspaceRoot}`);

const server = new BridgeServer(config);

server.start().catch(error => {
  logger.error('启动失败:', error);
  process.exit(1);
});

// 优雅关闭
process.on('SIGINT', () => {
  logger.info('\n正在关闭...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.stop();
  process.exit(0);
});
