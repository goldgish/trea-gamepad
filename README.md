# 🎮 Trea Gamepad

你是否厌恶每次给agent命令之后，以为agent能够处理好，结果卡在了权限审核上。
通过你的手柄来控制agent权限审批，避免vibecoding的时候切到别的地方还要切回去鼠标点击审批。
> agent发起申请，手柄震动，拿起手柄，按下按钮，审批搞定。

## 特性

- **物理隔离** — 审批决策必须通过 Xbox 手柄按键，远程攻击无法模拟
- **零打扰** — 手柄震动提醒，无需切换窗口或盯着浏览器
- **自动拉起** — MCP 启动时守护进程自动运行，无需额外操作
- **18 条权限规则** — 覆盖文件删除、命令执行、系统配置、网络操作等场景
- **游戏音效** — A/B 键带 Beep 连奏反馈音

## 前提条件

- Windows 系统
- Node.js ≥ 18
- Xbox 兼容手柄（XInput 协议，大多数 PC 手柄都支持）

## 安装

```bash
# 1. 克隆项目
git clone https://github.com/goldgish/trea-gamepad.git
cd trea-gamepad

# 2. 安装依赖 + 编译
npm install
npm run build
```

## 配置 MCP

在 Trae IDE 的 MCP 设置中添加：

```json
{
  "mcpServers": {
    "trea-gamepad": {
      "command": "node",
      "args": ["C:/你的路径/trea-gamepad/dist/index.js"]
    }
  }
}
```

> 路径请替换为你的实际项目路径，Windows 下用正斜杠 `/` 或双反斜杠 `\\`。

## 使用流程

### 1. 注册手柄（首次）

确保手柄已连接电脑，然后在对话中让 Agent 执行：

> "帮我注册手柄"

Agent 会调用 `register_key` 工具，手柄震一下确认连接成功。

### 2. 日常使用

当 Agent 要执行高危操作时：

1. **手柄震动两下** — 提醒你有事需要审批
2. **按 A 键批准** / **按 B 键驳回**
3. 按键时听到提示音确认生效
4. Agent 根据你的选择继续或中止操作

整个过程你不需要切换窗口、不需要看浏览器。震动就是信号，按键就是决策。

## 按键映射

| 按键 | 功能 | 音效 |
|------|------|------|
| **A** | 批准操作 | 升调二连 "叮-叮↑" |
| **B** | 驳回操作 | 降调双音 "咚-咚↓" |

## 权限规则覆盖

| 类别 | 示例 |
|------|------|
| 文件删除 | `rm -rf`, `Remove-Item`, `del /f` |
| 文件覆写 | `Set-Content`, 强制写入 |
| 系统文件操作 | `mv /etc/`, `chmod 777`, `schtasks` |
| 命令执行 | `npx`, `npm run`, `node -e`, `eval` |
| 网络操作 | `curl`, `wget` 写文件 |
| 环境变更 | `export PATH=`, `setx` |
| 批量删除 | `rm -rf /*`, `Remove-Item -Recurse` |

## 命令参考

```bash
npm run build   # 编译 TypeScript
npm run dev     # 开发模式运行 MCP 服务
npm run daemon  # 单独启动守护进程（通常不需要）
```

## 项目结构

```
src/
├── index.ts            # MCP 入口，启动时自动拉起守护进程
├── daemon.ts           # 守护进程 (localhost:24591)
├── permissions.ts      # 18 条权限规则
├── approval-server.ts  # 与守护进程通信的 HTTP 客户端
├── gamepad.ps1         # PowerShell XInput 手柄直连脚本
├── approve.wav         # A 键备用音效
└── public/
    └── app.html        # SSE 状态展示页
```

## 技术栈

- **MCP SDK** — `@modelcontextprotocol/sdk`
- **XInput API** — PowerShell P/Invoke 直连手柄，不经过浏览器 Gamepad API
- **Express** — 守护进程 HTTP 服务 + SSE 推送
- **TypeScript** + **tsx**

## License

MIT
