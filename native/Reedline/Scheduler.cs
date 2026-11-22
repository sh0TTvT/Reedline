using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace Reedline;

internal sealed class Scheduler : IDisposable
{
    private readonly Transport transport;
    private readonly Thread thread;
    private readonly object gate = new();
    private readonly AutoResetEvent wake = new(false);
    private readonly Stopwatch clock = Stopwatch.StartNew();
    private bool quitting;
    internal Scheduler(IInstrument instrument)
    {
        transport = new(instrument);
        thread = new Thread(Loop) { IsBackground = true, Name = "Reedline music clock" };
        thread.Start();
    }
    private double Now => clock.Elapsed.TotalMilliseconds;
    internal PlayerState State { get { lock (gate) return transport.State(Now); } }
    internal void Prepare(ScorePlan plan, double start) => Command(() => transport.Prepare(plan, start));
    internal void Seek(double at) => Command(() => transport.Seek(at));
    internal void Toggle() => Command(() => transport.Toggle(Now));
    internal void Stop() => Command(transport.Stop);
    private void Command(Action action)
    {
        lock (gate)
        {
            if (quitting) return;
            try { action(); } catch (Exception e) { transport.Fail(e.Message); }
            wake.Set();
        }
    }
    private void Loop()
    {
        using var timer = new MusicTimer();
        WaitHandle[] waits = [wake, timer];
        while (true)
        {
            int wait;
            lock (gate)
            {
                if (quitting) return;
                transport.Tick(Now);
                wait = transport.NeedsTicks ? 4 : Timeout.Infinite;
            }
            if (wait > 0 && timer.Arm(wait)) WaitHandle.WaitAny(waits);
            else wake.WaitOne(wait);
        }
    }
    public void Dispose()
    {
        lock (gate)
        {
            try { transport.Stop(); } catch (Exception e) { transport.Fail(e.Message); }
            quitting = true;
            wake.Set();
        }
        thread.Join();
        wake.Dispose();
    }

    // A one-shot high-resolution wait keeps notes on time while the window is hidden.
    // The separate wake event interrupts the wait for a hotkey or shutdown.
    private sealed class MusicTimer : WaitHandle
    {
        internal MusicTimer() => SafeWaitHandle = CreateWaitableTimerExW(0, 0, 2, 0x100002);
        internal bool Arm(int milliseconds)
        {
            if (SafeWaitHandle.IsInvalid) return false;
            long relativeDue = -10000L * milliseconds;
            return SetWaitableTimer(SafeWaitHandle, ref relativeDue, 0, 0, 0, false);
        }
        [DllImport("kernel32.dll")] private static extern SafeWaitHandle CreateWaitableTimerExW(nint attributes, nint name, uint flags, uint access);
        [DllImport("kernel32.dll")] private static extern bool SetWaitableTimer(SafeWaitHandle timer, ref long due, int period, nint callback, nint argument, bool resume);
    }
}
