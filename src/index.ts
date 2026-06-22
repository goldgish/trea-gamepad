/**
 * MCP Hardware Approval Server
 *
 * 基于 Model Context Protocol 的权限审批服务
 * 通过 Xbox 手柄按键进行物理确认
 *
 * 暴露的 MCP Tools:
 *  - check_permission:  检查操作是否需要审批
 *  - request_approval:  发起硬件审批流程（需要手柄按键组合确认）
 *  - list_rules:        列出所有权限规则
 *  - register_key:      注册手柄（首次使用）
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  checkPermissions,
  getAllRules,
} from "./permissions.js";
import {
  requestApproval,
  startRegistration,
} from "./approval-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_PORT = 24591;

// ---------------------------------------------------------------------------
// 创建 MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "mcp-hardware-approval",
  version: "1.0.0",
  description: "基于 Xbox 手柄按键的 Agent 权限审批服务",
});

// ---------------------------------------------------------------------------
// Tool: check_permission - 检查操作是否需要审批
// ---------------------------------------------------------------------------

server.tool(
  "check_permission",
  "检查一个操作是否需要硬件审批。在尝试执行文件操作或命令前调用此工具。",
  {
    action: z.string().describe("操作类型，如 'delete_file', 'run_command'"),
    target: z.string().describe("操作目标，如文件路径或命令内容"),
    details: z.string().optional().describe("附加详情"),
  },
  async ({ action, target, details }) => {
    const result = checkPermissions({ action, target, details });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              approval_required: result.required,
              risk_level: result.highestRiskLevel,
              matched_rules: result.matchedRules.map((r) => ({
                category: r.category,
                description: r.description,
                risk_level: r.riskLevel,
              })),
              summary: result.summary,
              action: result.required
                ? "请调用 request_approval 工具发起硬件审批"
                : "无需审批，可直接执行",
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: request_approval - 发起硬件审批
// ---------------------------------------------------------------------------

server.tool(
  "request_approval",
  "发起硬件审批流程。常驻窗口会弹出提醒并震动手柄，用户使用 Xbox 手柄按下 A+B+Start 组合键确认。",
  {
    action: z.string().describe("操作类型"),
    target: z.string().describe("操作目标"),
    risk_level: z.string().describe("风险等级 (low/medium/high/critical)"),
    summary: z.string().describe("审批摘要，展示给用户"),
    details: z.string().optional().describe("附加详情"),
    timeout_seconds: z
      .number()
      .optional()
      .default(120)
      .describe("审批超时秒数，默认 120"),
  },
  async ({ action, target, risk_level, summary, details, timeout_seconds }) => {
    const result = await requestApproval(
      {
        action,
        target,
        riskLevel: risk_level,
        summary,
        details,
      },
      (timeout_seconds || 120) * 1000
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              approved: result.approved,
              reason: result.reason || null,
              message: result.approved
                ? "硬件审批已通过，可以执行操作"
                : `硬件审批未通过: ${result.reason || "用户拒绝"}`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: list_rules - 列出所有权限规则
// ---------------------------------------------------------------------------

server.tool(
  "list_rules",
  "列出所有已配置的权限审批规则，了解哪些操作需要硬件审批。",
  {},
  async () => {
    const rules = getAllRules();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            rules.map((r) => ({
              category: r.category,
              description: r.description,
              risk_level: r.riskLevel,
              patterns: r.patterns,
            })),
            null,
            2
          ),
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: register_key - 注册硬件密钥
// ---------------------------------------------------------------------------

server.tool(
  "register_key",
  "注册 Xbox 手柄。首次使用前必须调用此工具，连接手柄后在常驻窗口中按 A 键确认。",
  {},
  async () => {
    const result = await startRegistration();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: result.success,
              message: result.success
                ? "手柄注册成功！现在可以使用 request_approval 进行硬件审批。"
                : `注册失败: ${result.error || "未知错误"}`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Daemon 自动启动
// ---------------------------------------------------------------------------

function daemonPortOpen(): boolean {
  try {
    execSync(`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${DAEMON_PORT} -ErrorAction Stop"`, {
      stdio: "ignore",
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

function waitForDaemon(maxWaitMs = 10000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (daemonPortOpen()) return resolve();
      if (Date.now() - start > maxWaitMs) return reject(new Error("等待守护进程启动超时"));
      setTimeout(check, 500);
    };
    check();
  });
}

async function ensureDaemonRunning() {
  if (daemonPortOpen()) {
    console.error("[MCP] 守护进程已在运行");
    return;
  }

  const daemonPath = join(__dirname, "daemon.js");
  console.error("[MCP] 正在启动守护进程...");

  spawn("node", [daemonPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, NO_OPEN_BROWSER: "1" },
  }).unref();

  await waitForDaemon();
  console.error("[MCP] 守护进程已就绪");
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

async function main() {
  await ensureDaemonRunning();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP-Hardware-Approval] 服务已启动");
}

main().catch((err) => {
  console.error("启动失败:", err);
  process.exit(1);
});
