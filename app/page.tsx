"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Task = {
  id: string;
  title: string;
  dateISO: string; // When the reminder should fire
  notifiedAt?: string; // ISO when notification was sent (prevents duplicates)
  completedAt?: string; // ISO when user marks done
  repeat?: "none" | "daily" | "weekdays";
};

const STORAGE_KEY = "smart-todo-tasks-v1";

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: Task[] = JSON.parse(raw);
    return parsed.map(t => ({ ...t }));
  } catch {
    return [];
  }
}

function saveTasks(tasks: Task[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function formatWhen(dateISO: string) {
  const d = new Date(dateISO);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const sign = diffMs >= 0 ? 1 : -1;
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  const rel = hours > 0 ? `${hours}h ${remMins}m` : `${mins}m`;
  const prefix = sign > 0 ? "in" : "";
  const suffix = sign < 0 ? "ago" : "";
  return `${d.toLocaleString()} (${prefix} ${rel} ${suffix})`;
}

export default function HomePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState<string>(() => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(Math.min(now.getMinutes() + 5, 59)).padStart(2, "0");
    return `${h}:${m}`;
  });
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekdays">("none");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const [soundReady, setSoundReady] = useState(false);
  const [notifReady, setNotifReady] = useState(false);

  // Initialize tasks from storage and request notification permission once.
  useEffect(() => {
    setTasks(loadTasks());

    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().finally(() => {
          setNotifReady(Notification.permission === "granted");
        });
      } else {
        setNotifReady(Notification.permission === "granted");
      }
    }
  }, []);

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  // Prepare sound with user gesture to comply with autoplay policies.
  const enableSound = async () => {
    try {
      if (!audioCtxRef.current) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        // Create a tiny silent buffer to "unlock" audio
        const buffer = ctx.createBuffer(1, 1, 22050);
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        node.connect(ctx.destination);
        node.start(0);
        audioCtxRef.current = ctx;
      }
      setSoundReady(true);
    } catch (e) {
      console.error(e);
    }
  };

  const triggerBeep = (durationMs = 1600) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + durationMs / 1000 + 0.05);
  };

  // Central scheduler: checks every 5 seconds for due tasks that aren't notified yet.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setTasks(prev => {
        const updated = prev.map(t => {
          const due = new Date(t.dateISO);
          const isDue = now.getTime() >= due.getTime();
          const notSent = !t.notifiedAt;

          if (isDue && notSent) {
            // Fire local notification
            if ("Notification" in window && Notification.permission === "granted") {
              try {
                const n = new Notification("To-Do Reminder", {
                  body: `${t.title} ? due now`,
                  silent: false,
                });
                n.onclick = () => window.focus();
              } catch {}
            }
            // Play a short audible beep if enabled
            if (soundReady) triggerBeep();

            const next: Task = { ...t, notifiedAt: new Date().toISOString() };

            // If repeating, schedule the next occurrence immediately after notifying
            if (t.repeat && t.repeat !== "none") {
              const nextDate = new Date(due);
              if (t.repeat === "daily") {
                nextDate.setDate(nextDate.getDate() + 1);
              } else if (t.repeat === "weekdays") {
                // Advance to next weekday (Mon-Fri)
                do {
                  nextDate.setDate(nextDate.getDate() + 1);
                } while ([0, 6].includes(nextDate.getDay()));
              }
              next.dateISO = nextDate.toISOString();
              next.notifiedAt = undefined; // reset for the next cycle
            }

            return next;
          }
          return t;
        });
        return updated;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [soundReady]);

  const addTask = () => {
    if (!title.trim()) return;
    const id = crypto.randomUUID();
    const dateISO = new Date(`${date}T${time}:00`).toISOString();
    setTasks(prev => [{ id, title: title.trim(), dateISO, repeat }, ...prev]);
    setTitle("");
  };

  const markDone = (id: string) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, completedAt: new Date().toISOString() } : t)));
  };

  const removeTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime());
  }, [tasks]);

  const pendingCount = tasks.filter(t => !t.completedAt).length;

  return (
    <div className="container">
      <div className="header">
        <h1>Smart Daily To-Do</h1>
        <div className="badge">{pendingCount} pending</div>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <div className="controls">
          <input
            aria-label="Task title"
            placeholder="What needs to be done?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            aria-label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            aria-label="Time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <select aria-label="Repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as any)}>
            <option value="none">No repeat</option>
            <option value="daily">Daily</option>
            <option value="weekdays">Weekdays</option>
          </select>
          <button className="primary" onClick={addTask}>Add</button>
        </div>
        <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="success" onClick={enableSound} disabled={soundReady}>
            {soundReady ? "Sound enabled" : "Enable sound"}
          </button>
          <button className="ghost" onClick={() => {
            if ("Notification" in window) {
              if (Notification.permission !== "granted") {
                Notification.requestPermission().then(() => setNotifReady(Notification.permission === "granted"));
              }
            }
          }}>
            {notifReady ? "Notifications on" : "Enable notifications"}
          </button>
        </div>
        <div className="footer">Reminders fire even if minimized, while the page is open.</div>
      </div>

      <div className="list">
        {sorted.map(t => (
          <div className="item" key={t.id}>
            <div>
              <div className="title">{t.title}</div>
              <div className="meta">{formatWhen(t.dateISO)} {t.repeat && t.repeat !== 'none' ? <span className="badge" style={{ marginLeft: 8 }}>{t.repeat}</span> : null}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="success" onClick={() => markDone(t.id)} disabled={!!t.completedAt}>{t.completedAt ? 'Done' : 'Mark done'}</button>
              <button className="danger" onClick={() => removeTask(t.id)}>Delete</button>
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="card">No tasks yet ? add your first reminder above.</div>
        )}
      </div>
    </div>
  );
}
