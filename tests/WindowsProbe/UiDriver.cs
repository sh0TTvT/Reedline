using System.Diagnostics;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;

// Drives the distributed application through its accessible Windows controls, including
// the system file picker. No debugging endpoint or extra code path in the player is used.
internal sealed class UiDriver(int pid, string directory)
{
    private nint window;
    private readonly string traceFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Reedline","startup-trace.log");
    private int traceLines;
    public void Run()
    {
        using var host = Process.GetProcessById(pid);
        Wait(() => { host.Refresh(); window = host.MainWindowHandle; return window != 0; }, "desktop window");
        SetForegroundWindow(window);
        Find("导入歌曲", ControlType.Button);
        traceLines = File.ReadLines(traceFile).Count();
        Capture(Path.GetFullPath("artifacts/windows-studio.png"));
        Import(Path.GetFullPath("tests/fixtures/concert-a.mp3"), "concert-a");
        TraceContains("Armed notes 1");
        var sheet = Path.Combine(directory, "Signal.txt");
        File.WriteAllText(sheet, "BPM=120\n1, 2:4 #4 1':2 0");
        Import(sheet, "Signal");
        TraceContains("Armed notes 4");
        Click("游戏演奏");
        TraceContains("Transport error");
        Click("收进托盘");
        Wait(() => !IsWindowVisible(window), "window hidden in the notification area");
        File.WriteAllText(Path.Combine(directory,"ui-result"), "imported MP3 and score, foreground guard and tray hide passed");
    }
    private void TraceContains(string text)
    {
        Wait(() => File.ReadLines(traceFile).Skip(traceLines).Any(line => line.EndsWith(" " + text,StringComparison.Ordinal)),text);
    }
    private void Import(string path, string title)
    {
        Click("导入歌曲");
        Click("选择文件或拖到这里");
        nint dialog = 0;
        Wait(() =>
        {
            dialog = GetForegroundWindow();
            var name = new StringBuilder(128);
            GetClassName(dialog, name, name.Capacity);
            return name.ToString() == "#32770";
        }, "Windows file picker");
        var chooser = AutomationElement.FromHandle(dialog);
        var editors = chooser.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Edit));
        AutomationElement? editor = null;
        foreach (AutomationElement edit in editors)
        {
            if (edit.Current.AutomationId is "1148" or "1001" || edit.Current.Name.Contains("File name",StringComparison.OrdinalIgnoreCase)) { editor=edit; break; }
        }
        if (editor != null) editor.SetFocus();
        if (editor != null && editor.TryGetCurrentPattern(ValuePattern.Pattern, out var pattern))
            ((ValuePattern)pattern).SetValue(path);
        else { Clipboard.SetText(path); SendKeys.SendWait("^v"); }
        SendKeys.SendWait("{ENTER}");
        Find(title,null);
    }
    private AutomationElement Find(string label, ControlType? type)
    {
        AutomationElement? match = null;
        Wait(() =>
        {
            var root = AutomationElement.FromHandle(window);
            Condition condition = type == null ? Condition.TrueCondition : new PropertyCondition(AutomationElement.ControlTypeProperty, type);
            var items = root.FindAll(TreeScope.Descendants,condition);
            foreach (AutomationElement el in items)
            {
                if (el.Current.IsOffscreen || !el.Current.IsEnabled) continue;
                if (el.Current.Name.Contains(label,StringComparison.Ordinal)) { match = el; return true; }
            }
            return false;
        }, label);
        return match!;
    }
    private void Click(string label)
    {
        var b = Find(label, ControlType.Button).Current.BoundingRectangle;
        SetCursorPos((int)(b.Left + b.Width/2), (int)(b.Top + b.Height/2));
        mouse_event(2,0,0,0,0); mouse_event(4,0,0,0,0);
    }
    private void Wait(Func<bool> check,string label)
    {
        var watch = Stopwatch.StartNew();
        while (watch.Elapsed.TotalSeconds < 22)
        {
            try { if (check()) return; }
            catch (ElementNotAvailableException) { }
            catch (COMException) { }
            Thread.Sleep(140);
        }
        throw new TimeoutException("Windows UI: " + label);
    }
    internal static void Capture(string path)
    {
        var bounds = Screen.PrimaryScreen!.Bounds;
        using var image = new Bitmap(bounds.Width,bounds.Height);
        using var graphics = Graphics.FromImage(image);
        graphics.CopyFromScreen(bounds.Location,Point.Empty,bounds.Size);
        image.Save(path,ImageFormat.Png);
    }
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(nint hwnd);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint hwnd);
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern int GetClassName(nint hwnd,StringBuilder name,int size);
    [DllImport("user32.dll")] private static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")] private static extern void mouse_event(uint flags,int x,int y,uint data,nuint extra);
}
