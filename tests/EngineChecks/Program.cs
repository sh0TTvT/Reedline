using Reedline;

internal sealed class Receiver : IInstrument
{
    public nint Window = 42;
    public int FailDown;
    public List<(int Key, bool Down)> Events = [];
    public nint FindForegroundGame() => Window;
    public bool StillForeground(nint target) => target == Window;
    public void Change(int key, bool down)
    {
        if (down && key == FailDown) throw new Exception("failed delivery");
        Events.Add((key, down));
    }
}
internal static class Program
{
    private static readonly ScorePlan Plan = new("test", [new(0,250,90,5), new(250,100,88,0), new(500,400,67,0)], 1100, 1, 1);
    private static void Check(bool ok, string what) { if (!ok) throw new Exception(what); Console.WriteLine("PASS " + what); }
    private static void Main()
    {
        var receiver = new Receiver(); var player = new Transport(receiver);
        player.Prepare(Plan,0); player.Toggle(0); player.Tick(999);
        Check(receiver.Events.Count == 0 && player.State(999).Remaining == 1, "countdown sends no input");
        player.Tick(1000); player.Tick(1018);
        Check(receiver.Events.SequenceEqual([(-1,true),(-4,true),(90,true)]), "mouse modifiers settle before key down");
        player.Toggle(1100);
        Check(player.State(1100).Phase == "paused" && receiver.Events.TakeLast(3).SequenceEqual([(90,false),(-4,false),(-1,false)]), "pause releases in reverse order");
        player.Tick(9000); Check(player.State(9000).Position == 100, "paused clock does not drift");
        player.Toggle(9000); player.Tick(10000); player.Tick(10020);
        Check(player.State(10020).Position == 120 && receiver.Events[^1] == (90,true), "resume from inside a sustained note");
        receiver.Window = 7; player.Tick(10040);
        Check(player.State(10040).Phase == "error" && receiver.Events[^1] == (-1,false), "foreground loss releases everything");
        receiver.Window = 0; receiver.Events.Clear(); player.Prepare(Plan,0); player.Toggle(0); player.Tick(1000);
        Check(player.State(1000).Phase == "error" && receiver.Events.Count == 0, "unrecognized foreground receives no events");
        receiver.Window = 42; player.Prepare(Plan,0); player.Toggle(0); player.Tick(1000); player.Stop();
        Check(receiver.Events.SequenceEqual([(-1,true),(-4,true),(-4,false),(-1,false)]) && player.State(1020).Position == 0, "stop during modifier lead-in");
        receiver.Events.Clear(); receiver.FailDown = 90; player.Prepare(Plan,0); player.Toggle(0); player.Tick(1000); player.Tick(1020);
        Check(player.State(1020).Phase == "error" && receiver.Events[^1] == (-1,false), "partial input failure unwinds held buttons");
        receiver.FailDown = 0; receiver.Events.Clear(); player.Prepare(Plan with { Rate = 2 }, 500); player.Toggle(0); player.Tick(1000); player.Tick(1200);
        Check(player.State(1200).Position == 900 && receiver.Events.SequenceEqual([(67,true),(67,false)]), "seek and double speed preserve score time");
        player.Tick(1300); Check(player.State(1300).Phase == "finished", "trailing rests finish on time");
        player.Toggle(2000); player.Stop(); player.Tick(4000);
        Check(player.State(4000).Phase == "stopped", "cancelled countdown cannot restart");
        player.Prepare(Plan,0); player.Toggle(0); player.Tick(1000); player.Tick(1355);
        Check(player.State(1355).Missed >= 1 && receiver.Events[^1] == (-1,false), "late ticks skip stale notes");
        player.Stop();
        bool rejected = false;
        try { player.Prepare(Plan with { Notes = [new(0,250,90,0),new(20,200,88,0)] },0); }
        catch (ArgumentException) { rejected = true; }
        Check(rejected, "overlapping native events rejected");
    }
}
