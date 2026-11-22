using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace Reedline;

internal sealed class WindowsInput : IInstrument
{
    public nint FindForegroundGame()
    {
        var window = GetForegroundWindow();
        if (window == 0) return 0;
        GetWindowThreadProcessId(window, out var pid);
        var handle = OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
        if (handle == 0) return 0;
        try
        {
            var path = new StringBuilder(1024);
            var size = (uint)path.Capacity;
            if (!QueryFullProcessImageName(handle, 0, path, ref size)) return 0;
            var name = Path.GetFileName(path.ToString());
            return name.Equals("DeltaForceClient-Win64-Shipping.exe", StringComparison.OrdinalIgnoreCase) ||
                   name.Equals("DeltaForceClient.exe", StringComparison.OrdinalIgnoreCase) ? window : 0;
        }
        finally { CloseHandle(handle); }
    }
    public bool StillForeground(nint target) => target != 0 && GetForegroundWindow() == target;
    public void Change(int control, bool down)
    {
        int vk = control switch { -1 => 1, -2 => 2, -4 => 4, _ => control };
        if (down && (GetAsyncKeyState(vk) & 0x8000) != 0)
            throw new InvalidOperationException("对应的键盘或鼠标键正被按住。松开后再继续。");
        var value = new Input();
        if (control < 0)
        {
            value.Type = 0;
            value.Data.Mouse.Flags = control switch
            {
                -1 => down ? 0x0002u : 0x0004u,
                -2 => down ? 0x0008u : 0x0010u,
                -4 => down ? 0x0020u : 0x0040u,
                _ => throw new ArgumentOutOfRangeException(nameof(control))
            };
        }
        else
        {
            value.Type = 1;
            value.Data.Keyboard.Scan = (ushort)MapVirtualKey((uint)control, 0);
            value.Data.Keyboard.Flags = 0x0008u | (down ? 0u : 0x0002u);
            if (value.Data.Keyboard.Scan == 0) throw new InvalidOperationException("当前键盘布局无法映射此音键。");
        }
        if (SendInput(1, ref value, Marshal.SizeOf<Input>()) != 1)
            throw new InvalidOperationException("Windows 未接收键鼠输入。请检查游戏与工具的运行权限是否一致。");
    }

    [StructLayout(LayoutKind.Sequential)] private struct Input { public uint Type; public Payload Data; }
    [StructLayout(LayoutKind.Explicit)] private struct Payload
    {
        [FieldOffset(0)] public MouseInput Mouse;
        [FieldOffset(0)] public KeyboardInput Keyboard;
    }
    [StructLayout(LayoutKind.Sequential)] private struct MouseInput
    {
        public int X, Y; public uint MouseData, Flags, Time; public nuint Extra;
    }
    [StructLayout(LayoutKind.Sequential)] private struct KeyboardInput
    {
        public ushort Vk, Scan; public uint Flags, Time; public nuint Extra;
    }
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window, out uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern nint OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool QueryFullProcessImageName(nint process, uint flags, StringBuilder name, ref uint size);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(nint handle);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int vk);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern uint MapVirtualKey(uint code, uint type);
    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, ref Input value, int size);
}
