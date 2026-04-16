import React, { useState, useCallback } from "react";

// ── Command data ──────────────────────────────────────────────────────────────
const SECTIONS = [
  {
    title: "Connect to EC2",
    color: "#26a69a",
    icon: "🔌",
    commands: [
      {
        label: "SSH into server",
        cmd: "ssh -i ~/your-key.pem ubuntu@<EC2_IP>",
        note: "Replace <EC2_IP> with your instance IP and key path",
      },
      {
        label: "SSH with verbose (debug connection)",
        cmd: "ssh -vvv -i ~/your-key.pem ubuntu@<EC2_IP>",
      },
      {
        label: "Copy file to server (SCP)",
        cmd: "scp -i ~/your-key.pem ./localfile.txt ubuntu@<EC2_IP>:/home/ubuntu/app/",
      },
    ],
  },
  {
    title: "Deploy Application",
    color: "#2962ff",
    icon: "🚀",
    commands: [
      {
        label: "Full deploy (local script)",
        cmd: "./deploy/deploy.sh <EC2_IP> ~/your-key.pem",
        note: "Builds frontend, rsyncs code, restarts PM2, reloads Nginx",
      },
      {
        label: "Build frontend locally",
        cmd: "npm run build",
      },
      {
        label: "Rsync code to EC2 (skip node_modules/.env)",
        cmd: `rsync -avz --delete -e "ssh -i ~/your-key.pem" --exclude node_modules --exclude .git --exclude .env --exclude logs ./ ubuntu@<EC2_IP>:/home/ubuntu/app/`,
      },
      {
        label: "Install production deps on server",
        cmd: "cd /home/ubuntu/app && npm install --production",
      },
    ],
  },
  {
    title: "PM2 — Process Manager",
    color: "#ff9800",
    icon: "⚙️",
    commands: [
      {
        label: "Check app status",
        cmd: "pm2 status",
      },
      {
        label: "Start app (first time)",
        cmd: "pm2 start deploy/ecosystem.config.cjs && pm2 save",
      },
      {
        label: "Restart app",
        cmd: "pm2 restart livetrading",
      },
      {
        label: "Reload app (zero-downtime)",
        cmd: "pm2 reload livetrading",
      },
      {
        label: "Stop app",
        cmd: "pm2 stop livetrading",
      },
      {
        label: "Delete app from PM2",
        cmd: "pm2 delete livetrading",
      },
      {
        label: "View live logs",
        cmd: "pm2 logs livetrading",
      },
      {
        label: "View last 200 log lines",
        cmd: "pm2 logs livetrading --lines 200",
      },
      {
        label: "Monitor CPU/memory",
        cmd: "pm2 monit",
      },
      {
        label: "Save current PM2 process list",
        cmd: "pm2 save",
      },
      {
        label: "Startup — auto-start PM2 on reboot",
        cmd: "pm2 startup && pm2 save",
      },
    ],
  },
  {
    title: "Nginx",
    color: "#009688",
    icon: "🌐",
    commands: [
      {
        label: "Test Nginx config",
        cmd: "sudo nginx -t",
      },
      {
        label: "Reload Nginx (apply config changes)",
        cmd: "sudo systemctl reload nginx",
      },
      {
        label: "Restart Nginx",
        cmd: "sudo systemctl restart nginx",
      },
      {
        label: "Check Nginx status",
        cmd: "sudo systemctl status nginx",
      },
      {
        label: "View Nginx error log",
        cmd: "sudo tail -f /var/log/nginx/error.log",
      },
      {
        label: "Deploy Nginx config from repo",
        cmd: "sudo cp /home/ubuntu/app/deploy/nginx.conf /etc/nginx/sites-available/livetrading && sudo ln -sf /etc/nginx/sites-available/livetrading /etc/nginx/sites-enabled/ && sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl reload nginx",
      },
    ],
  },
  {
    title: "Application Logs",
    color: "#9c27b0",
    icon: "📋",
    commands: [
      {
        label: "Tail app output log",
        cmd: "tail -f /home/ubuntu/app/logs/output.log",
      },
      {
        label: "Tail app error log",
        cmd: "tail -f /home/ubuntu/app/logs/error.log",
      },
      {
        label: "Last 100 lines of output",
        cmd: "tail -100 /home/ubuntu/app/logs/output.log",
      },
      {
        label: "Search logs for errors",
        cmd: "grep -i error /home/ubuntu/app/logs/error.log | tail -50",
      },
      {
        label: "Clear logs",
        cmd: "pm2 flush livetrading",
      },
    ],
  },
  {
    title: "Server Health",
    color: "#ef5350",
    icon: "🩺",
    commands: [
      {
        label: "Check API health",
        cmd: "curl -s http://localhost:3000/api/health | python3 -m json.tool",
      },
      {
        label: "Check Nifty future discovery",
        cmd: "curl -s http://localhost:3000/api/tools/discover-nifty-future | python3 -m json.tool",
      },
      {
        label: "Disk usage",
        cmd: "df -h /",
      },
      {
        label: "Memory usage",
        cmd: "free -h",
      },
      {
        label: "CPU & process info",
        cmd: "top -b -n 1 | head -20",
      },
      {
        label: "Check Node.js port",
        cmd: "sudo ss -tlnp | grep 3000",
      },
      {
        label: "Check Nginx port",
        cmd: "sudo ss -tlnp | grep :80",
      },
    ],
  },
  {
    title: "Database & S3 Backup",
    color: "#ff9800",
    icon: "🗄️",
    commands: [
      {
        label: "Open SQLite DB",
        cmd: "sqlite3 /home/ubuntu/app/oi_history.db",
      },
      {
        label: "Query latest OI snapshot",
        cmd: `sqlite3 /home/ubuntu/app/oi_history.db "SELECT * FROM oi_snapshots ORDER BY timestamp DESC LIMIT 10;"`,
      },
      {
        label: "DB file size",
        cmd: "ls -lh /home/ubuntu/app/oi_history.db",
      },
      {
        label: "List S3 backups",
        cmd: "aws s3 ls s3://four-walls-oi-backup/ --recursive --human-readable | sort | tail -20",
      },
      {
        label: "Download latest S3 backup",
        cmd: "aws s3 cp $(aws s3 ls s3://four-walls-oi-backup/ | sort | tail -1 | awk '{print \"s3://four-walls-oi-backup/\"$4}') ./latest-backup.db.gz",
      },
      {
        label: "Decompress backup",
        cmd: "gunzip -c latest-backup.db.gz > restored.db",
      },
    ],
  },
  {
    title: "Git & Updates",
    color: "#26a69a",
    icon: "🔄",
    commands: [
      {
        label: "Pull latest from main",
        cmd: "cd /home/ubuntu/app && git pull origin main",
      },
      {
        label: "Check current branch & status",
        cmd: "cd /home/ubuntu/app && git status && git log --oneline -5",
      },
      {
        label: "Pull + install deps + reload PM2",
        cmd: "cd /home/ubuntu/app && git pull origin main && npm install --production && pm2 reload livetrading",
      },
      {
        label: "Hard reset to origin/main",
        cmd: "cd /home/ubuntu/app && git fetch origin && git reset --hard origin/main",
        note: "⚠️ Discards all local changes",
      },
    ],
  },
  {
    title: "GitHub Actions / CI-CD",
    color: "#2962ff",
    icon: "🤖",
    commands: [
      {
        label: "Check required GitHub secrets",
        cmd: "gh secret list",
        note: "Needs: EC2_HOST, EC2_USER, EC2_SSH_KEY",
      },
      {
        label: "Trigger manual deploy from CLI",
        cmd: "gh workflow run deploy-ackpat-ci-cd.yml",
      },
      {
        label: "Watch workflow run",
        cmd: "gh run watch",
      },
      {
        label: "List recent workflow runs",
        cmd: "gh run list --limit 10",
      },
    ],
  },
];

