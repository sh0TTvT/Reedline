namespace Reedline;

internal static class Program
{
    internal static void StartupTrace(string message)
    {
        // Opt-in startup diagnostics for machines where the WebView never reaches its first frame.
        if (Environment.GetEnvironmentVariable("REEDLINE_STARTUP_TRACE") != "1") return;
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Reedline");
        try { Directory.CreateDirectory(dir); File.AppendAllText(Path.Combine(dir, "startup-trace.log"), DateTimeOffset.Now.ToString("O") + " " + message + Environment.NewLine); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }
    [STAThread]
    private static void Main()
    {
        StartupTrace("Starting desktop host");
        ApplicationConfiguration.Initialize();
        using var instance = new Mutex(true, @"Local\Reedline-1-Desktop", out bool first);
        if (!first)
        {
            MessageBox.Show("Reedline 已在运行。双击任务栏通知区域中的绿色图标即可打开。", "Reedline");
            return;
        }
        using var window = new MainWindow();
        StartupTrace("Window constructed");
        Application.Run(window);
    }
}
