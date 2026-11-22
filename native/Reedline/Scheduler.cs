using System.Diagnostics;

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
            try { action(); } catch (Exception e) { transport.Fail(e.Message); }
            wake.Set();
        }
    }
    private void Loop()
    {
        while (true)
        {
            int wait;
            lock (gate)
            {
                if (quitting) return;
                transport.Tick(Now);
                wait = transport.NeedsTicks ? 4 : Timeout.Infinite;
            }
            wake.WaitOne(wait);
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
}
