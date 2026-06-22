/**
 * 硬件审批服务 - HTTP 客户端，与持久守护进程 (daemon) 通信
 *
 * 工作流程:
 * 1. MCP Server 调用 requestApproval() / startRegistration()
 * 2. 向守护进程发送 HTTP 请求（阻塞等待用户手柄确认）
 * 3. 守护进程通过 SSE 推送到常驻窗口 → 震动 + 弹窗提醒
 * 4. 用户在手柄上按组合键确认
 * 5. 守护进程返回结果给 HTTP 请求
 */

const DAEMON_URL = "http://localhost:24591";

/**
 * 注册手柄
 */
export async function startRegistration(): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch(`${DAEMON_URL}/api/register-request`, {
      method: "POST",
      signal: AbortSignal.timeout(65_000),
    });
    const data = await resp.json() as { success: boolean; error: string };
    return { success: data.success, error: data.error || undefined };
  } catch {
    return {
      success: false,
      error: "无法连接守护进程，请先运行 npm run daemon",
    };
  }
}

/**
 * 请求硬件审批
 */
export async function requestApproval(
  requestInfo: {
    action: string;
    target: string;
    riskLevel: string;
    summary: string;
    details?: string;
  },
  timeoutMs: number = 120_000
): Promise<{ approved: boolean; reason?: string }> {
  try {
    const resp = await fetch(`${DAEMON_URL}/api/approval-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...requestInfo,
        timeoutSeconds: Math.floor(timeoutMs / 1000),
      }),
      signal: AbortSignal.timeout(timeoutMs + 10_000),
    });
    const data = await resp.json() as { approved: boolean; reason: string };
    return { approved: data.approved, reason: data.reason || undefined };
  } catch {
    return {
      approved: false,
      reason: "无法连接守护进程，请先运行 npm run daemon",
    };
  }
}
