# XInput 手柄助手 — 直接读取 Xbox 手柄，不依赖浏览器
# 用法: powershell -ExecutionPolicy Bypass -File gamepad.ps1 -Mode approve [-Timeout 120]
param(
    [Parameter(Mandatory=$true)]
    [string]$Mode,       # "approve" | "check" | "vibrate"
    [int]$Timeout = 120
)

# ============================================================
# XInput P/Invoke 内联编译
# ============================================================
$csharp = @'
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct XINPUT_GAMEPAD {
    public ushort wButtons;
    public byte bLeftTrigger;
    public byte bRightTrigger;
    public short sThumbLX;
    public short sThumbLY;
    public short sThumbRX;
    public short sThumbRY;
}

[StructLayout(LayoutKind.Sequential)]
public struct XINPUT_STATE {
    public uint dwPacketNumber;
    public XINPUT_GAMEPAD Gamepad;
}

[StructLayout(LayoutKind.Sequential)]
public struct XINPUT_VIBRATION {
    public ushort wLeftMotorSpeed;
    public ushort wRightMotorSpeed;
}

public static class XInput {
    private const string Dll14 = "xinput1_4.dll";
    private const string Dll13 = "xinput1_3.dll";
    private const string Dll91 = "xinput9_1_0.dll";
    
    private static string _dll = null;
    private static string ResolveDll() {
        if (_dll != null) return _dll;
        IntPtr h;
        h = LoadLibrary(Dll14); if (h != IntPtr.Zero) { FreeLibrary(h); _dll = Dll14; return _dll; }
        h = LoadLibrary(Dll13); if (h != IntPtr.Zero) { FreeLibrary(h); _dll = Dll13; return _dll; }
        h = LoadLibrary(Dll91); if (h != IntPtr.Zero) { FreeLibrary(h); _dll = Dll91; return _dll; }
        throw new Exception("XInput DLL not found");
    }

    [DllImport("kernel32", SetLastError=true)]
    private static extern IntPtr LoadLibrary(string lpFileName);
    [DllImport("kernel32", SetLastError=true)]
    private static extern bool FreeLibrary(IntPtr hModule);

    [DllImport(Dll14, EntryPoint="XInputGetState")]
    private static extern uint _XInputGetState14(uint index, ref XINPUT_STATE state);
    [DllImport(Dll13, EntryPoint="XInputGetState")]
    private static extern uint _XInputGetState13(uint index, ref XINPUT_STATE state);
    [DllImport(Dll91, EntryPoint="XInputGetState")]
    private static extern uint _XInputGetState91(uint index, ref XINPUT_STATE state);
    
    [DllImport(Dll14, EntryPoint="XInputSetState")]
    private static extern uint _XInputSetState14(uint index, ref XINPUT_VIBRATION vib);
    [DllImport(Dll13, EntryPoint="XInputSetState")]
    private static extern uint _XInputSetState13(uint index, ref XINPUT_VIBRATION vib);
    [DllImport(Dll91, EntryPoint="XInputSetState")]
    private static extern uint _XInputSetState91(uint index, ref XINPUT_VIBRATION vib);

    public static uint GetState(uint index, ref XINPUT_STATE state) {
        var dll = ResolveDll();
        if (dll == Dll14) return _XInputGetState14(index, ref state);
        if (dll == Dll13) return _XInputGetState13(index, ref state);
        return _XInputGetState91(index, ref state);
    }

    public static uint SetState(uint index, ushort left, ushort right) {
        var vib = new XINPUT_VIBRATION { wLeftMotorSpeed = left, wRightMotorSpeed = right };
        var dll = ResolveDll();
        if (dll == Dll14) return _XInputSetState14(index, ref vib);
        if (dll == Dll13) return _XInputSetState13(index, ref vib);
        return _XInputSetState91(index, ref vib);
    }
}
'@

$null = Add-Type -TypeDefinition $csharp -ErrorAction Stop

# ============================================================
# 查找手柄
# ============================================================
function Find-Gamepad {
    for ($i = 0; $i -lt 4; $i++) {
        $state = New-Object XINPUT_STATE
        $r = [XInput]::GetState($i, [ref]$state)
        if ($r -eq 0) { return @{ Index = $i; State = $state } }
    }
    return $null
}

