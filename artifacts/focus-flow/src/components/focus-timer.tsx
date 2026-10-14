import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Pause, Play, Plus, RotateCcw, Sparkles } from 'lucide-react';
import { dateKey, useData } from '@/lib/store';

type Mode = 'focus' | 'stopwatch' | 'break';
type Ambient = 'rain' | 'float' | 'streak' | 'dust';

interface EnvTheme { from: string; to: string; glow: string; ambient: Ambient }

// Each study environment tints the whole stage and picks its own ambient motion.
const ENV_THEMES: Record<string, EnvTheme> = {
  'rain on glass': { from: '#10222e', to: '#27495a', glow: '#9dbbc5', ambient: 'rain' },
  'library hush': { from: '#231b10', to: '#4a3a22', glow: '#e0c48c', ambient: 'dust' },
  'forest morning': { from: '#0f2118', to: '#274a35', glow: '#9cc9a6', ambient: 'float' },
  'night train': { from: '#0d1024', to: '#2b2f5c', glow: '#8f98dd', ambient: 'streak' },
  'coffee shop': { from: '#25150e', to: '#5a3626', glow: '#e3a57f', ambient: 'dust' },
  'open window': { from: '#0f2630', to: '#2b5a5c', glow: '#b1d4c7', ambient: 'float' },
  'deep work': { from: '#1a0e12', to: '#4a2128', glow: '#e8806d', ambient: 'dust' },
};
const FALLBACK_THEME = ENV_THEMES['rain on glass'];

const MODES: Array<{ id: Mode; label: string; testId: string }> = [
  { id: 'focus', label: 'Pomodoro', testId: 'button-mode-pomodoro' },
  { id: 'stopwatch', label: 'Stopwatch', testId: 'button-mode-stopwatch' },
  { id: 'break', label: 'Break', testId: 'button-mode-break' },
];
const MODE_ACCENT: Record<Mode, { a: string; b: string }> = {
  focus: { a: '#ff9a82', b: '#ee715d' },
  stopwatch: { a: '#9fd3f2', b: '#5aa9d6' },
  break: { a: '#a8e6c4', b: '#5fc496' },
};
const FOCUS_PRESETS = [15, 25, 45, 60];
const BREAK_PRESETS = [5, 10, 15];

const SIZE = 340;
const CENTER = SIZE / 2;
const RADIUS = 142;
const CIRC = 2 * Math.PI * RADIUS;

