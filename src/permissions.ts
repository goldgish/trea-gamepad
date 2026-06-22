/**
 * 权限规则定义 - 定义哪些操作需要硬件审批
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface PermissionRule {
  /** 操作类别 */
  category: string;
  /** 匹配模式（正则表达式） */
  patterns: string[];
  /** 风险等级 */
  riskLevel: RiskLevel;
  /** 是否需要硬件审批 */
  requireHardwareApproval: boolean;
  /** 描述 */
  description: string;
}

/**
 * 高危文件操作规则
 */
export const FILE_PERMISSION_RULES: PermissionRule[] = [
  {
    category: "file_delete",
    patterns: [
      "删除文件|delete.*file|unlink|rm\\s+-rf|rmdir|Remove-Item",
      "del\\s+/[fq]|rd\\s+/[sq]",
    ],
    riskLevel: "critical",
    requireHardwareApproval: true,
    description: "删除文件或目录",
  },
  {
    category: "file_overwrite",
    patterns: [
      "覆盖.*文件|overwrite|>\\s*/dev/|Set-Content",
      "强制写入|force.*write",
    ],
    riskLevel: "high",
    requireHardwareApproval: true,
    description: "覆盖或强制写入文件",
  },
  {
    category: "file_move_rename",
    patterns: [
      "mv\\s+.*/(etc|system|boot|sys)|move.*system",
      "Move-Item.*System32|ren.*system",
    ],
    riskLevel: "critical",
    requireHardwareApproval: true,
    description: "移动/重命名系统文件",
  },
  {
    category: "file_permission_change",
    patterns: [
      "chmod\\s+777|chown|icacls|takeown|Set-Acl",
    ],
    riskLevel: "high",
    requireHardwareApproval: true,
    description: "修改文件权限/所有者",
  },
];

/**
 * 高危命令操作规则
 */
export const COMMAND_PERMISSION_RULES: PermissionRule[] = [
  {
    category: "system_shutdown",
    patterns: [
      "shutdown|reboot|restart|halt|poweroff",
      "Stop-Computer|Restart-Computer",
    ],
    riskLevel: "critical",
    requireHardwareApproval: true,
    description: "关机/重启系统",
  },
  {
    category: "process_kill",
    patterns: [
      "taskkill\\s+/[fF]|kill\\s+-9|pkill|killall",
      "Stop-Process.*-Force",
    ],
    riskLevel: "high",
    requireHardwareApproval: true,
    description: "强制终止进程",
  },
  {
    category: "network_dangerous",
    patterns: [
      "iptables|netsh.*firewall|ufw|firewall-cmd",
      "Set-NetFirewallRule|New-NetFirewallRule",
      "nc\\s+-[lL]|ncat\\s+-[lL]|socat.*LISTEN",
    ],
    riskLevel: "high",
    requireHardwareApproval: true,
    description: "修改防火墙规则/开放端口监听",
  },
  {
    category: "disk_operation",
    patterns: [
      "format\\s|fdisk|mkfs|diskpart|dd\\s+if=",
      "Clear-Disk|Initialize-Disk|Format-Volume",
    ],
    riskLevel: "critical",
    requireHardwareApproval: true,
    description: "磁盘格式化/分区操作",
  },
  {
    category: "system_config_change",
    patterns: [
      "reg\\s+(add|delete)|regedit|sc\\s+(create|delete|config)",
      "Set-ItemProperty.*HKLM|New-Service",
      "systemctl\\s+(disable|mask)|launchctl\\s+unload",
    ],
    riskLevel: "critical",
    requireHardwareApproval: true,
    description: "修改系统配置/注册表/服务",
  },
  {
    category: "package_install_global",
    patterns: [
      "pip\\s+install\\s+-g|npm\\s+(i|install)\\s+-g",
      "gem\\s+install|choco\\s+install|brew\\s+install",
      "Install-Package|Install-Module",
    ],
    riskLevel: "medium",
    requireHardwareApproval: true,
    description: "全局安装软件包",
  },
  {
    category: "git_destructive",
    patterns: [
      "git\\s+push\\s+--force|git\\s+reset\\s+--hard",
      "git\\s+clean\\s+-[fdx]|git\\s+stash\\s+drop",
      "git\\s+branch\\s+-D",
    ],
    riskLevel: "high",
    requireHardwareApproval: true,
    description: "Git 破坏性操作",
  },
  {
    category: "env_secret_access",
    patterns: [
      "cat\\s+.*\\.(env|pem|key|cert)|Get-Content.*\\.(env|pem|key)",
      "echo\\s+\\$.*_(KEY|SECRET|TOKEN|PASSWORD)",
    ],
    riskLevel: "high",
    requireHardwareApproval: true,
    description: "访问环境变量/密钥文件",
  },
  {
    category: "curl_pipe_bash",
    patterns: [
      "curl.*\\|\\s*(ba)?sh|wget.*-O-\\s*\\|",
      "Invoke-WebRequest.*\\|.*Invoke-Expression",
      "iex\\s*\\(.*Invoke-WebRequest",
    ],
    riskLevel: "critical",
    requireHardwareApproval: true,
    description: "下载并执行远程脚本 (curl pipe sh)",
  },
  {
    category: "database_destructive",
    patterns: [
      "DROP\\s+(TABLE|DATABASE)|TRUNCATE|DELETE\\s+FROM",
      "db\\.dropDatabase|db\\.collection\\.drop",
    ],
    riskLevel: "critical",
    requireHardwareApproval: true,
    description: "数据库破坏性操作",
  },
  {
    category: "script_execution",
    patterns: [
      "node\\s+-e\\s|python\\s+-c\\s|python3\\s+-c\\s|perl\\s+-e\\s|ruby\\s+-e\\s",
      "powershell\\s+-Command\\s|powershell\\s+-c\\s|pwsh\\s+-Command\\s|pwsh\\s+-c\\s",
      "cmd\\s+/c\\s|bash\\s+-c\\s|zsh\\s+-c\\s|php\\s+-r\\s",
      "npx\\s|npm\\s+run\\s|yarn\\s+(run\\s)?|pnpm\\s+(run\\s)?",
    ],
    riskLevel: "medium",
    requireHardwareApproval: true,
    description: "执行任意脚本/运行 npm 脚本",
  },
  {
    category: "system_dir_write",
    patterns: [
      "\\s+(/etc/|/usr/local/bin/|/usr/bin/|/boot/|C:\\\\Windows\\\\|C:\\\\Windows\\\\System32\\\\)",
      ">\\s*/etc/|>>\\s*/etc/|Set-Content.*System32",
    ],
    riskLevel: "high",
    requireHardwareApproval: true,
    description: "写入系统目录",
  },
  {
    category: "scheduled_task",
    patterns: [
      "schtasks|at\\s+\\d{2}:\\d{2}|crontab|at\\s+(now|tomorrow)",
      "New-ScheduledTask|Register-ScheduledTask|Start-Job",
      "systemctl\\s+(enable|start)\\s|launchctl\\s+load",
    ],
    riskLevel: "high",
    requireHardwareApproval: true,
    description: "创建计划任务/持久化服务",
  },
  {
    category: "bulk_file_delete",
    patterns: [
      "rm\\s+-rf\\s+[/~.]|Remove-Item\\s+-Recurse.*-Force",
      "del\\s+/[sfq].*\\\\(System32|Windows|Program)",
    ],
    riskLevel: "critical",
    requireHardwareApproval: true,
    description: "强制递归删除大量文件",
  },
];

