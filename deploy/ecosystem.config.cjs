module.exports = {
  apps: [{
    name: "livetrading",
    script: "proxy-server.js",
    cwd: "/home/ubuntu/app",
    instances: 1,
    autorestart: true,
    watch: false,
    // Cap V8 old-generation heap at 512 MB so GC kicks in before the Linux
    // OOM killer fires (~650 MB on a t3.micro with 1 GB RAM).
    // After the instrument-cache slim (350 MB → ~35 MB) the process should
    // stay well under 300 MB at steady state.
    node_args: "--max-old-space-size=512",
    max_memory_restart: "700M",  // safety net; GC should keep usage below 300 MB
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
