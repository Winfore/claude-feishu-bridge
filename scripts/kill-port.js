#!/usr/bin/env node
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const PORT = process.env.BRIDGE_PORT || 3100;

async function killPort() {
  try {
    if (process.platform === 'win32') {
      // Windows - 只杀死 node.exe 进程
      const { stdout } = await execAsync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8' });
      const lines = stdout.trim().split('\n');
      const pids = new Set();

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
          pids.add(pid);
        }
      }

      for (const pid of pids) {
        try {
          // 检查是否是 node.exe 进程
          const { stdout: taskInfo } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' });
          if (taskInfo.toLowerCase().includes('node.exe')) {
            await execAsync(`taskkill /F /PID ${pid}`);
            console.log(`已终止 node.exe 进程 PID: ${pid}`);
          }
        } catch {}
      }
    } else {
      // Unix-like - 只杀死 node 进程
      const { stdout } = await execAsync(`lsof -ti:${PORT} -sTCP:LISTEN`);
      const pids = stdout.trim().split('\n').filter(p => p);

      for (const pid of pids) {
        try {
          const { stdout: procName } = await execAsync(`ps -p ${pid} -o comm=`);
          if (procName.includes('node')) {
            await execAsync(`kill -9 ${pid}`);
            console.log(`已终止 node 进程 PID: ${pid}`);
          }
        } catch {}
      }
    }
  } catch (error) {
    // 没有进程在使用该端口，忽略错误
    console.log(`端口 ${PORT} 未被占用`);
  }
}

killPort();
