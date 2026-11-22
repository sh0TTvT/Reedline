using System.Diagnostics;
using System.Runtime.InteropServices;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        if (args.Length == 3 && args[0] == "--drive")
        {
            try { new UiDriver(int.Parse(args[1]), args[2]).Run(); }
            catch (Exception e)
            {
                File.WriteAllText(Path.Combine(args[2], "ui-error"), e.ToString());
                UiDriver.Capture(Path.GetFullPath("artifacts/windows-ui-error.png"));
                Environment.ExitCode = 1;
            }
            return;
        }
        Application.Run(new Receiver(args[0]));
    }
}
internal sealed class Receiver : Form
{
    private readonly string dir;
    private readonly Stopwatch clock = Stopwatch.StartNew();
    private readonly System.Windows.Forms.Timer poll = new() { Interval = 25 };
    public Receiver(string directory)
    {
        dir = directory; Text = "Reedline CI input receiver"; Width = 620; Height = 430;
        StartPosition = FormStartPosition.CenterScreen;
        poll.Tick += (_, _) => ReadCommand();
        Shown += (_, _) => { FocusReceiver(); poll.Start(); File.WriteAllText(Path.Combine(dir,"ready"),"ok"); };
    }
    private void FocusReceiver()
    {
        Show(); WindowState = FormWindowState.Normal; TopMost = true; Activate();
        SetForegroundWindow(Handle);
        Cursor.Position = PointToScreen(new Point(ClientSize.Width/2,ClientSize.Height/2));
        if (GetForegroundWindow() != Handle) { mouse_event(2,0,0,0,0); mouse_event(4,0,0,0,0); }
    }
    private void ReadCommand()
    {
        var path = Path.Combine(dir,"command");
        if (!File.Exists(path)) return;
        string[] parts;
        try { parts = File.ReadAllText(path).Trim().Split(' ', 2); File.Delete(path); } catch (IOException) { return; }
        string command = parts[1];
        if (command == "focus") FocusReceiver();
        else if (command == "blur") { TopMost = false; Hide(); }
        else if (command == "F6" || command == "F8")
        {
            byte key = (byte)(command == "F6" ? Keys.F6 : Keys.F8);
            keybd_event(key,0,0,0); keybd_event(key,0,2,0);
        }
        else if (command == "exit") Close();
        else throw new ArgumentException(command);
        File.AppendAllText(Path.Combine(dir, "commands"), command + " foreground=" + GetForegroundWindow() + " receiver=" + Handle + "\n");
        File.WriteAllText(Path.Combine(dir, "ack"), parts[0]);
    }
    protected override void WndProc(ref Message m)
    {
        string? data = m.Msg switch {
            0x100 => "kd:" + (int)m.WParam, 0x101 => "ku:" + (int)m.WParam,
            0x201 => "md:1", 0x202 => "mu:1", 0x204 => "md:2", 0x205 => "mu:2",
            0x207 => "md:4", 0x208 => "mu:4", _ => null
        };
        if (data != null && dir != null) File.AppendAllText(Path.Combine(dir,"events"), clock.ElapsedMilliseconds + " " + data + "\n");
        base.WndProc(ref m);
    }
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(nint hwnd);
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern void mouse_event(uint flags,int x,int y,uint data,nuint extra);
    [DllImport("user32.dll")] private static extern void keybd_event(byte vk, byte scan, uint flags, nuint extra);
}
