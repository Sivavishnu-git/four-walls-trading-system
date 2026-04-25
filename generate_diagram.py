"""Four Walls Trading System — Architecture Diagram generator."""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1800, 1400
BG = (15, 23, 42)             # #0f172a
PANEL = (30, 41, 59)          # #1e293b
GRID = (51, 65, 85)
TXT = (226, 232, 240)
MUTED = (148, 163, 184)
TITLE_C = (248, 250, 252)

# Layer accent colors
C_BROWSER = (59, 130, 246)    # blue
C_BACKEND = (139, 92, 246)    # purple
C_STORAGE = (34, 197, 94)     # green
C_EXTERN  = (249, 115, 22)    # orange
C_INFRA   = (148, 163, 184)   # gray

ARROW_REST = (96, 165, 250)
ARROW_WS   = (52, 211, 153)
ARROW_OAUTH= (251, 191, 36)
ARROW_S3   = (244, 114, 182)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)


def font(sz, bold=False):
    candidates_bold = [
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ]
    candidates_reg = [
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for p in (candidates_bold if bold else candidates_reg):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                pass
    return ImageFont.load_default()


def text(xy, s, f, fill=TXT, anchor="lt"):
    if "\n" in s and anchor in ("lt", None):
        d.multiline_text(xy, s, font=f, fill=fill, spacing=4)
    else:
        d.text(xy, s, font=f, fill=fill, anchor=anchor)


def panel(x, y, w, h, accent, title, sub=None, radius=14):
    # shadow
    d.rounded_rectangle((x + 4, y + 6, x + w + 4, y + h + 6), radius=radius, fill=(8, 12, 24))
    # body
    d.rounded_rectangle((x, y, x + w, y + h), radius=radius, fill=PANEL, outline=GRID, width=1)
    # accent bar
    d.rounded_rectangle((x, y, x + 8, y + h), radius=radius, fill=accent)
    # title
    text((x + 22, y + 14), title, font(18, True), TXT)
    if sub:
        text((x + 22, y + 38), sub, font(12), MUTED)


def chip(x, y, w, h, label, sub=None, accent=None):
    d.rounded_rectangle((x, y, x + w, y + h), radius=8, fill=(22, 32, 50), outline=GRID, width=1)
    if accent:
        d.rectangle((x, y, x + 4, y + h), fill=accent)
    text((x + 12, y + 8), label, font(13, True), TXT)
    if sub:
        text((x + 12, y + 26), sub, font(11), MUTED)


def _draw_segments(points, color, dashed, width):
    import math
    for i in range(len(points) - 1):
        x1, y1 = points[i]
        x2, y2 = points[i + 1]
        if dashed:
            dx, dy = x2 - x1, y2 - y1
            dist = math.hypot(dx, dy)
            steps = max(1, int(dist / 10))
            for k in range(steps):
                if k % 2 == 0:
                    t1, t2 = k / steps, (k + 0.6) / steps
                    d.line(
                        (x1 + dx * t1, y1 + dy * t1, x1 + dx * t2, y1 + dy * t2),
                        fill=color, width=width,
                    )
        else:
            d.line((x1, y1, x2, y2), fill=color, width=width)


def elbow(points, color, label=None, label_pos=None, dashed=False, width=2):
    import math
    _draw_segments(points, color, dashed, width)
    x1, y1 = points[-2]
    x2, y2 = points[-1]
    ang = math.atan2(y2 - y1, x2 - x1)
    ah = 10
    p1 = (x2, y2)
    p2 = (x2 - ah * math.cos(ang - 0.4), y2 - ah * math.sin(ang - 0.4))
    p3 = (x2 - ah * math.cos(ang + 0.4), y2 - ah * math.sin(ang + 0.4))
    d.polygon([p1, p2, p3], fill=color)
    if label and label_pos:
        mx, my = label_pos
        bbox = d.textbbox((mx, my), label, font=font(11, True), anchor="mm")
        d.rounded_rectangle((bbox[0] - 6, bbox[1] - 3, bbox[2] + 6, bbox[3] + 3), radius=6, fill=BG, outline=color, width=1)
        text((mx, my), label, font(11, True), color, anchor="mm")


def arrow(x1, y1, x2, y2, color, label=None, label_offset=(0, -14), dashed=False, width=2):
    if dashed:
        # draw dashed line
        import math
        dx, dy = x2 - x1, y2 - y1
        dist = math.hypot(dx, dy)
        steps = int(dist / 10)
        for i in range(steps):
            if i % 2 == 0:
                t1, t2 = i / steps, (i + 0.6) / steps
                d.line(
                    (x1 + dx * t1, y1 + dy * t1, x1 + dx * t2, y1 + dy * t2),
                    fill=color, width=width,
                )
    else:
        d.line((x1, y1, x2, y2), fill=color, width=width)
    # arrowhead
    import math
    ang = math.atan2(y2 - y1, x2 - x1)
    ah = 10
    p1 = (x2, y2)
    p2 = (x2 - ah * math.cos(ang - 0.4), y2 - ah * math.sin(ang - 0.4))
    p3 = (x2 - ah * math.cos(ang + 0.4), y2 - ah * math.sin(ang + 0.4))
    d.polygon([p1, p2, p3], fill=color)
    if label:
        mx, my = (x1 + x2) / 2 + label_offset[0], (y1 + y2) / 2 + label_offset[1]
        # background pill for legibility
        bbox = d.textbbox((mx, my), label, font=font(11, True), anchor="mm")
        d.rounded_rectangle((bbox[0] - 6, bbox[1] - 3, bbox[2] + 6, bbox[3] + 3), radius=6, fill=BG, outline=color, width=1)
        text((mx, my), label, font(11, True), color, anchor="mm")


# ---------- Title ----------
text((60, 36), "Four Walls Trading System — Architecture", font(34, True), TITLE_C)
text((60, 78), "Real-time Nifty OI Monitoring Platform", font(16), MUTED)

# Legend (top right)
lx, ly = 1180, 40
d.rounded_rectangle((lx, ly, lx + 560, ly + 70), radius=10, fill=PANEL, outline=GRID)
text((lx + 16, ly + 10), "DATA FLOW", font(11, True), MUTED)
items = [("REST / HTTP", ARROW_REST), ("WebSocket", ARROW_WS), ("OAuth 2.0", ARROW_OAUTH), ("S3 Backup", ARROW_S3)]
ix = lx + 16
for lbl, col in items:
    d.line((ix, ly + 46, ix + 26, ly + 46), fill=col, width=3)
    d.polygon([(ix + 26, ly + 46), (ix + 22, ly + 42), (ix + 22, ly + 50)], fill=col)
    text((ix + 32, ly + 39), lbl, font(12, True), TXT)
    ix += 140

# Layer label helper
def layer_label(y, name, color):
    d.rounded_rectangle((20, y, 44, y + 28), radius=6, fill=color)
    text((52, y + 4), name, font(13, True), MUTED)

# ===== LAYER 1 — Browser =====
L1_Y = 130
layer_label(L1_Y + 20, "BROWSER", C_BROWSER)
panel(220, L1_Y, 1140, 150, C_BROWSER, "React SPA  ·  Vite", "Single Page App served from EC2 / S3")
# component chips
cx, cy = 250, L1_Y + 60
for i, (t, s) in enumerate([
    ("OI Monitor", "live polling"),
    ("Order Panel", "place / modify"),
    ("Pivot Calculator", "intraday levels"),
    ("Option Chain", "ATM / OTM"),
    ("AWS Cost Analysis", "spend dashboard"),
]):
    chip(cx + i * 218, cy, 200, 70, t, s, C_BROWSER)

# state row
text((250, L1_Y + 142), "State  ·  AuthContext (localStorage token)   ·   useUpstoxPolling (2-5s)   ·   useLiveWS (WebSocket)", font(12), MUTED)

# ===== LAYER 2 — Backend =====
L2_Y = 330
layer_label(L2_Y + 30, "BACKEND", C_BACKEND)
panel(220, L2_Y, 1140, 240, C_BACKEND, "Node.js  ·  Express Server  (port 3000)", "Single proxy server  ·  OAuth, market proxies, OI tracker, WS feed")

# route group chips
rx, ry = 250, L2_Y + 70
groups = [
    ("OAuth", "/api/auth/login\n/api/auth/callback"),
    ("Market Proxies", "/api/quotes\n/api/option-chain"),
    ("Order Mgmt", "/api/order/place\n/api/bot/order/*"),
    ("OI Endpoints", "/api/oi/latest\n/api/oi/history /save"),
]
for i, (t, s) in enumerate(groups):
    x = rx + i * 270
    d.rounded_rectangle((x, ry, x + 250, ry + 80), radius=8, fill=(22, 32, 50), outline=GRID)
    d.rectangle((x, ry, x + 4, ry + 80), fill=C_BACKEND)
    text((x + 12, ry + 8), t, font(13, True), TXT)
    text((x + 12, ry + 30), s, font(11), MUTED)

# daemon row
dy2 = L2_Y + 168
chip(250, dy2, 340, 56, "OI Tracker daemon  (oi-tracker.js)", "polls every 3 min  ·  09:15 – 15:30 IST", C_BACKEND)
chip(610, dy2, 340, 56, "WebSocket Feed  (upstox-feed.js)", "protobuf decoder  ·  auto-reconnect", C_BACKEND)
chip(970, dy2, 360, 56, "Master Instrument Cache", "complete.json.gz  ·  in-memory  ·  daily refresh", C_BACKEND)

# ===== LAYER 3 — Storage =====
L3_Y = 620
layer_label(L3_Y + 30, "STORAGE", C_STORAGE)
panel(220, L3_Y, 1140, 150, C_STORAGE, "Data Persistence", "SQLite  ·  Browser localStorage  ·  AWS S3 backup")
sx = 250
for i, (t, s) in enumerate([
    ("SQLite  data/future_oi.db", "future_oi (id, ts, date, time, symbol,\nexpiry, oi, oi_change, ltp, volume)"),
    ("Browser localStorage", "OI snapshot history\nmax 200 per instrument"),
    ("AWS S3  ·  four-walls-oi-backup", "Daily gzip backup\nat 15:35 IST"),
]):
    x = sx + i * 370
    d.rounded_rectangle((x, L3_Y + 60, x + 350, L3_Y + 140), radius=8, fill=(22, 32, 50), outline=GRID)
    d.rectangle((x, L3_Y + 60, x + 4, L3_Y + 140), fill=C_STORAGE)
    text((x + 12, L3_Y + 68), t, font(13, True), TXT)
    text((x + 12, L3_Y + 90), s, font(11), MUTED)

# ===== LAYER 4 — External =====
L4_Y = 820
layer_label(L4_Y + 30, "EXTERNAL", C_EXTERN)
panel(220, L4_Y, 1140, 170, C_EXTERN, "External Services", "Third-party APIs and data sources")
ex = 250
externals = [
    ("Upstox API v2", "OAuth 2.0  ·  Quotes  ·  Option Chain\nOrder Book  ·  Portfolio  ·  WS Feed"),
    ("Upstox Master CDN", "assets.upstox.com\n500k instruments JSON  (~350 MB)"),
    ("AWS Cost Explorer", "Daily spend  ·  service breakdown\nbudget alerts"),
]
for i, (t, s) in enumerate(externals):
    x = ex + i * 370
    d.rounded_rectangle((x, L4_Y + 60, x + 350, L4_Y + 150), radius=8, fill=(22, 32, 50), outline=GRID)
    d.rectangle((x, L4_Y + 60, x + 4, L4_Y + 150), fill=C_EXTERN)
    text((x + 12, L4_Y + 68), t, font(13, True), TXT)
    text((x + 12, L4_Y + 92), s, font(11), MUTED)

# ===== LAYER 5 — Infrastructure (right side, full height) =====
INFRA_X = 1400
INFRA_Y = 130
INFRA_W = 380
INFRA_H = 860
panel(INFRA_X, INFRA_Y, INFRA_W, INFRA_H, C_INFRA, "AWS Cloud Infrastructure", "EC2 / Nginx / PM2  ·  CI/CD")

# stack visualization
stack_x = INFRA_X + 30
stack_y = INFRA_Y + 80
stack_w = INFRA_W - 60
stages = [
    ("Application Load Balancer", "ports 80 / 443"),
    ("EC2  t3.micro", "Ubuntu 22.04 LTS"),
    ("Nginx", "reverse proxy  ·  SSL term"),
    ("PM2", "process manager"),
    ("Node.js  Express", "proxy-server.js"),
]
for i, (t, s) in enumerate(stages):
    y = stack_y + i * 86
    d.rounded_rectangle((stack_x, y, stack_x + stack_w, y + 70), radius=8, fill=(22, 32, 50), outline=GRID)
    d.rectangle((stack_x, y, stack_x + 4, y + 70), fill=C_INFRA)
    text((stack_x + 14, y + 10), t, font(13, True), TXT)
    text((stack_x + 14, y + 32), s, font(11), MUTED)
    # connector arrow between stack items
    if i < len(stages) - 1:
        ax = stack_x + stack_w / 2
        d.polygon([(ax - 6, y + 76), (ax + 6, y + 76), (ax, y + 84)], fill=C_INFRA)

# IAM / SG / CICD chips
sub_y = stack_y + len(stages) * 86 + 8
chip(stack_x, sub_y, stack_w, 50, "IAM Role", "S3  +  CloudWatch permissions", C_INFRA)
chip(stack_x, sub_y + 60, stack_w, 50, "Security Group", "ingress  80 / 443 / 22", C_INFRA)
chip(stack_x, sub_y + 120, stack_w, 56, "GitHub Actions  CI/CD",
     "lint  →  build  →  CloudFormation  →  rsync deploy", C_INFRA)

# ===== ARROWS =====
# Browser → Backend (REST polling)
arrow(790, L1_Y + 280, 790, L2_Y, ARROW_REST, "polls every 2-5s")
# Browser → Backend (WS)
arrow(560, L1_Y + 280, 560, L2_Y, ARROW_WS, "WebSocket /ws/feed")
# Browser → Backend (OAuth redirect)
arrow(1020, L1_Y + 280, 1020, L2_Y, ARROW_OAUTH, "OAuth 2.0 redirect", dashed=True)

# Backend → Storage (write OI)
arrow(560, L2_Y + 240, 560, L3_Y, ARROW_REST, "3-min snapshots")
# Backend ↔ localStorage shown as dashed (cached client-side)
arrow(900, L3_Y, 900, L2_Y + 240, ARROW_REST, "OI history reads", dashed=True)

# Storage → External (S3 backup)
arrow(1100, L3_Y + 110, 1300, L4_Y + 60, ARROW_S3, "gzip backup 15:35 IST")

# Backend → External arrows route around Storage layer along the left margin
ROUTE_X1 = 180   # left rail (between layer label column and panel)
ROUTE_X2 = 195   # second rail
ROUTE_X3 = 210   # third rail

# Upstox REST  (from OAuth/Quotes area, route left then down then into Upstox API v2 panel)
elbow(
    [(280, L2_Y + 240), (280, L3_Y - 30), (ROUTE_X1, L3_Y - 30), (ROUTE_X1, L4_Y + 100), (250, L4_Y + 100)],
    ARROW_REST, label="Upstox REST", label_pos=(ROUTE_X1 - 60, (L3_Y + L4_Y) / 2),
)

# Upstox WS feed (from WebSocket Feed daemon)
elbow(
    [(780, L2_Y + 224), (780, L3_Y - 18), (ROUTE_X2, L3_Y - 18), (ROUTE_X2, L4_Y + 130), (250, L4_Y + 130)],
    ARROW_WS, label="Upstox feed (protobuf)", label_pos=(ROUTE_X2 - 95, L4_Y - 30),
)

# Upstox CDN master list  (from Master Instrument Cache)
elbow(
    [(1150, L2_Y + 224), (1150, L3_Y - 6), (ROUTE_X3, L3_Y - 6), (ROUTE_X3, L4_Y + 100), (620, L4_Y + 100)],
    ARROW_REST, label="master list (daily)", label_pos=(ROUTE_X3 - 70, L4_Y - 60), dashed=True,
)

# Backend ↔ Infrastructure (hosted on)
arrow(1360, L2_Y + 120, INFRA_X, INFRA_Y + 200, C_INFRA, "hosted on EC2")

# Footer
text((60, H - 36), "© Four Walls  ·  Architecture v1  ·  generated for documentation",
     font(11), MUTED)

out = r"D:\Ragu_ackpat\Projects\four-walls-trading-system\.claude\worktrees\clever-engelbart-72717f\architecture-diagram.png"
img.save(out, "PNG")
print("wrote", out)