# ============================================================
# Mode: check — 检查手柄是否连接
# ============================================================
if ($Mode -eq "check") {
    $gp = Find-Gamepad
    if ($gp) {
        Write-Output ('{"connected":true,"index":' + $gp.Index + '}')
    } else {
        $diag = @()
        for ($i = 0; $i -lt 4; $i++) {
            $state = New-Object XINPUT_STATE
            $r = [XInput]::GetState($i, [ref]$state)
            $diag += "slot$i=$r"
        }
        Write-Output ('{"connected":false,"diag":"' + ($diag -join ",") + '"}')
    }
    exit 0
}

# ============================================================
# Mode: vibrate — 单独震动测试
# ============================================================
if ($Mode -eq "vibrate") {
    $gp = Find-Gamepad
    if (-not $gp) { Write-Output '{"ok":false,"error":"no gamepad"}'; exit 1 }
    $null = [XInput]::SetState($gp.Index, 25000, 15000); Start-Sleep -Milliseconds 120
    $null = [XInput]::SetState($gp.Index, 0, 0);        Start-Sleep -Milliseconds 80
    $null = [XInput]::SetState($gp.Index, 25000, 15000); Start-Sleep -Milliseconds 120
    $null = [XInput]::SetState($gp.Index, 0, 0)
    Write-Output '{"ok":true}'
    exit 0
}

# ============================================================
# Mode: approve — 震动 + 等待 A/B 按键（分时轮询）
# ============================================================
if ($Mode -ne "approve") {
    Write-Output '{"result":"error","reason":"unknown mode"}'
    exit 1
}

$gp = Find-Gamepad
if (-not $gp) {
    Write-Output '{"result":"error","reason":"no gamepad connected"}'
    exit 1
}

$idx = $gp.Index

# ---- 震动序列参数 ----
$phase = 0
$phaseStart = [DateTime]::Now
$PHASE0_MS = 200
$PHASE1_MS = 120
$PHASE2_MS = 150

# ---- 轮询 ----
$deadline = [DateTime]::Now.AddSeconds($Timeout)
$lastA = $false
$lastB = $false
$result = "timeout"

# 只在相位变化时调用一次 SetState
$null = [XInput]::SetState($idx, 65535, 65535)

# 脚本所在目录（用于找到 WAV 文件）
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

while ([DateTime]::Now -lt $deadline) {
    $elapsed = ([DateTime]::Now - $phaseStart).TotalMilliseconds

    if ($phase -eq 0) {
        if ($elapsed -ge $PHASE0_MS) {
            $null = [XInput]::SetState($idx, 0, 0)
            $phase = 1
            $phaseStart = [DateTime]::Now
        }
    }
    elseif ($phase -eq 1) {
        if ($elapsed -ge $PHASE1_MS) {
            $null = [XInput]::SetState($idx, 65535, 65535)
            $phase = 2
            $phaseStart = [DateTime]::Now
        }
    }
    elseif ($phase -eq 2) {
        if ($elapsed -ge $PHASE2_MS) {
            $null = [XInput]::SetState($idx, 0, 0)
            $phase = 3
        }
    }

    $state = New-Object XINPUT_STATE
    $r = [XInput]::GetState($idx, [ref]$state)
    if ($r -ne 0) {
        $null = [XInput]::SetState($idx, 0, 0)
        $result = "disconnected"
        break
    }

    $btns = $state.Gamepad.wButtons
    $a = ($btns -band 0x1000) -ne 0
    $b = ($btns -band 0x2000) -ne 0

    if ($a -and -not $lastA) {
        $null = [XInput]::SetState($idx, 0, 0)
        # 升调二连 "叮-叮↑"
        [Console]::Beep(1200, 80)
        Start-Sleep -Milliseconds 40
        [Console]::Beep(1800, 120)
        $result = "approved"
        break
    }
    if ($b -and -not $lastB) {
        $null = [XInput]::SetState($idx, 0, 0)
        # 游戏风格连奏：降调双音（类似错误提示）
        [Console]::Beep(400, 100)
        Start-Sleep -Milliseconds 50
        [Console]::Beep(250, 180)
        $result = "rejected"
        break
    }

    $lastA = $a
    $lastB = $b
    Start-Sleep -Milliseconds 30
}

# 确保震动关闭
$null = [XInput]::SetState($idx, 0, 0)

Write-Output ('{"result":"' + $result + '"}')
