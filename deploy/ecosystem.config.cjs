module.exports = {
  apps: [{
    name: "livetrading",
    script: "proxy-server.js",
    cwd: "/home/ubuntu/app",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "300M",
    env: {
      NODE_ENV: "production",
      PORT: 3000,
    },
    error_file: "/home/ubuntu/app/logs/error.log",
    out_file: "/home/ubuntu/app/logs/output.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    merge_logs: true,
  }],
};