/**
 * 判断操作是否需要硬件审批
 */
export interface ApprovalRequest {
  /** 操作类型 */
  action: string;
  /** 操作目标 (文件路径、命令等) */
  target: string;
  /** 操作详情 */
  details?: string;
}

export interface ApprovalResult {
  /** 是否需要审批 */
  required: boolean;
  /** 匹配到的规则 */
  matchedRules: PermissionRule[];
  /** 最高风险等级 */
  highestRiskLevel: RiskLevel;
  /** 审批请求描述 */
  summary: string;
}

/**
 * 检查指定操作是否命中权限规则
 */
export function checkPermissions(request: ApprovalRequest): ApprovalResult {
  const allRules = [...FILE_PERMISSION_RULES, ...COMMAND_PERMISSION_RULES];
  const matchedRules: PermissionRule[] = [];
  const checkString = `${request.action} ${request.target} ${request.details || ""}`;

  for (const rule of allRules) {
    for (const pattern of rule.patterns) {
      try {
        const regex = new RegExp(pattern, "i");
        if (regex.test(checkString)) {
          matchedRules.push(rule);
          break;
        }
      } catch {
        // 跳过无效正则
      }
    }
  }

  const riskOrder: Record<RiskLevel, number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
  };

  const highestRiskLevel: RiskLevel = matchedRules.length > 0
    ? matchedRules.reduce((max, r) =>
        riskOrder[r.riskLevel] > riskOrder[max] ? r.riskLevel : max
      , "low" as RiskLevel)
    : "low";

  const categories = [...new Set(matchedRules.map((r) => r.category))];

  return {
    required: matchedRules.some((r) => r.requireHardwareApproval),
    matchedRules,
    highestRiskLevel,
    summary: matchedRules.length > 0
      ? `操作命中 ${matchedRules.length} 条规则: ${categories.join(", ")} (最高风险: ${highestRiskLevel})`
      : "未命中任何规则，无需审批",
  };
}

/**
 * 获取所有权限规则（供客户端查询）
 */
export function getAllRules(): PermissionRule[] {
  return [...FILE_PERMISSION_RULES, ...COMMAND_PERMISSION_RULES];
}
