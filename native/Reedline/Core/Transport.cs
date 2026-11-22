namespace Reedline;

public sealed record Stroke(double At, double Length, int Key, int Mods);
public sealed record ScorePlan(string Title, Stroke[] Notes, double Duration, double Rate, int Countdown);
public sealed record PlayerState(string Phase, double Position, int Remaining, string Message, int Missed);

public interface IInstrument
{
    nint FindForegroundGame();
    bool StillForeground(nint target);
    void Change(int control, bool down);
}

// All times are in milliseconds. The owner serializes commands and supplies a monotonic clock.
public sealed class Transport(IInstrument input)
{
    private ScorePlan? plan;
    private string phase = "idle", message = "";
    private double position, anchor, basePosition, countdownEnd, keyReady;
    private int index, stage, missed;
    private nint target;
    private readonly List<int> held = [];
    public bool Running => phase is "countdown" or "playing";
    public bool Active => Running || phase == "paused";
    public bool NeedsTicks => Running || held.Count > 0;

    public void Prepare(ScorePlan candidate, double start)
    {
        if (Active) return;
        if (candidate.Notes is not { Length: > 0 and <= 50000 } ||
            !double.IsFinite(candidate.Duration) || candidate.Duration is <= 0 or > 3600000 ||
            !double.IsFinite(candidate.Rate) || candidate.Rate is < 0.5 or > 2 ||
            candidate.Countdown is < 1 or > 10 || !double.IsFinite(start))
            throw new ArgumentException("曲谱参数超出范围。");
        double lastEnd = 0;
        foreach (var n in candidate.Notes)
        {
            if (!double.IsFinite(n.At) || !double.IsFinite(n.Length) || n.At < 0 ||
                n.At < lastEnd - .01 || n.Length <= 0 || n.At + n.Length > candidate.Duration + .01 ||
                n.Key is not (>= 65 and <= 90 or >= 48 and <= 57 or 186 or 188 or 190 or 191) ||
                n.Mods is < 0 or > 6)
                throw new ArgumentException("曲谱包含无效音符或指法。");
            lastEnd = n.At + n.Length;
        }
        plan = candidate;
        position = Math.Clamp(start, 0, candidate.Duration);
        phase = "ready"; message = ""; missed = 0;
    }

    public void Seek(double at)
    {
        if (!Active && plan != null && double.IsFinite(at)) position = Math.Clamp(at, 0, plan.Duration);
    }

    public void Toggle(double now)
    {
        if (Running)
        {
            if (phase == "playing") position = CurrentPosition(now);
            Release();
            phase = "paused"; message = "";
            return;
        }
        if (plan == null) { Fail("请先在曲库中选一首歌曲。"); return; }
        if (position >= plan.Duration) position = 0;
        if (phase != "paused") missed = 0;
        Release();
        countdownEnd = now + plan.Countdown * 1000;
        phase = "countdown"; message = "";
    }

    public void Stop()
    {
        Release();
        phase = "stopped"; message = ""; position = 0; missed = 0;
    }

    public void Fail(string reason)
    {
        phase = "error"; message = reason;
        try { Release(); } catch (Exception e) { message += " " + e.Message; }
    }

    private double CurrentPosition(double now) => Math.Min(plan!.Duration, basePosition + (now - anchor) * plan.Rate);

    public PlayerState State(double now) => new(phase, phase == "playing" ? CurrentPosition(now) : position,
        phase == "countdown" ? Math.Max(0, (int)Math.Ceiling((countdownEnd - now) / 1000)) : 0, message, missed);

    private void Down(int control) { input.Change(control, true); held.Add(control); }

    private void Release()
    {
        stage = 0;
        Exception? problem = null;
        for (int i = held.Count - 1; i >= 0; i--)
        {
            try { input.Change(held[i], false); held.RemoveAt(i); }
            catch (Exception e) { problem = e; }
        }
        if (problem != null) throw problem;
    }

    public void Tick(double now)
    {
        try { Advance(now); }
        catch (Exception e) { Fail(e.Message); }
    }

    private void Advance(double now)
    {
        if (!Running) { if (held.Count > 0) Release(); return; }
        var p = plan!;
        if (phase == "countdown")
        {
            if (now < countdownEnd) return;
            target = input.FindForegroundGame();
            if (target == 0) { Fail("未找到前台的三角洲游戏窗口。切回游戏并打开口琴，再按 F6。"); return; }
            anchor = now; basePosition = position;
            index = Array.FindIndex(p.Notes, n => n.At + n.Length > position);
            if (index < 0) index = p.Notes.Length;
            stage = 0; phase = "playing";
        }
        position = CurrentPosition(now);
        if (!input.StillForeground(target)) { Fail("游戏已失去焦点，演奏已停止。切回游戏后按 F6 可从此处继续。"); return; }
        if (position >= p.Duration) { Release(); phase = "finished"; return; }
        while (index < p.Notes.Length)
        {
            var n = p.Notes[index];
            if (position < n.At) return;
            var end = n.At + n.Length;
            if (index + 1 < p.Notes.Length)
                end = Math.Min(end, p.Notes[index + 1].At - Math.Min(14 * p.Rate, n.Length * .18));
            if (position >= end)
            {
                if (stage != 2) missed++;
                Release(); index++; continue;
            }
            if (stage == 0)
            {
                foreach (int button in MouseFlags) if ((n.Mods & button) != 0) Down(-button);
                keyReady = now + (n.Mods == 0 ? 0 : Math.Min(18, (end - position) / p.Rate * .35));
                stage = 1;
            }
            if (stage == 1 && now >= keyReady)
            {
                if (!input.StillForeground(target)) { Fail("游戏已失去焦点，演奏已停止。"); return; }
                Down(n.Key); stage = 2;
            }
            return;
        }
    }
    private static readonly int[] MouseFlags = [1, 2, 4];
}
