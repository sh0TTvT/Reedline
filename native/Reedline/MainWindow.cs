using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace Reedline;

internal sealed class MainWindow : Form
{
    private const string Origin = "https://reedline.local";
    private readonly WebView2 browser = new() { Dock = DockStyle.Fill };
    private readonly Scheduler player = new(new WindowsInput());
    private readonly NotifyIcon tray;
    private readonly System.Windows.Forms.Timer meter = new() { Interval = 85 };
    private readonly List<int> registered = [];
    private bool ready, showingTip, closing, blockStart;
    private PlayerState? previous;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public MainWindow()
    {
        Text = "Reedline · 口琴演奏台";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
        BackColor = Color.FromArgb(246, 247, 241);
        ClientSize = new Size(1230, 822);
        MinimumSize = new Size(740, 555);
        var screen = Screen.PrimaryScreen?.WorkingArea.Size ?? ClientSize;
        Size = new Size(Math.Min(Width, screen.Width), Math.Min(Height, screen.Height));
        StartPosition = FormStartPosition.CenterScreen;
        Controls.Add(browser);
        var menu = new ContextMenuStrip();
        menu.Items.Add("打开演奏台", null, (_, _) => RestoreWindow());
        menu.Items.Add("开始 / 暂停 / 继续     F6", null, (_, _) => Toggle());
        menu.Items.Add("停止演奏     F8", null, (_, _) => Stop());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("退出 Reedline", null, (_, _) => Close());
        tray = new NotifyIcon { Icon = Icon, Text = "Reedline · 口琴演奏台", ContextMenuStrip = menu, Visible = true };
        tray.DoubleClick += (_, _) => RestoreWindow();
        meter.Tick += (_, _) => Report();
        Shown += async (_, _) => await InitializeBrowser();
        SystemEvents.PowerModeChanged += PowerChanged;
        SystemEvents.SessionSwitch += SessionChanged;
    }

