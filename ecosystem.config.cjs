module.exports = {
  apps: [
    {
      name: 'claude-feishu-bridge',
      script: 'src/index.js',
      interpreter: 'node',
      
      // 实例配置
      instances: 1,  // 单实例（WebSocket 长连接不适合多实例）
      exec_mode: 'fork',
      watch: false,  // 生产环境不开启 watch
      
      // 自动重启
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      
      // 重启策略
      restart_delay: 3000,
      exp_backoff_restart_delay: {
        max_delay: 60000,
        multiplier: 2
      },
      
      // 日志配置
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
      
      // 环境变量
      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'INFO'
      },
      env_development: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'DEBUG'
      },
      
      // 优雅关闭
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // 内存限制（超过自动重启）
      max_memory_restart: '500M',
      
      // 定时重启（可选，每天凌晨 4 点）
      cron_restart: '0 4 * * *'
    }
  ]
};
