namespace Reedline;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        using var instance = new Mutex(true, @"Local\Reedline-1-Desktop", out bool first);
        if (!first)
        {
            MessageBox.Show("Reedline 已在运行。双击任务栏通知区域中的绿色图标即可打开。", "Reedline");
            return;
        }
        Application.Run(new MainWindow());
    }
}