// ── Copy button component ─────────────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback for non-HTTPS
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      style={{
        flexShrink: 0,
        padding: "4px 10px",
        fontSize: "0.7rem",
        fontWeight: 700,
        borderRadius: 5,
        cursor: "pointer",
        border: copied ? "1px solid rgba(38,166,154,0.6)" : "1px solid rgba(255,255,255,0.18)",
        background: copied ? "rgba(38,166,154,0.18)" : "rgba(255,255,255,0.07)",
        color: copied ? "#26a69a" : "#aaa",
        transition: "all 0.18s",
        minWidth: 54,
        letterSpacing: "0.02em",
      }}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

// ── Command card ──────────────────────────────────────────────────────────────
function CommandCard({ label, cmd, note }) {
  return (
    <div
      style={{
        background: "#161a25",
        border: "1px solid #2a2e39",
        borderRadius: 8,
        padding: "10px 14px",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.75rem", color: "#888", fontWeight: 600, marginBottom: 5 }}>{label}</div>
          <pre
            style={{
              margin: 0,
              fontFamily: "ui-monospace, 'Cascadia Code', 'Courier New', monospace",
              fontSize: "0.78rem",
              color: "#c8d4e8",
              background: "transparent",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              lineHeight: 1.55,
            }}
          >
            {cmd}
          </pre>
          {note && (
            <div style={{ marginTop: 5, fontSize: "0.7rem", color: "#e6a817", fontStyle: "italic" }}>
              {note}
            </div>
          )}
        </div>
        <CopyButton text={cmd} />
      </div>
    </div>
  );
}

// ── Section block ─────────────────────────────────────────────────────────────
function Section({ title, color, icon, commands }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        background: "#1e222d",
        border: `1px solid ${color}33`,
        borderRadius: 10,
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      {/* Section header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: "transparent",
          border: "none",
          borderBottom: collapsed ? "none" : `1px solid ${color}33`,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "1.1rem" }}>{icon}</span>
          <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#fff" }}>{title}</span>
          <span
            style={{
              fontSize: "0.7rem",
              padding: "2px 7px",
              borderRadius: 10,
              background: `${color}22`,
              border: `1px solid ${color}55`,
              color,
              fontWeight: 600,
            }}
          >
            {commands.length} commands
          </span>
        </div>
        <span style={{ color: "#555", fontSize: "0.8rem" }}>{collapsed ? "▶" : "▼"}</span>
      </button>

      {/* Commands */}
      {!collapsed && (
        <div style={{ padding: "12px 14px 4px" }}>
          {commands.map((c, i) => (
            <CommandCard key={i} {...c} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function SshCommandsPage() {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? SECTIONS.map((s) => ({
        ...s,
        commands: s.commands.filter(
          (c) =>
            c.label.toLowerCase().includes(search.toLowerCase()) ||
            c.cmd.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter((s) => s.commands.length > 0)
    : SECTIONS;

  const totalCmds = SECTIONS.reduce((n, s) => n + s.commands.length, 0);

  return (
    <div
      style={{
        minHeight: "calc(100vh - 52px)",
        background: "#131722",
        color: "#d1d4dc",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        padding: "24px 20px",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", color: "#fff", fontSize: "1.15rem", fontWeight: 700 }}>
          🖥️ SSH Commands
        </h2>
        <div style={{ fontSize: "0.75rem", color: "#888" }}>
          {totalCmds} commands across {SECTIONS.length} categories — click Copy to copy any command
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search commands…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: "100%",
          maxWidth: 480,
          padding: "8px 14px",
          marginBottom: 20,
          borderRadius: 7,
          background: "#1e222d",
          border: "1px solid #2a2e39",
          color: "#fff",
          fontSize: "0.85rem",
          outline: "none",
          boxSizing: "border-box",
        }}
      />

      {/* Sections */}
      {filtered.length === 0 ? (
        <div style={{ color: "#555", textAlign: "center", padding: "40px 0" }}>
          No commands match &ldquo;{search}&rdquo;
        </div>
      ) : (
        filtered.map((s) => <Section key={s.title} {...s} />)
      )}
    </div>
  );
}
