/**
 * 持久守护进程 - 手柄硬件审批服务
 *
 * 只启动一次，常驻后台。MCP 工具通过 HTTP 与此进程通信，
 * 常驻小窗口通过 SSE 实时接收审批请求。
 *
 * 启动方式: npm run daemon
 *
 * API:
 *   GET  /api/events              SSE 推送（UI 窗口连接）
 *   POST /api/register-request    发起手柄注册（阻塞等待结果）
 *   POST /api/approval-request    发起审批（阻塞等待结果）
 */

import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import open from "open";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "public");
const PORT = 24591;

// ============================================================
// 请求存储
// ============================================================

interface PendingRequest<T> {
  id: string;
  resolve: (value: T) => void;
  timer: ReturnType<typeof setTimeout>;
}

const registerRequests = new Map<string, PendingRequest<{ success: boolean; error: string }>>();

// SSE 客户端列表
const sseClients: Set<express.Response> = new Set();

// 是否已注册
let controllerRegistered = false;

// ============================================================
// 工具函数
// ============================================================

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ============================================================
// PowerShell 手柄直连（不经过浏览器）
// ============================================================

const GAMEPAD_SCRIPT = join(__dirname, "gamepad.ps1");

/** 调用 PowerShell 直连手柄，震动 + 等待 A/B 按键 */
function spawnGamepadApprove(timeoutSeconds: number): Promise<{ result: string }> {
  return new Promise((resolve) => {
    const ps = spawn("powershell", [
      "-ExecutionPolicy", "Bypass",
      "-File", GAMEPAD_SCRIPT,
      "-Mode", "approve",
      "-Timeout", String(timeoutSeconds),
    ]);

    let stdout = "";
    ps.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    ps.stderr.on("data", (data: Buffer) => { console.error("[Gamepad]", data.toString()); });
    ps.on("close", () => {
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        resolve({ result: "error" });
      }
    });
    ps.on("error", () => {
      resolve({ result: "error" });
    });
  });
}

function pushSSE(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// ============================================================
// Express 应用
// ============================================================

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// ---- SSE 端点 ----
app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("event: connected\ndata: {}\n\n");
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// ---- 手柄注册（阻塞模式）----
app.post("/api/register-request", (_req, res) => {
  const id = uid();

  pushSSE("register-request", { requestId: id });

  const timer = setTimeout(() => {
    registerRequests.delete(id);
    res.json({ success: false, error: "注册超时" });
  }, 60_000);

  registerRequests.set(id, {
    id,
    resolve: (result) => {
      clearTimeout(timer);
      registerRequests.delete(id);
      res.json(result);
    },
    timer,
  });
});

app.post("/api/register-done/:id", (req, res) => {
  const entry = registerRequests.get(req.params.id);
  if (entry) {
    controllerRegistered = true;
    entry.resolve({ success: true, error: "" });
    res.json({ ok: true });
  } else {
    res.status(404).json({ ok: false });
  }
});

app.post("/api/register-cancel/:id", (req, res) => {
  const entry = registerRequests.get(req.params.id);
  if (entry) {
    entry.resolve({ success: false, error: "用户取消" });
    res.json({ ok: true });
  } else {
    res.status(404).json({ ok: false });
  }
});

// ---- 审批（daemon 直连手柄，不经过浏览器）----
app.post("/api/approval-request", async (req, res) => {
  const id = uid();
  const { action, target, riskLevel, summary, details, timeoutSeconds } = req.body;
  const timeout = timeoutSeconds || 120;

  // 手柄震动由 PowerShell 脚本负责，不再用蜂鸣器

  // SSE 推送浏览器显示（纯展示，不参与审批逻辑）
  pushSSE("approval-request", {
    requestId: id,
    action,
    target,
    riskLevel,
    summary,
    details,
  });

  // PowerShell 直连手柄：震动 + 等待 A/B 按键
  const result = await spawnGamepadApprove(timeout);

  // SSE 推送审批结果给浏览器
  pushSSE("approval-resolved", {
    requestId: id,
    result: result.result,
  });

  const approved = result.result === "approved";
  let reason = "";
  switch (result.result) {
    case "timeout":       reason = "审批超时"; break;
    case "rejected":      reason = "用户拒绝"; break;
    case "disconnected":  reason = "手柄断开"; break;
    case "error":         reason = "无法读取手柄"; break;
  }

  res.json({ approved, reason });
});

// ---- 注册状态查询 ----
app.get("/api/registration-status", (_req, res) => {
  res.json({ registered: controllerRegistered });
});

// ============================================================
// 启动
// ============================================================

const server = createServer(app);

server.listen(PORT, async () => {
  console.error(`[Daemon] 守护进程已启动，端口 ${PORT}`);
  if (process.env.NO_OPEN_BROWSER !== "1") {
    // 启动确认震动
    spawn("powershell", [
      "-ExecutionPolicy", "Bypass",
      "-File", GAMEPAD_SCRIPT,
      "-Mode", "vibrate",
    ]);
    await open(`http://localhost:${PORT}/app.html`);
  } else {
    console.error("[Daemon] 由 MCP 自动拉起，跳过浏览器打开");
  }
});