function pad(n: number) { return String(n).padStart(2, '0'); }
function clock(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** One rolling digit: the old numeral slides up and out, the new one rises in. */
function Digit({ value, reduced }: { value: string; reduced: boolean }) {
  if (value === ':') return <span className="ft-colon">:</span>;
  return (
    <span className="ft-digit">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="ft-digit-inner"
          initial={reduced ? false : { y: '55%', opacity: 0, filter: 'blur(4px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={reduced ? { opacity: 0 } : { y: '-55%', opacity: 0, filter: 'blur(4px)' }}
          transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Ambience({ theme, running, reduced }: { theme: EnvTheme; running: boolean; reduced: boolean }) {
  // Stable pseudo-random layout so particles don't jump on every re-render.
  const particles = useMemo(() => Array.from({ length: theme.ambient === 'rain' ? 26 : theme.ambient === 'streak' ? 9 : 16 }, (_, i) => {
    const r = (n: number) => { const x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
    return { left: r(1) * 100, top: r(2) * 100, delay: -r(3) * 12, duration: 5 + r(4) * 9, size: 2 + r(5) * 5, drift: (r(6) - 0.5) * 60 };
  }), [theme.ambient]);

  return (
    <div className={`ft-ambience ${running ? 'is-running' : ''}`} aria-hidden="true">
      <AnimatePresence initial={false}>
        <motion.div
          key={`${theme.from}-${theme.to}`}
          className="ft-backdrop"
          style={{ background: `radial-gradient(120% 90% at 50% 0%, ${theme.to} 0%, ${theme.from} 70%)` }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeInOut' }}
        />
      </AnimatePresence>
      <span className="ft-orb ft-orb-a" style={{ background: theme.glow }} />
      <span className="ft-orb ft-orb-b" style={{ background: theme.glow }} />
      {!reduced && particles.map((p, i) => (
        <span
          key={`${theme.ambient}-${i}`}
          className={`ft-particle ft-${theme.ambient}`}
          style={{
            left: `${p.left}%`, top: theme.ambient === 'rain' ? '-8%' : `${p.top}%`,
            animationDelay: `${p.delay}s`, animationDuration: `${theme.ambient === 'rain' ? 1.4 + p.duration / 10 : theme.ambient === 'streak' ? 2.2 + p.duration / 5 : p.duration}s`,
            width: theme.ambient === 'rain' ? 1.5 : theme.ambient === 'streak' ? 60 + p.size * 18 : p.size,
            height: theme.ambient === 'rain' ? 26 + p.size * 6 : theme.ambient === 'streak' ? 1.5 : p.size,
            background: theme.glow,
            ['--drift' as string]: `${p.drift}px`,
          }}
        />
      ))}
      <div className="ft-vignette" />
    </div>
  );
}

function Burst({ color }: { color: string }) {
  const pieces = useMemo(() => Array.from({ length: 22 }, (_, i) => {
    const angle = (i / 22) * Math.PI * 2 + (i % 2) * 0.15;
    const dist = 110 + (i % 5) * 28;
    return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, size: 5 + (i % 4) * 2, delay: (i % 6) * 0.015, round: i % 3 !== 0 };
  }), []);
  return (
    <div className="ft-burst" aria-hidden="true">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          style={{ width: p.size, height: p.size, background: i % 4 === 0 ? '#fff6e8' : color, borderRadius: p.round ? '50%' : 2 }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
          animate={{ x: p.x, y: p.y + 24, opacity: 0, scale: 1, rotate: 180 }}
          transition={{ duration: 1.25, delay: p.delay, ease: [0.16, 0.84, 0.3, 1] }}
        />
      ))}
    </div>
  );
}

interface FocusStageProps {
  selectedMode: Mode;
  setSelectedMode: (mode: Mode) => void;
  selectedTask: string;
  setSelectedTask: (taskId: string) => void;
  onFinishSession: () => void;
}

export function FocusStage({ selectedMode, setSelectedMode, selectedTask, setSelectedTask, onFinishSession }: FocusStageProps) {
  const data = useData();
  const reduced = useReducedMotion() ?? false;
  const [, setTick] = useState(0);
  const [completed, setCompleted] = useState<{ mode: Mode; minutes: number; task?: string } | null>(null);
  const finishing = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!completed) return;
    const timeout = window.setTimeout(() => setCompleted(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [completed]);

  const timer = data.timer;
  const running = Boolean(timer?.startedAt);
  const mode: Mode = timer?.mode ?? selectedMode;
  const seconds = data.timerSeconds();
  const selectedFocusTask = data.tasks.find((task) => task.id === selectedTask && !task.done && ['Study', 'Work', 'Coding'].includes(task.category));
  const idleSeconds = mode === 'stopwatch' ? 0 : (mode === 'break' ? data.settings.breakMinutes : selectedFocusTask?.estimate ?? data.settings.pomodoro) * 60;
  const total = timer ? timer.duration : idleSeconds;
  const elapsed = timer ? seconds : 0;
  const remaining = mode === 'stopwatch' ? elapsed : Math.max(0, total - elapsed);
  const display = timer ? (mode === 'stopwatch' ? elapsed : remaining) : idleSeconds;
  const focusTask = data.tasks.find((t) => t.id === timer?.taskId && ['Study', 'Work', 'Coding'].includes(t.category));
  const theme = ENV_THEMES[data.settings.environment.toLowerCase()] ?? FALLBACK_THEME;
  const accent = MODE_ACCENT[mode];

  // Ring: countdowns drain, the stopwatch sweeps once a minute.
  const fraction = mode === 'stopwatch' ? (elapsed % 60) / 60 : total > 0 ? remaining / total : 1;
  const dashOffset = CIRC * (1 - fraction);
  const headAngle = fraction * 360;
  const ringTransition = timer && running && !reduced ? 'stroke-dashoffset 0.3s linear, transform 0.3s linear' : 'stroke-dashoffset 0.7s cubic-bezier(.2,.8,.2,1), transform 0.7s cubic-bezier(.2,.8,.2,1)';

  // Finish automatically when a countdown reaches zero.
  const reachedEnd = Boolean(timer && timer.mode !== 'stopwatch' && running && seconds >= timer.duration);
  useEffect(() => {
    if (!reachedEnd || !timer || finishing.current) return;
    finishing.current = true;
    const info = { mode: timer.mode, minutes: Math.round(seconds / 60), task: focusTask?.title };
    window.dispatchEvent(new Event('focusflow-timer-finished'));
    onFinishSession();
    setCompleted(info);
    if (data.settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(info.mode === 'break' ? 'Break over' : 'Focus session complete', { body: info.mode === 'break' ? 'Ready when you are.' : `${info.minutes} minutes done. Nice work.` });
    }
    window.setTimeout(() => { finishing.current = false; }, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reachedEnd]);

  // Show the countdown in the browser tab.
  useEffect(() => {
    if (!timer) return;
    const previous = document.title;
    document.title = `${clock(display)} · ${mode === 'break' ? 'Break' : 'Focus'}`;
    return () => { document.title = previous; };
  }, [display, mode, timer]);

  const start = () => {
    setCompleted(null);
    data.startTimer(selectedMode === 'break' ? undefined : selectedTask || undefined, selectedMode);
  };
  const toggle = () => {
    if (running) data.pauseTimer();
    else if (timer) data.startTimer(timer.taskId, timer.mode);
    else start();
  };
  const selectedSessionDiffers = Boolean(timer && !running && (selectedMode !== timer.mode || selectedTask !== (timer.taskId ?? '')));
  const startSelectedSession = () => {
    if (!timer || running || !selectedSessionDiffers) return;
    if (window.confirm('Start a new session with this task and mode? The paused timer progress will be discarded.')) {
      setCompleted(null);
      data.startTimer(selectedMode === 'break' ? undefined : selectedTask || undefined, selectedMode);
    }
  };
  const finishManually = () => {
    if (!timer || finishing.current) return;
    finishing.current = true;
    const info = { mode: timer.mode, minutes: Math.round(seconds / 60), task: focusTask?.title };
    onFinishSession();
    setCompleted(info);
    window.setTimeout(() => { finishing.current = false; }, 500);
  };

  // Space bar toggles the timer unless the user is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName) || el.isContentEditable)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const nextFrom = (finished: Mode) => {
    const next: Mode = finished === 'focus' ? 'break' : 'focus';
    setSelectedMode(next);
    setCompleted(null);
    data.startTimer(next === 'break' ? undefined : selectedTask || undefined, next);
  };

  const todaySessions = data.sessions.filter((s) => s.start.slice(0, 10) === dateKey());
  const todayMinutes = Math.round(todaySessions.reduce((sum, s) => sum + s.actualSeconds, 0) / 60);
  const cycle = todaySessions.length % 4;
  const presets = mode === 'break' ? BREAK_PRESETS : FOCUS_PRESETS;
  const activePreset = mode === 'break' ? data.settings.breakMinutes : data.settings.pomodoro;
  const setPreset = (m: number) => data.updateSettings(mode === 'break' ? { breakMinutes: m } : { pomodoro: m });

  const caption = running
    ? (mode === 'break' ? 'Breathe. Look somewhere far away.' : mode === 'stopwatch' ? 'Counting what you actually spend.' : 'Deep in it. Stay with one thing.')
    : timer ? 'Paused. Resume when you are ready.'
    : mode === 'break' ? 'A small reset is part of the work.' : mode === 'stopwatch' ? 'Open-ended. Stop when the work stops being useful.' : 'Pick a task, then press start.';
  const label = focusTask?.title ?? (mode === 'break' ? 'Rest & reset' : mode === 'stopwatch' ? 'Open-ended focus' : 'No task attached');
  const digits = clock(display).split('');

  return (
    <section className={`focus-stage mode-${mode} ${running ? 'is-running' : ''}`} style={{ ['--ft-a' as string]: accent.a, ['--ft-b' as string]: accent.b, ['--ft-glow' as string]: theme.glow }} data-testid="focus-stage">
      <Ambience theme={theme} running={running} reduced={reduced} />

      <div className="ft-content">
        <div className="ft-top">
          <div className="ft-modes" role="tablist" aria-label="Timer mode">
            {MODES.map((m) => (
              <button
                key={m.id} role="tab" aria-selected={mode === m.id}
                className={selectedMode === m.id ? 'active' : ''}
                disabled={running}
                onClick={() => setSelectedMode(m.id)}
                data-testid={m.testId}
              >
                  {selectedMode === m.id && <motion.span layoutId="ft-mode-pill" className="ft-mode-pill" transition={{ type: 'spring', stiffness: 460, damping: 36 }} />}
                <span>{m.label}</span>
              </button>
            ))}
          </div>
          <div className="ft-env-chip"><span className="ft-env-dot" />{data.settings.environment}</div>
        </div>

        <div className="ft-ring-wrap">
          <div className="ft-halo" />
          <svg className="ft-ring" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${clock(display)} ${mode === 'stopwatch' ? 'elapsed' : 'remaining'}`}>
            <defs>
              <linearGradient id="ft-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={accent.a} />
                <stop offset="100%" stopColor={accent.b} />
              </linearGradient>
            </defs>
            <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
              {Array.from({ length: 60 }, (_, i) => {
                const major = i % 5 === 0;
                const lit = mode === 'stopwatch' ? i / 60 <= fraction : i / 60 < fraction;
                return (
                  <line key={i} x1={CENTER + (major ? 158 : 161)} y1={CENTER} x2={CENTER + 167} y2={CENTER}
                    transform={`rotate(${i * 6} ${CENTER} ${CENTER})`}
                    className={`ft-tick ${major ? 'major' : ''} ${lit ? 'lit' : ''}`} />
                );
              })}
              <circle cx={CENTER} cy={CENTER} r={RADIUS} className="ft-track" />
              <circle cx={CENTER} cy={CENTER} r={RADIUS} className="ft-progress" stroke="url(#ft-grad)"
                strokeDasharray={CIRC} style={{ strokeDashoffset: dashOffset, transition: ringTransition }} />
              <g style={{ transform: `rotate(${headAngle}deg)`, transformOrigin: `${CENTER}px ${CENTER}px`, transition: ringTransition }}>
                <circle cx={CENTER + RADIUS} cy={CENTER} r={15} className="ft-head-glow" />
                <circle cx={CENTER + RADIUS} cy={CENTER} r={7.5} className="ft-head" />
              </g>
            </g>
          </svg>

          <div className="ft-readout">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${mode}-${label}`} className="ft-label"
                initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
              >
                {label}
              </motion.div>
            </AnimatePresence>
            <div className={`ft-time ${running ? 'running' : ''} ${timer && !running ? 'paused' : ''}`} data-testid="text-timer">
              {digits.map((d, i) => <Digit key={`${digits.length - i}`} value={d} reduced={reduced} />)}
            </div>
            <div className="ft-sub">{mode === 'stopwatch' ? 'elapsed' : timer ? `of ${Math.round(total / 60)} min` : 'ready'}</div>
          </div>
        </div>

        <div className="ft-controls">
          <div className="ft-side">
            <AnimatePresence>
              {timer && (
                <motion.button key="reset" className="ft-round small" aria-label="Reset timer" onClick={() => data.resetTimer()} data-testid="button-reset-timer"
                  initial={{ opacity: 0, scale: 0.5, x: 14 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.5, x: 14 }} whileTap={{ scale: 0.9 }}>
                  <RotateCcw size={17} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <motion.button className="ft-play" onClick={toggle} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.93 }}
            aria-label={running ? 'Pause timer' : timer ? 'Resume timer' : 'Start timer'}
            data-testid={running ? 'button-pause-timer' : timer ? 'button-resume-timer' : 'button-start-timer'}>
            <span className="ft-play-pulse" />
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={running ? 'pause' : 'play'} className="ft-play-icon"
                initial={{ opacity: 0, scale: 0.4, rotate: -40 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.4, rotate: 40 }} transition={{ duration: 0.18 }}>
                {running ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" style={{ marginLeft: 3 }} />}
              </motion.span>
            </AnimatePresence>
          </motion.button>

          <div className="ft-side">
            <AnimatePresence>
              {timer && (
                <motion.button key="finish" className="ft-round small" aria-label="Finish session" onClick={finishManually} data-testid="button-finish-timer"
                  initial={{ opacity: 0, scale: 0.5, x: -14 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.5, x: -14 }} whileTap={{ scale: 0.9 }}>
                  <Check size={18} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        <p className="ft-caption">{caption}</p>

        <div className="ft-options">
          <AnimatePresence mode="wait" initial={false}>
            {!timer ? (
              <motion.div key="setup" className="ft-setup" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.22 }}>
                {mode !== 'stopwatch' && (
                  <div className="ft-presets" role="group" aria-label="Duration">
                    {presets.map((m) => (
                      <button key={m} className={activePreset === m ? 'active' : ''} onClick={() => setPreset(m)} data-testid={`button-preset-${m}`}>
                        {activePreset === m && <motion.span layoutId="ft-preset-pill" className="ft-preset-pill" transition={{ type: 'spring', stiffness: 460, damping: 36 }} />}
                        <span>{m}m</span>
                      </button>
                    ))}
                  </div>
                )}
                {mode !== 'break' && (
                  <select className="ft-select" value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)} data-testid="select-focus-task" aria-label="Task to focus on">
                    <option value="">Open focus, no task attached</option>
                    {data.tasks.filter((t) => !t.done && ['Study', 'Work', 'Coding'].includes(t.category)).map((t) => <option key={t.id} value={t.id}>{t.title} · {t.estimate}m</option>)}
                  </select>
                )}

              </motion.div>
            ) : (
              <motion.div key="live" className="ft-live" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.22 }}>
                <span>Space to {running ? 'pause' : 'resume'}</span>
                <button className="ft-add-time" onClick={data.addFiveMinutes} aria-label="Add 5 minutes" title="Add 5 minutes" data-testid="button-add-five-minutes-fullscreen"><Plus size={14} /> Add 5 minutes</button>
                {selectedSessionDiffers && <button className="ft-start-selected" onClick={startSelectedSession} data-testid="button-start-selected-session"><Play size={13} /> Start selected session</button>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="ft-stats">
          <div className="ft-cycle" aria-label={`${cycle} of 4 sessions in this cycle`}>
            {[0, 1, 2, 3].map((i) => (
              <motion.span key={i} className={i < cycle ? 'done' : i === cycle && mode === 'focus' && running ? 'now' : ''}
                animate={{ scale: i < cycle ? [1, 1.35, 1] : 1 }} transition={{ duration: 0.5 }} />
            ))}
          </div>
          <span>{todaySessions.length} session{todaySessions.length === 1 ? '' : 's'} today</span>
          <span className="ft-sep" />
          <span>{todayMinutes} min focused</span>
        </div>
      </div>

      <AnimatePresence>
        {completed && (
          <motion.div className="ft-complete" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} data-testid="focus-complete">
            <Burst color={MODE_ACCENT[completed.mode].a} />
            <motion.div className="ft-complete-card" initial={{ opacity: 0, scale: 0.88, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ type: 'spring', stiffness: 320, damping: 24 }}>
              <motion.div className="ft-complete-badge" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.1 }}>
                {completed.mode === 'break' ? <Sparkles size={30} /> : <Check size={32} strokeWidth={3} />}
              </motion.div>
              <h3>{completed.mode === 'break' ? 'Break over' : 'Session complete'}</h3>
              <p>{completed.mode === 'break' ? 'Rested and ready. Shall we go again?' : `${completed.minutes < 1 ? 'Under a minute' : `${completed.minutes} minute${completed.minutes === 1 ? '' : 's'}`}${completed.task ? ` on ${completed.task}` : ''}. That counts.`}</p>
              <div className="ft-complete-actions">
                <button className="ft-cta" onClick={() => nextFrom(completed.mode)} data-testid="button-next-timer">{completed.mode === 'break' ? 'Start focus' : 'Take a break'}</button>
                <button className="ft-ghost" onClick={() => setCompleted(null)} data-testid="button-dismiss-complete">Not now</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