    private async Task InitializeBrowser()
    {
        Program.StartupTrace("Initializing WebView2");
        foreach (var (id, key) in new[] { (6, Keys.F6), (8, Keys.F8) })
            if (RegisterHotKey(Handle, id, 0x4000, (uint)key)) registered.Add(id);
        try
        {
            var root = Path.Combine(AppContext.BaseDirectory, "wwwroot");
            if (!File.Exists(Path.Combine(root, "index.html"))) throw new IOException("缺少界面文件，请完整解压便携包或重新安装。");
            var profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Reedline", "WebView");
            if (File.Exists(Path.Combine(AppContext.BaseDirectory, "WebView2Loader.dll")))
                CoreWebView2Environment.SetLoaderDllFolderPath(AppContext.BaseDirectory);
            Program.StartupTrace("Runtime " + CoreWebView2Environment.GetAvailableBrowserVersionString());
            var env = await CoreWebView2Environment.CreateAsync(null, profile);
            Program.StartupTrace("Browser environment created");
            await browser.EnsureCoreWebView2Async(env);
            Program.StartupTrace("WebView2 controller ready");
            var web = browser.CoreWebView2;
            web.SetVirtualHostNameToFolderMapping("reedline.local", root, CoreWebView2HostResourceAccessKind.DenyCors);
            web.Settings.AreDefaultContextMenusEnabled = false;
            web.Settings.IsStatusBarEnabled = false;
            web.Settings.IsZoomControlEnabled = false;
            web.Settings.AreBrowserAcceleratorKeysEnabled = false;
            web.NewWindowRequested += (_, e) => e.Handled = true;
            web.NavigationStarting += (_, e) => { if (!Trusted(e.Uri)) e.Cancel = true; };
            web.WebMessageReceived += OnMessage;
            web.ProcessFailed += (_, _) => { player.Stop(); ready = false; };
            web.Navigate(Origin + "/index.html");
            meter.Start();
        }
        catch (Exception e)
        {
            var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Reedline");
            try { Directory.CreateDirectory(directory); File.WriteAllText(Path.Combine(directory, "startup-error.log"), e.ToString()); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
            MessageBox.Show(this, "无法打开演奏台。请确认已安装 Microsoft Edge WebView2 运行时。\n\n" + e.Message, "Reedline");
            Close();
        }
    }

    private static bool Trusted(string address) =>
        Uri.TryCreate(address, UriKind.Absolute, out var uri) && uri.GetLeftPart(UriPartial.Authority) == Origin;

    private void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!Trusted(e.Source)) return;
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var msg = doc.RootElement;
            switch (msg.GetProperty("type").GetString())
            {
                case "ready":
                    Program.StartupTrace("Workstation ready");
                    ready = true;
                    Send(new { type = "hello", f6 = registered.Contains(6), f8 = registered.Contains(8) });
                    break;
                case "prepare":
                    player.Prepare(msg.GetProperty("plan").Deserialize<ScorePlan>(Json)!, msg.GetProperty("start").GetDouble());
                    break;
                case "seek": player.Seek(msg.GetProperty("position").GetDouble()); break;
                case "editing": blockStart = msg.GetProperty("value").GetBoolean(); break;
                case "toggle": Toggle(); return;
                case "stop": Stop(); return;
                case "tray": WindowState = FormWindowState.Minimized; break;
            }
            Report(true);
        }
        catch (Exception)
        {
            player.Stop();
            Send(new { type = "notice", message = "无法读取演奏指令，请重新选择曲目。" });
        }
    }

    private void Toggle()
    {
        if (blockStart && player.State.Phase is not ("playing" or "countdown" or "paused"))
        {
            Send(new { type = "notice", message = "完成当前操作后即可开始游戏演奏。" });
            return;
        }
        Send(new { type = "silence" });
        player.Toggle();
        Report(true);
    }
    private void Stop() { player.Stop(); Send(new { type = "silence" }); Report(true); }
    private void Send(object message)
    {
        if (ready && !closing) browser.CoreWebView2?.PostWebMessageAsJson(JsonSerializer.Serialize(message, Json));
    }
    private void Report(bool force = false)
    {
        var state = player.State;
        bool change = state.Phase != previous?.Phase || state.Message != previous?.Message;
        if (force || change || (Visible && state != previous)) Send(new { type = "state", state });
        if (change)
        {
            Program.StartupTrace("Transport " + state.Phase);
            tray.Text = "Reedline · " + (state.Phase switch
            {
                "countdown" => "准备演奏", "playing" => "正在游戏中演奏", "paused" => "已暂停",
                "error" => "演奏已中断", "finished" => "演奏结束", _ => "待命 · F6 开始"
            });
            if (!Visible && state.Phase == "error") tray.ShowBalloonTip(3000, "Reedline", state.Message, ToolTipIcon.Info);
        }
        previous = state;
    }
    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        if (WindowState == FormWindowState.Minimized && tray is not null)
        {
            Hide();
            meter.Interval = 500;
            if (!showingTip)
            {
                showingTip = true;
                tray.ShowBalloonTip(2200, "Reedline 已在后台待命", "切回游戏后按 F6 演奏，F8 停止。双击托盘图标可返回。", ToolTipIcon.Info);
            }
        }
    }
    private void RestoreWindow() { Show(); WindowState = FormWindowState.Normal; meter.Interval = 85; Activate(); Report(true); }
    private void PowerChanged(object sender, PowerModeChangedEventArgs e) { if (e.Mode == PowerModes.Suspend) player.Stop(); }
    private void SessionChanged(object sender, SessionSwitchEventArgs e) { if (e.Reason == SessionSwitchReason.SessionLock) player.Stop(); }
    protected override void WndProc(ref Message m)
    {
        if (m.Msg == 0x0312)
        {
            if ((int)m.WParam == 6) Toggle();
            if ((int)m.WParam == 8) Stop();
            return;
        }
        base.WndProc(ref m);
    }
    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        closing = true; meter.Stop();
        SystemEvents.PowerModeChanged -= PowerChanged;
        SystemEvents.SessionSwitch -= SessionChanged;
        foreach (int id in registered) UnregisterHotKey(Handle, id);
        player.Dispose(); meter.Dispose(); tray.Visible = false; tray.Dispose();
        base.OnFormClosing(e);
    }
    [DllImport("user32.dll")] private static extern bool RegisterHotKey(nint window, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] private static extern bool UnregisterHotKey(nint window, int id);
}
