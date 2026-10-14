import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { shadcn } from '@clerk/themes';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { createPortal } from 'react-dom';
import { DataProvider, categories, dateKey, formatDate, initials, useData, type Activity, type AppData, type Category, type Exercise, type MusicTrack, type Priority, type Project, type ProjectStatus, type Task, type YouTubeTrack, type WorkoutPlanExercise, type WorkoutProjectExercise } from '@/lib/store';
import { getStudyEnvironment, studyEnvironments } from '@/lib/ambient-audio';
import { StickyWorkspace } from '@/components/sticky-workspace';
import { FocusStage } from '@/components/focus-timer';
import { Blocks, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, Clock3, Droplets, Dumbbell, ExternalLink, Flame, FolderKanban, FolderPlus, GlassWater, GripVertical, History, LayoutDashboard, ListChecks, Maximize2, Minus, Moon, MoreHorizontal, Music2, Pause, Pencil, Play, Plus, RotateCcw, Search, Settings, Sparkles, StickyNote as StickyNoteIcon, Sun, Target, Trash2, TrendingUp, Trophy, Upload, Volume2, VolumeX, X, Zap, ArrowRight, Activity as ActivityIcon, SlidersHorizontal, Filter, Command } from 'lucide-react';
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dateFromKey = (key: string) => new Date(`${key}T12:00:00`);
const workoutTitlePattern = /\b(gym workout|workout session|exercise session|training session)\b/i;
const isWorkoutTitle = (title: string) => /^(gym|workout|exercise|training)$/i.test(title.trim()) || workoutTitlePattern.test(title);
const isWorkoutTask = (task: Task) => task.category === 'Workout' || isWorkoutTitle(task.title);
const isFocusRoomTask = (task: Task) => task.category === 'Study' || task.category === 'Work' || task.category === 'Coding';
interface WorkoutScheduleView {
  id: string; title: string; date: string; start: string; duration: number; description: string;
  priority: Priority; completed: boolean; planConfigured: boolean; activity?: Activity; task?: Task;
}
function workoutSchedules(data: AppData): WorkoutScheduleView[] {
  const sessions: WorkoutScheduleView[] = [];
  const linkedTaskIds = new Set<string>();
  for (const activity of data.activities) {
    const task = activity.taskId ? data.tasks.find((item) => item.id === activity.taskId) : undefined;
    if (activity.taskId) linkedTaskIds.add(activity.taskId);
    if (activity.category !== 'Workout' && !(task && isWorkoutTask(task)) && !isWorkoutTitle(activity.title)) continue;
    const planId = task && isWorkoutTask(task) ? task.id : activity.id;
    sessions.push({ id: planId, title: activity.title, date: activity.date, start: activity.start, duration: activity.duration, description: task?.description ?? '', priority: task?.priority ?? 'medium', completed: Boolean(activity.completed || task?.done), planConfigured: Boolean(data.workoutPlans[planId]?.length), activity, task });
  }
  for (const task of data.tasks) {
    if (!isWorkoutTask(task) || linkedTaskIds.has(task.id)) continue;
    const date = task.deadline || dateKey();
    sessions.push({ id: task.id, title: task.title, date, start: task.scheduledTime ?? '', duration: task.estimate, description: task.description, priority: task.priority, completed: task.done, planConfigured: Boolean(data.workoutPlans[task.id]?.length), task });
  }
  return sessions.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}
function timeUntilWorkout(session: WorkoutScheduleView) {
  if (!session.start) return '';
  const startsAt = new Date(`${session.date}T${session.start}:00`).getTime();
  const minutes = Math.floor((startsAt - Date.now()) / 60000);
  if (minutes < 0) return '';
  if (minutes < 60) return `in ${minutes}m`;
  if (minutes < 1440) return `in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `in ${Math.floor(minutes / 1440)}d`;
}
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
type YouTubePlayerApi = {
  destroy: () => void;
  cueVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  getPlayerState: () => number;
  setVolume: (volume: number) => void;
  loadVideoById: (videoId: string) => void;
};
declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          height?: string;
          width?: string;
          videoId?: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YouTubePlayerApi }) => void;
            onStateChange?: (event: {
              data: number;
              target: YouTubePlayerApi;
            }) => void;
            onError?: (event: unknown) => void;
          };
        }
      ) => YouTubePlayerApi;
    };

    onYouTubeIframeAPIReady?: () => void;
  }
}



if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in the environment.');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#ee715d',
    colorForeground: '#172433',
    colorMutedForeground: '#536273',
    colorDanger: '#bd5347',
    colorBackground: '#fffdf9',
    colorInput: '#fffdf9',
    colorInputForeground: '#172433',
    colorNeutral: '#e5e2db',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdf9] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#172433] font-semibold',
    headerSubtitle: 'text-[#536273]',
    socialButtonsBlockButtonText: 'text-[#172433]',
    formFieldLabel: 'text-[#172433]',
    footerActionLink: 'text-[#bd5347] font-semibold',
    footerActionText: 'text-[#536273]',
    dividerText: 'text-[#536273]',
    identityPreviewEditButton: 'text-[#bd5347]',
    formFieldSuccessText: 'text-[#326550]',
    alertText: 'text-[#bd5347]',
    logoBox: 'mb-2',
    logoImage: 'max-h-10',
    socialButtonsBlockButton: 'border-[#e5e2db] bg-[#fffdf9]',
    formButtonPrimary: 'bg-[#ee715d] hover:bg-[#bd5347] text-[#fffaf4]',
    formFieldInput: 'border-[#e5e2db] bg-[#fffdf9] text-[#172433]',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[#e5e2db]',
    alert: 'border-[#e9beb8] bg-[#fff5f2]',
    otpCodeFieldInput: 'border-[#e5e2db] bg-[#fffdf9] text-[#172433]',
    formFieldRow: 'mb-4',
    main: 'bg-transparent',
  },
};

const nav = [
  { href: '/', label: 'Today', icon: LayoutDashboard },
  { href: '/inbox', label: 'Task inbox', icon: ListChecks },
  { href: '/buildup', label: 'Buildup', icon: Blocks },
  { href: '/schedule', label: 'Schedule', icon: CalendarDays },
  { href: '/study', label: 'Focus room', icon: Target },
  { href: '/workout', label: 'Workout', icon: Zap },
  { href: '/work', label: 'Work projects', icon: FolderKanban },
  { href: '/analytics', label: 'Analytics', icon: Trophy },
  { href: '/history', label: 'History', icon: History },
];

function cx(...names: Array<string | false | undefined>) { return names.filter(Boolean).join(' '); }
function prettyTime(seconds: number) { const m = Math.floor(seconds / 60); const s = seconds % 60; return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }
function categoryClass(category: string) { return category.toLowerCase(); }
function sameDay(value: string, date: string) { return value?.slice(0, 10) === date; }
function dateLabel(value: string) { return new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
function clockMinutes(value: string) { const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes; }
function findOverlaps(activities: Activity[], date: string, start: string, duration: number, excludeId?: string) {
  const nextStart = clockMinutes(start);
  return activities.filter((item) => {
    const existingStart = clockMinutes(item.start);
    return item.date === date && item.id !== excludeId && nextStart < existingStart + item.duration && existingStart < nextStart + duration;
  });
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkRoutes />
    </WouterRouter>
  );
}

function ClerkTest() {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) {
    return <div style={{ padding: 40 }}>Loading Clerk...</div>;
  }

  if (!isSignedIn) {
    return (
      <div style={{ padding: 40 }}>
        <h1>Do-Fo-Done</h1>
        <SignIn />
      </div>
    );
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Clerk works 🎉</h1>
      <p>Signed in as {user?.primaryEmailAddress?.emailAddress}</p>
    </div>
  );
}
function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}

    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to return to your flow' } },
      signUp: { start: { title: 'Create your Do-Fo-Done account', subtitle: 'Keep your days in one private space' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <AppRoutes />
  </ClerkProvider>;
}

function AppRoutes() {
  const [location] = useLocation();
  const { isLoaded, isSignedIn, user } = useUser();

  if (location.startsWith('/sign-in')) return <SignInPage />;
  if (location.startsWith('/sign-up')) return <SignUpPage />;
  if (!isLoaded) return <AuthLoading />;
  if (!isSignedIn || !user) return location === '/' ? <LandingPage /> : <Redirect to="/" />;

  const displayName = user.firstName || user.username || user.emailAddresses[0]?.emailAddress?.split('@')[0] || 'Your name';
  return <DataProvider userId={user.id} initialName={displayName}><Shell /><MusicDock /><TimerSoundEffects /></DataProvider>;
}

function TimerSoundEffects() {
  const data = useData();
  const latestData = useRef(data);
  const audioContext = useRef<AudioContext | null>(null);
  const timerKey = useRef('');
  const lastElapsed = useRef(-1);
  const finishedTimerKey = useRef('');
  latestData.current = data;

  useEffect(() => {
    const primeAudio = () => {
      if (!audioContext.current && window.AudioContext) audioContext.current = new window.AudioContext();
      if (audioContext.current?.state === 'suspended') void audioContext.current.resume();
    };
    document.addEventListener('pointerdown', primeAudio);
    document.addEventListener('keydown', primeAudio);
    return () => {
      document.removeEventListener('pointerdown', primeAudio);
      document.removeEventListener('keydown', primeAudio);
      void audioContext.current?.close();
      audioContext.current = null;
    };
  }, []);

  useEffect(() => {
    const playTone = (frequency: number, at: number, duration: number, volume: number) => {
      const context = audioContext.current;
      if (!context || context.state === 'closed') return;
      if (context.state === 'suspended') void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.01);
    };
    const playTick = () => {
      const context = audioContext.current;
      if (context) playTone(740, context.currentTime, 0.045, 0.012);
    };
    const playFinished = () => {
      const context = audioContext.current;
      if (!context) return;
      const start = context.currentTime;
      [660, 830, 1040].forEach((frequency, index) => playTone(frequency, start + index * 0.14, 0.2, 0.055));
    };
    const playFinishedOnce = () => {
      const { timer, settings } = latestData.current;
      if (!timer) return;
      const key = `${timer.startIso ?? ''}:${timer.mode}:${timer.taskId ?? ''}:${timer.duration}`;
      if (finishedTimerKey.current === key) return;
      finishedTimerKey.current = key;
      if (settings.timerSounds) playFinished();
    };
    window.addEventListener('focusflow-timer-finished', playFinishedOnce);

    const interval = window.setInterval(() => {
      const { timer, settings } = latestData.current;
      if (!timer?.startedAt) {
        if (!timer) {
          timerKey.current = '';
          lastElapsed.current = -1;
        }
        return;
      }

      const key = `${timer.startIso ?? ''}:${timer.mode}:${timer.taskId ?? ''}:${timer.duration}`;
      const elapsed = timer.elapsedBefore + Math.floor((Date.now() - timer.startedAt) / 1000);
      if (key !== timerKey.current) {
        timerKey.current = key;
        lastElapsed.current = elapsed;
        finishedTimerKey.current = '';
        return;
      }
      if (elapsed <= lastElapsed.current) return;
      lastElapsed.current = elapsed;

      if (timer.mode === 'stopwatch') return;
      if (elapsed >= timer.duration) {
        playFinishedOnce();
        return;
      }
      if (settings.timerSounds) playTick();
    }, 180);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focusflow-timer-finished', playFinishedOnce);
    };
  }, []);

  return null;
}

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

function AuthLoading() {
  return <div className="auth-page"><div className="auth-loading"><span className="brand-mark"><Check aria-hidden="true" /></span><p>Preparing your private space…</p></div></div>;
}

function SignInPage() {
  return <div className="auth-page"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}

function SignUpPage() {
  return <div className="auth-page"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function LandingPage() {
  return <div className="landing-page"><div className="landing-orbit landing-orbit-one" /><div className="landing-orbit landing-orbit-two" /><header className="landing-header"><Link href="/" className="brand"><span className="brand-mark"><Check aria-hidden="true" /></span><span className="brand-name"><span>Do</span><i>-</i><span>Fo</span><i>-</i><span>Done</span></span></Link><div className="landing-actions"><Link href="/sign-in" className="soft-button">Sign in</Link><Link href="/sign-up" className="primary-button">Create account</Link></div></header><main className="landing-main"><div className="landing-copy"><div className="eyebrow">A calmer way to get things done</div><h1>Give your attention somewhere to land.</h1><p>Do-Fo-Done connects the little pieces of a productive day: capture a task, shape the time, get into focus, and see the progress you actually made.</p><div className="landing-actions"><Link href="/sign-up" className="primary-button">Start your flow <ArrowRightIcon /></Link><Link href="/sign-in" className="landing-text-link">Already have an account? Sign in</Link></div></div><div className="landing-preview"><div className="preview-topline"><span className="tag">Today</span><span className="tiny">Your private workspace</span></div><div className="preview-heading">A little room to move.</div><div className="preview-progress"><span /><span /><span /><span /></div><div className="preview-task"><span className="preview-dot coral-dot" /><div><strong>Outline the project brief</strong><small>Study · 25 minutes</small></div><Check size={16} /></div><div className="preview-task"><span className="preview-dot mint-dot" /><div><strong>Walk between meetings</strong><small>Personal · 20 minutes</small></div><span className="preview-time">3:30 PM</span></div><div className="preview-note">Write <span>→</span> Schedule <span>→</span> Focus <span>→</span> Complete</div></div></main><footer className="landing-footer"><span>Private by default</span><span>Works offline in your browser</span><span>Built for real days</span></footer></div>;
}

function ArrowRightIcon() {
  return <span aria-hidden="true">→</span>;
}
function calculateStreak(workoutCalendar: Record<string, { type: 'workout' | 'rest'; completed?: boolean } | undefined>, todayKey = localDateKey()) {
  let cursor = dateFromKey(todayKey);
  let total = 0;
  if (!workoutCalendar[todayKey]) cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 3660; i++) {
    const entry = workoutCalendar[localDateKey(cursor)];
    if (entry?.type === 'rest') {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    if (entry?.type === 'workout' && entry.completed) {
      total++;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    break;
  }
  return total;
}

function WorkoutCalendarWidget() {
  const data = useData();
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const todayKey = localDateKey();
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(month);
  const start = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const offset = (start.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const grid = Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => i - offset + 1);
  const weekStart = dateFromKey(todayKey); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => { const date = new Date(weekStart); date.setDate(date.getDate() + i); return localDateKey(date); });
  const currentWeek = week.filter((key) => data.workoutCalendar[key]);
  const workoutCount = (keys: string[]) => keys.filter((key) => data.workoutCalendar[key]?.type === 'workout').length;
  const restCount = (keys: string[]) => keys.filter((key) => data.workoutCalendar[key]?.type === 'rest').length;
  const completedCount = (keys: string[]) => keys.filter((key) => data.workoutCalendar[key]?.type === 'workout' && data.workoutCalendar[key]?.completed).length;
  const streak = calculateStreak(data.workoutCalendar, todayKey);
  const labelDate = (key: string) => new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(dateFromKey(key));
  const cell = (key: string, day: number, compact = false) => {
    const entry = data.workoutCalendar[key];
    const content = entry?.completed ? <Check size={compact ? 14 : 15} /> : entry?.type === 'workout' ? <Dumbbell size={compact ? 13 : 14} /> : entry?.type === 'rest' ? <Moon size={compact ? 13 : 14} /> : null;
    return <button key={key} className={cx('workout-calendar-day', entry?.type, entry?.completed && 'completed', key === todayKey && 'today', compact && 'compact', selected === key && 'selected')} onClick={() => setSelected(selected === key ? null : key)} aria-label={`${labelDate(key)}${entry ? `, ${entry.completed ? 'completed workout' : entry.type}` : ', unplanned'}`}>
      {!compact && <span className="workout-calendar-number">{day}</span>}
      {compact && <span className="workout-calendar-weekday">{new Intl.DateTimeFormat('en', { weekday: 'short' }).format(dateFromKey(key))}</span>}
      {content || (compact ? <span className="workout-calendar-empty">○</span> : null)}
      {compact && <span className="workout-calendar-weeknum">{dateFromKey(key).getDate()}</span>}
    </button>;
  };
  const monthKeys = Object.keys(data.workoutCalendar).filter((key) => key.startsWith(monthKey));
  return <section className="workout-calendar-widget" aria-label="Workout calendar">
    <div className="workout-calendar-head"><div className="workout-calendar-brand"><span className="workout-calendar-icon"><Dumbbell size={15} /></span><div><div className="eyebrow">Training calendar</div><strong>{streak} day{streak === 1 ? '' : 's'} streak <span>🔥</span></strong></div></div><div className="workout-calendar-controls"><button className="icon-button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={15} /></button><strong>{monthLabel}</strong><button className="icon-button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={15} /></button><button className="soft-button workout-expand" onClick={() => setExpanded(!expanded)}>{expanded ? 'Week view' : 'Month view'}</button></div></div>
    <div className="workout-calendar-week">{week.map((key) => cell(key, dateFromKey(key).getDate(), true))}</div>
    {expanded && <div className="workout-month-view"><div className="workout-calendar-grid">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name) => <div className="workout-calendar-weekday-label" key={name}>{name}</div>)}{grid.map((day, i) => day < 1 || day > count ? <span key={`blank-${i}`} /> : cell(`${monthKey}-${String(day).padStart(2, '0')}`, day))}</div></div>}
    <div className="workout-calendar-stats"><span><Dumbbell size={12} /> {workoutCount(currentWeek)} workouts</span><span><Moon size={12} /> {restCount(currentWeek)} rest</span><span><Check size={12} /> {completedCount(currentWeek)} completed</span><span className="workout-month-stat">This month: {workoutCount(monthKeys)} planned · {completedCount(monthKeys)} done</span></div>
    {selected && <div className="workout-day-menu"><div className="workout-day-menu-copy"><strong>{labelDate(selected)}</strong><span>{data.workoutCalendar[selected]?.completed ? 'Workout completed' : data.workoutCalendar[selected]?.type === 'workout' ? 'Workout planned' : data.workoutCalendar[selected]?.type === 'rest' ? 'Rest day' : 'No plan yet'}</span></div><div className="workout-day-actions"><button onClick={() => { data.setWorkoutDay(selected, 'workout'); }}>Workout Day</button><button onClick={() => data.setWorkoutDay(selected, 'rest')}>Rest Day</button><button onClick={() => data.clearWorkoutDay(selected)}>Clear</button>{data.workoutCalendar[selected]?.type === 'workout' && !data.workoutCalendar[selected]?.completed && <button className="workout-checkin" onClick={() => data.completeWorkoutDay(selected)}>✓ Check In</button>}</div></div>}
  </section>;
}


function Shell() {
  const [location] = useLocation();
  const data = useData();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileMoreButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMoreFirstLinkRef = useRef<HTMLAnchorElement>(null);

  const results = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return [
      ...data.tasks.filter((item) => item.title.toLowerCase().includes(query)).map((item) => ({ label: item.title, type: 'Task' as const, href: '/inbox', category: item.category })),
      ...data.activities.filter((item) => item.title.toLowerCase().includes(query)).map((item) => ({ label: item.title, type: 'Schedule' as const, href: '/schedule', category: item.category })),
      ...data.projects.filter((item) => item.name.toLowerCase().includes(query)).map((item) => ({ label: item.name, type: 'Project' as const, href: '/work', category: item.priority })),
    ].slice(0, 7);
  }, [data.tasks, data.activities, data.projects, search]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setMobileMoreOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    setMobileMoreOpen(false);
  }, [location]);

  useEffect(() => {
    if (!mobileMoreOpen || !window.matchMedia('(max-width: 700px)').matches) return;
    mobileMoreFirstLinkRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      mobileMoreButtonRef.current?.focus();
    };
  }, [mobileMoreOpen]);

  useEffect(() => {
    if (!data.settings.notifications || !('Notification' in window) || Notification.permission !== 'granted') return;
    const checkReminders = () => {
      const now = Date.now();
      data.tasks.filter((task) => task.reminder && !task.done).forEach((task) => {
        const reminderAt = new Date(task.reminder).getTime();
        const reminderKey = `focusflow-reminded-${task.id}-${task.reminder}`;
        if (reminderAt <= now && now - reminderAt < 120000 && !localStorage.getItem(reminderKey)) {
          new Notification(`Do-Fo-Done reminder: ${task.title}`, { body: task.description || 'A task is waiting in your flow.' });
          localStorage.setItem(reminderKey, '1');
        }
      });
    };
    checkReminders();
    const interval = window.setInterval(checkReminders, 30000);
    return () => window.clearInterval(interval);
  }, [data.settings.notifications, data.tasks]);

  const openTasksCount = data.tasks.filter((t) => !t.done).length;
  const todayActivitiesCount = data.activities.filter((a) => sameDay(a.date, localDateKey())).length;
  const workoutStreak = calculateStreak(data.workoutCalendar);

  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand" data-testid="link-brand"><span className="brand-mark"><Check aria-hidden="true" /></span><span className="brand-name"><span>Do</span><i>-</i><span>Fo</span><i>-</i><span>Done</span></span></Link>
      <div className="eyebrow">Your space</div>
      <nav className="nav-list">{nav.map(({ href, label, icon: Icon }) => {
        let badge: string | number | null = null;
        if (href === '/inbox' && openTasksCount > 0) badge = openTasksCount;
        else if (href === '/schedule' && todayActivitiesCount > 0) badge = todayActivitiesCount;
        else if (href === '/workout' && workoutStreak > 0) badge = `🔥 ${workoutStreak}`;
        return (
          <Link href={href} key={href} className={cx('nav-link', (location === href || (href === '/' && location === '/dashboard')) && 'active')} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`}>
            <Icon size={17} strokeWidth={1.8} />
            <span>{label}</span>
            {badge && <span className="nav-badge">{badge}</span>}
          </Link>
        );
      })}</nav>
      <div className="sidebar-spacer" />
      <Link href="/settings" className={cx('nav-link', location === '/settings' && 'active')} data-testid="link-settings"><Settings size={17} strokeWidth={1.8} /><span>Settings</span></Link>
      <Link href="/profile" className={cx('profile-mini', location === '/profile' && 'active')} data-testid="link-profile"><span className="avatar">{initials(data.settings.name)}</span><span><p>{data.settings.name}</p><span>Personal space</span></span></Link>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <Link href="/" className="mobile-brand" data-testid="link-mobile-brand"><span className="brand-mark"><Check aria-hidden="true" /></span><span className="brand-name"><span>Do</span><i>-</i><span>Fo</span><i>-</i><span>Done</span></span></Link>
        <div className="search" onFocus={() => setSearchOpen(true)} data-testid="search-global">
          <Search size={16} />
          <input
            ref={searchInputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tasks, schedule, projects..."
            data-testid="input-global-search"
          />
          {!search && <kbd className="search-kbd">⌘K</kbd>}
          <button className="icon-button" style={{ display: search ? 'inline-flex' : 'none', border: 0 }} onClick={() => setSearch('')} aria-label="Clear search" data-testid="button-clear-search"><X size={14} /></button>
          {searchOpen && search && (
            <div className="search-results-menu">
              {results.length ? results.map((result, index) => {
                const IconComponent = result.type === 'Task' ? CheckCircle2 : result.type === 'Schedule' ? CalendarDays : FolderKanban;
                return (
                  <Link key={`${result.type}-${index}`} href={result.href} onClick={() => { setSearchOpen(false); setSearch(''); }} className="search-result-item" data-testid={`search-result-${index}`}>
                    <span className="search-result-icon"><IconComponent size={14} /></span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.label}</span>
                    <span className="tag" style={{ fontSize: 10, padding: '2px 7px' }}>{result.type}</span>
                  </Link>
                );
              }) : (
                <div className="tiny" style={{ padding: 12, textAlign: 'center', color: 'var(--ink-soft)' }}>No matches found. Add it to your flow first.</div>
              )}
            </div>
          )}
        </div>
        <div className="top-actions">
          <button
            className="icon-button"
            onClick={() => data.updateSettings({ theme: data.settings.theme === 'dark' ? 'light' : 'dark' })}
            aria-label={`Switch to ${data.settings.theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${data.settings.theme === 'dark' ? 'light' : 'dark'} mode`}
            data-testid="button-top-theme-toggle"
          >
            {data.settings.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Link href="/settings" className="icon-button" aria-label="Settings" data-testid="button-top-settings"><Settings size={16} /></Link>
          <Link href="/profile" className="soft-button" data-testid="button-top-profile"><span className="avatar" style={{ width: 22, height: 22, fontSize: 9 }}>{initials(data.settings.name)}</span>{data.settings.name}</Link>
          <LogoutButton />
        </div>
      </header>
      <UpcomingWorkoutIndicator />
      <div onClick={() => searchOpen && setSearchOpen(false)}><Switch>
        <Route path="/" component={Dashboard} /><Route path="/dashboard" component={Dashboard} /><Route path="/inbox" component={Inbox} /><Route path="/buildup" component={Buildup} /><Route path="/schedule" component={Schedule} /><Route path="/study" component={Study} /><Route path="/workout" component={Workout} /><Route path="/work" component={Work} /><Route path="/analytics" component={Analytics} /><Route path="/history" component={HistoryPage} /><Route path="/profile" component={Profile} /><Route path="/settings" component={SettingsPage} /><Route component={NotFound} />
      </Switch></div>
    </main>
    {mobileMoreOpen && <>
      <button type="button" className="mobile-more-backdrop" onClick={() => setMobileMoreOpen(false)} aria-label="Close navigation menu" />
      <nav className="mobile-more-menu" aria-label="More pages">
        {nav.filter(({ href }) => !['/', '/inbox', '/schedule', '/study'].includes(href)).map(({ href, label, icon: Icon }, index) => <Link href={href} key={href} ref={index === 0 ? mobileMoreFirstLinkRef : undefined} className={location === href ? 'active' : ''} onClick={() => setMobileMoreOpen(false)}><Icon size={18} /><span>{label}</span></Link>)}
        <Link href="/settings" className={location === '/settings' ? 'active' : ''} onClick={() => setMobileMoreOpen(false)}><Settings size={18} /><span>Settings</span></Link>
        <Link href="/profile" className={location === '/profile' ? 'active' : ''} onClick={() => setMobileMoreOpen(false)}><span className="avatar">{initials(data.settings.name)}</span><span>Profile</span></Link>
        <div className="mobile-more-divider" />
        <LogoutButton />
      </nav>
    </>}
    <nav className="mobile-nav" aria-label="Main navigation">{nav.filter(({ href }) => ['/', '/inbox', '/schedule', '/study'].includes(href)).map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={location === href || (href === '/' && location === '/dashboard') ? 'active' : ''} data-testid={`mobile-link-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={18} /><span>{label === 'Task inbox' ? 'Inbox' : label === 'Focus room' ? 'Focus' : label}</span></Link>)}<button ref={mobileMoreButtonRef} type="button" className={mobileMoreOpen ? 'active' : ''} onClick={() => setMobileMoreOpen(!mobileMoreOpen)} aria-expanded={mobileMoreOpen} aria-haspopup="true" aria-label={mobileMoreOpen ? 'Close more navigation' : 'Open more navigation'}><MoreHorizontal size={18} /><span>More</span></button></nav>
  </div>;
}

function LogoutButton() {
  const { signOut } = useClerk();
  return <button type="button" className="soft-button logout-button" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">Sign out</button>;
}
function UpcomingWorkoutIndicator() {
  const data = useData();
  const next = workoutSchedules(data).find((item) => !item.completed && item.date >= localDateKey());
  if (!next) return null;
  const isToday = next.date === localDateKey();
  return <div style={{ margin: '12px 18px 0' }}>
    <Link href="/workout" className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', background: 'linear-gradient(135deg, color-mix(in srgb, var(--coral) 8%, var(--card)), var(--card))', borderColor: 'color-mix(in srgb, var(--coral) 30%, var(--border))' }} data-testid="upcoming-workout-indicator">
      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'color-mix(in srgb, var(--coral) 15%, transparent)', display: 'grid', placeItems: 'center', color: 'var(--coral)', flexShrink: 0 }}>
        <Dumbbell size={16} />
      </div>
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontSize: 13, display: 'block', color: 'var(--ink)' }}>{next.title}</strong>
        <span className="tiny" style={{ display: 'block', color: 'var(--ink-soft)' }}>{isToday ? '🔥 Scheduled for today' : `Upcoming · ${formatDate(next.date)}`}{next.start ? ` at ${next.start}` : ' · time flexible'} · {next.planConfigured ? 'Routine ready' : 'Plan routine'}</span>
      </span>
      <span className={cx('tag', next.completed ? 'mint' : isToday ? 'coral' : 'sand')} style={{ fontWeight: 700 }}>{next.completed ? 'Done' : isToday ? 'Train today' : 'Planned'}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>Open <ArrowRight size={13} /></span>
    </Link>
  </div>;
}

function MusicDock() {
  const data = useData();
  const [dockHost, setDockHost] = useState<HTMLElement | null>(null);

  const [musicOn, setMusicOn] = useState(
    () => localStorage.getItem('focusflow-music-on') !== 'false'
  );

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<YouTubeTrack | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dockExpanded, setDockExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');

  const playerRef = useRef<YouTubePlayerApi | null>(null);
  const playerElementRef = useRef<HTMLDivElement>(null);
  const apiReadyRef = useRef(false);
  const latestRef = useRef({ data, currentTrack, results, currentIndex });
  latestRef.current = { data, currentTrack, results, currentIndex };
  const inFocusFullscreen = dockHost?.classList.contains('focus-music-slot') ?? false;

  // --------------------------------------------------
  // Remember music ON/OFF
  // --------------------------------------------------

  useEffect(() => {
    localStorage.setItem('focusflow-music-on', String(musicOn));
  }, [musicOn]);
  useEffect(() => {
    const updateDockHost = () => {
      const fullscreenSlot = document.querySelector<HTMLElement>('.focus-fullscreen .focus-music-slot');
      setDockHost(fullscreenSlot ?? document.body);
    };
    updateDockHost();
    document.addEventListener('fullscreenchange', updateDockHost);
    const observer = new MutationObserver(updateDockHost);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => {
      document.removeEventListener('fullscreenchange', updateDockHost);
      observer.disconnect();
    };
  }, []);

  // --------------------------------------------------
  // Keep volume synced
  // --------------------------------------------------

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.setVolume(data.settings.volume);
    }
  }, [data.settings.volume]);

  // --------------------------------------------------
  // Load YouTube IFrame API ONCE
  // --------------------------------------------------

  useEffect(() => {
    const createPlayer = () => {
      if (
        !playerElementRef.current ||
        playerRef.current ||
        !window.YT?.Player
      ) {
        return;
      }

      playerRef.current = new window.YT.Player(playerElementRef.current, {
        height: '200',
        width: '320',

        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          playsinline: 1,
        },

        events: {
          onReady: (event) => {
            apiReadyRef.current = true;

            event.target.setVolume(latestRef.current.data.settings.volume);

            // If a track was selected before the player became ready,
            // load it now.
            if (latestRef.current.currentTrack) {
              event.target.cueVideoById(latestRef.current.currentTrack.videoId);
            }
          },

          onStateChange: (event) => {
            // 1 = playing
            // 2 = paused
            // 0 = ended
            setPlaying(event.data === 1);

            // Automatically move to next song
            const { results: currentResults, currentIndex: trackIndex } = latestRef.current;
            if (event.data === 0 && currentResults.length > 0) {
              const nextIndex =
                trackIndex >= currentResults.length - 1
                  ? 0
                  : trackIndex + 1;

              const next = currentResults[nextIndex];

              if (next) {
                setCurrentTrack(next);
                setCurrentIndex(nextIndex);

                playerRef.current?.loadVideoById(next.videoId);
              }
            }
          },

          onError: () => {
            setError(
              "YouTube couldn't play this track. Try another result."
            );
            setPlaying(false);
          },
        },
      });
    };

    // YouTube API already loaded
    if (window.YT?.Player) {
      apiReadyRef.current = true;
      createPlayer();
      return;
    }

    // Check if script already exists
    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );

    if (!existingScript) {
      const script = document.createElement('script');

      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;

      document.body.appendChild(script);
    }

    const oldCallback = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      oldCallback?.();

      apiReadyRef.current = true;

      // Give React a moment to mount the player element
      setTimeout(createPlayer, 100);
    };

    // Extra fallback in case YouTube API was already loading
    const interval = window.setInterval(() => {
      if (window.YT?.Player && !playerRef.current) {
        apiReadyRef.current = true;
        createPlayer();
        window.clearInterval(interval);
      }
    }, 300);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  // --------------------------------------------------
  // Search YouTube
  // --------------------------------------------------

  async function searchMusic(event?: React.FormEvent) {
    event?.preventDefault();

    const cleanQuery = query.trim();

    if (!cleanQuery) return;

    setSearching(true);
    setError('');

    try {
      const response = await fetch(
        `${window.location.origin}/api/music/search?q=${encodeURIComponent(
          cleanQuery
        )}`
      );

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const payload = await response.json();

      setResults(payload.results ?? []);
    } catch (err) {
      console.error('Music search error:', err);

      setError('Music search is temporarily unavailable.');
    } finally {
      setSearching(false);
    }
  }

  // --------------------------------------------------
  // Play selected track
  // --------------------------------------------------

  function playTrack(track: YouTubeTrack, index: number) {
    setCurrentTrack(track);
    setCurrentIndex(index);
    setMusicOn(true);
    setError('');
    setSearchOpen(false);

    const play = () => {
      if (!playerRef.current) {
        setError('Music player is still loading. Try again.');
        return;
      }

      playerRef.current.setVolume(latestRef.current.data.settings.volume);
      playerRef.current.unMute();
      playerRef.current.loadVideoById(track.videoId);
    };

    if (playerRef.current) {
      play();
    } else {
      // Player may still be initializing
      window.setTimeout(play, 1000);
    }
  }

  // --------------------------------------------------
  // Play / pause
  // --------------------------------------------------

  function togglePlayback() {
    if (!currentTrack) {
      setSearchOpen(true);
      return;
    }

    if (!playerRef.current) {
      setError('Music player is still loading.');
      return;
    }

    if (playing) {
      playerRef.current.pauseVideo();
      setPlaying(false);
    } else {
      playerRef.current.unMute();
      playerRef.current.setVolume(data.settings.volume);
      playerRef.current.playVideo();
      setPlaying(true);
    }
  }

  // --------------------------------------------------
  // Music ON
  // --------------------------------------------------

  function turnMusicOn() {
    setMusicOn(true);

    if (currentTrack) {
      if (!playerRef.current) {
        setError('Music player is still loading.');
        return;
      }

      playerRef.current.setVolume(data.settings.volume);
      playerRef.current.unMute();
      playerRef.current.playVideo();
      setPlaying(true);
    } else {
      setSearchOpen(true);
    }
  }

  // --------------------------------------------------
  // Next
  // --------------------------------------------------

  function nextTrack() {
    if (!results.length) return;

    const nextIndex =
      currentIndex >= results.length - 1
        ? 0
        : currentIndex + 1;

    playTrack(results[nextIndex], nextIndex);
  }

  // --------------------------------------------------
  // Previous
  // --------------------------------------------------

  function previousTrack() {
    if (!results.length) return;

    const previousIndex =
      currentIndex <= 0
        ? results.length - 1
        : currentIndex - 1;

    playTrack(results[previousIndex], previousIndex);
  }

  // --------------------------------------------------
  // Silence
  // --------------------------------------------------

  function silenceMode() {
    playerRef.current?.mute();
    setMusicOn(false);
    setSearchOpen(false);
  }

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <>
      {dockHost && !inFocusFullscreen && createPortal((<>
      {inFocusFullscreen && !dockExpanded && (
        <div className="music-dock music-dock-collapsed" data-testid="music-player">
          <Music2 size={18} color="var(--coral)" />
          <strong className="music-dock-collapsed-title">{!musicOn ? 'Music off' : currentTrack?.title ?? 'Choose some music'}</strong>
          <button className="icon-button music-dock-play" onClick={() => { if (!currentTrack) { setDockExpanded(true); if (musicOn) setSearchOpen(true); else turnMusicOn(); } else togglePlayback(); }} aria-label={!musicOn ? 'Turn music on' : playing ? 'Pause music' : 'Play music'} title={!musicOn ? 'Turn music on' : playing ? 'Pause' : 'Play'}>
            {!musicOn || !playing ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button className="icon-button music-dock-expand" onClick={() => setDockExpanded(true)} aria-label="Expand music player" title="Expand music player"><ChevronUp size={16} /></button>
        </div>
      )}
      {!inFocusFullscreen && !musicOn && (
        <div
          className="music-dock"
          data-testid="music-player"
        >
          <Music2
            size={17}
            color="var(--coral)"
          />

          <div className="music-dock-copy">
            <strong>Music off</strong>
            <span> Distraction-free study</span>
          </div>

          <button
            className="button secondary"
            onClick={turnMusicOn}
          >
            <Play size={15} />
            Music On
          </button>
        </div>
      )}

      {musicOn && (!inFocusFullscreen || dockExpanded) && (
        <div
          className="music-dock"
          data-testid="music-player"
        >
          {currentTrack?.thumbnail ? (
            <img
              src={currentTrack.thumbnail}
              alt=""
              style={{
                width: 46,
                height: 46,
                borderRadius: 8,
                objectFit: 'cover',
              }}
            />
          ) : (
            <Music2
              size={20}
              color="var(--coral)"
            />
          )}

          <div className="music-dock-copy">
            <strong className="music-current-title">
              {currentTrack?.title ?? 'Choose some music'}
            </strong>

            <span className="music-current-channel">
              {currentTrack?.channel ?? 'Search YouTube'}
            </span>
          </div>

          <button
            className="icon-button"
            onClick={previousTrack}
            disabled={!currentTrack}
            title="Previous"
          >
            <ChevronLeft size={18} />
          </button>

          <button
            className="icon-button"
            onClick={togglePlayback}
            disabled={!currentTrack}
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <Pause size={18} />
            ) : (
              <Play size={18} />
            )}
          </button>

          <button
            className="icon-button"
            onClick={nextTrack}
            disabled={!currentTrack}
            title="Next"
          >
            <ChevronRight size={18} />
          </button>

          <button
            className="icon-button"
            onClick={() => setSearchOpen(!searchOpen)}
            title="Search music"
          >
            <Search size={18} />
          </button>

          <button
            className="icon-button"
            onClick={silenceMode}
            title="Silence mode"
          >
            <Volume2 size={18} />
          </button>
          {inFocusFullscreen && <button className="icon-button music-dock-collapse" onClick={() => setDockExpanded(false)} aria-label="Collapse music player" title="Collapse music player"><ChevronDown size={17} /></button>}

          {/* Search popup */}
          {searchOpen && (
            <div className="music-search-popup">
              <form
                onSubmit={searchMusic}
                className="music-search-form"
              >
                <input
                  value={query}
                  onChange={(event) =>
                    setQuery(event.target.value)
                  }
                  placeholder="Search songs or artists..."
                  autoFocus
                />

                <button
                  type="submit"
                  className="icon-button"
                  disabled={searching}
                >
                  <Search size={17} />
                </button>
              </form>

              {searching && (
                <p className="music-search-status">
                  Searching...
                </p>
              )}

              {error && (
                <p className="music-search-error">
                  {error}
                </p>
              )}

              {!searching &&
                results.map((track, index) => (
                  <button
                    key={track.videoId}
                    className="music-result"
                    onClick={() =>
                      playTrack(track, index)
                    }
                  >
                    <img
                      src={track.thumbnail}
                      alt=""
                    />

                    <div className="music-result-info">
                      <strong>
                        {track.title}
                      </strong>

                      <span>
                        {track.channel}
                      </span>
                    </div>

                    <span className="music-result-play">
                      <Play size={15} />
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
      {inFocusFullscreen && dockExpanded && !musicOn && (
        <div className="music-dock music-dock-expanded-off" data-testid="music-player">
          <Music2 size={18} color="var(--coral)" />
          <div className="music-dock-copy"><strong>Music off</strong><span>Distraction-free study</span></div>
          <button className="icon-button" onClick={turnMusicOn} aria-label="Turn music on" title="Turn music on"><Play size={16} /></button>
          <button className="icon-button" onClick={() => setDockExpanded(false)} aria-label="Collapse music player" title="Collapse music player"><ChevronDown size={17} /></button>
        </div>
      )}
      </>), dockHost)}
      {/* Keep the single YouTube iframe host mounted while the controls move into focus mode. */}
      <div className="music-youtube-player" aria-hidden="true">
        <div ref={playerElementRef} />
      </div>
    </>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}
function Empty({ icon: Icon = Sparkles, title, text, action }: { icon?: typeof Sparkles; title: string; text: string; action?: ReactNode }) {
  return <div className="empty"><Icon size={22} /><h3>{title}</h3><p>{text}</p>{action}</div>;
}
function TaskCard({ task, onEdit }: { task: Task; onEdit: (task: Task) => void }) {
  const data = useData();
  const workoutTask = isWorkoutTask(task);
  const linkedActivity = data.activities.find((activity) => activity.taskId === task.id);
  const project = task.projectId ? data.projects.find((p) => p.id === task.projectId) : undefined;
  const today = dateKey();
  const isDueToday = task.deadline === today;
  const isOverdue = Boolean(task.deadline && task.deadline < today && !task.done);

  return <div className={cx('sticky', categoryClass(task.category), task.done && 'done')} draggable onDragStart={(event) => event.dataTransfer.setData('taskId', task.id)} data-testid={`card-task-${task.id}`}>
    <div className="sticky-top">
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <button
          type="button"
          className={cx('sticky-checkbox', task.done && 'checked')}
          onClick={() => data.updateTask(task.id, { done: !task.done, completedAt: !task.done ? new Date().toISOString() : undefined })}
          aria-label={task.done ? 'Reopen task' : 'Complete task'}
          data-testid={`button-check-task-${task.id}`}
        >
          {task.done && <Check size={12} strokeWidth={2.8} />}
        </button>
        <span className="tag">{task.category}</span>
      </div>
      <span className={cx('priority', task.priority)} title={`Priority: ${task.priority}`} />
    </div>

    <h3 style={{ textDecoration: task.done ? 'line-through' : 'none', opacity: task.done ? 0.7 : 1 }}>{task.title}</h3>
    {task.description && <p>{task.description}</p>}

    <div className="sticky-meta-row">
      {project && <span className="sticky-pill project"><FolderKanban size={10} /> {project.name}</span>}
      {task.deadline && (
        <span className={cx('sticky-pill', isOverdue && 'overdue', isDueToday && 'due-today')}>
          <CalendarDays size={10} /> {isDueToday ? 'Due today' : isOverdue ? `Overdue (${formatDate(task.deadline)})` : formatDate(task.deadline)}
        </span>
      )}
      {workoutTask && (
        <span className="sticky-pill">
          <Dumbbell size={10} /> {linkedActivity ? `${linkedActivity.start}` : task.scheduledTime || 'Flexible'}
        </span>
      )}
      <span className="sticky-pill"><Clock3 size={10} /> {task.estimate}m</span>
    </div>

    <div className="task-actions">
      <button onClick={() => data.updateTask(task.id, { done: !task.done, completedAt: !task.done ? new Date().toISOString() : undefined })} aria-label={task.done ? 'Reopen task' : 'Complete task'} data-testid={`button-complete-task-${task.id}`}>{task.done ? <RotateCcw size={13} /> : <Check size={13} />}</button>
      <button onClick={() => onEdit(task)} aria-label="Edit task" data-testid={`button-edit-task-${task.id}`}><Pencil size={13} /></button>
      <button onClick={() => { if (window.confirm('Delete this task?')) data.deleteTask(task.id); }} aria-label="Delete task" data-testid={`button-delete-task-${task.id}`}><Trash2 size={13} /></button>
      {workoutTask && <Link href="/workout" className="icon-button" style={{ width: 28, height: 28, minHeight: 28 }} onClick={() => data.setActiveWorkoutSchedule(task.id)} aria-label={`Open ${task.title} in Workout`} title="Open in Workout" data-testid={`button-task-workout-${task.id}`}><Dumbbell size={14} /></Link>}
      {!task.done && (task.category === 'Study' || task.category === 'Work' || task.category === 'Coding') && <Link href={`/study?taskId=${encodeURIComponent(task.id)}`} className="icon-button" style={{ width: 28, height: 28, minHeight: 28 }} aria-label={`Move ${task.title} to Focus Room`} title="Move to Focus Room" data-testid={`button-task-focus-${task.id}`}><Target size={14} /></Link>}
    </div>
  </div>;
}

function WorkoutAction({ activity }: { activity: Activity }) {
  const data = useData();
  const task = activity.taskId ? data.tasks.find((item) => item.id === activity.taskId) : undefined;
  const isWorkout = activity.category === 'Workout' || Boolean(task && isWorkoutTask(task)) || isWorkoutTitle(activity.title);
  if (!isWorkout) return null;
  const scheduleId = task && isWorkoutTask(task) ? task.id : activity.id;
  return <Link href="/workout" className="icon-button" style={{ width: 28, height: 28, minHeight: 28, flexShrink: 0 }} onClick={() => data.setActiveWorkoutSchedule(scheduleId)} aria-label={`Open ${activity.title} in Workout`} title="Open in Workout" data-testid={`button-activity-workout-${activity.id}`}><Dumbbell size={14} /></Link>;
}

function TaskForm({ initial, onClose }: { initial?: Task; onClose: () => void }) {
  const data = useData(); const [error, setError] = useState(''); const [form, setForm] = useState({ title: initial?.title ?? '', description: initial?.description ?? '', category: initial?.category ?? 'Study' as Category, priority: initial?.priority ?? 'medium' as Priority, estimate: String(initial?.estimate ?? 25), deadline: initial?.deadline ?? '', scheduledTime: initial?.scheduledTime ?? '', reminder: initial?.reminder ?? '', projectId: initial?.projectId ?? '' });
  const submit = (event: FormEvent) => { event.preventDefault(); const estimate = Number(form.estimate); if (!form.title.trim()) return setError('Give the task a short title.'); if (!Number.isFinite(estimate) || estimate <= 0 || estimate > 1440) return setError('Estimate must be between 1 and 1,440 minutes.'); if (initial) data.updateTask(initial.id, { ...form, title: form.title.trim(), estimate, category: form.category as Category, priority: form.priority as Priority, projectId: form.projectId || undefined }); else data.addTask({ ...form, title: form.title.trim(), estimate, category: form.category as Category, priority: form.priority as Priority, projectId: form.projectId || undefined }); onClose(); };
  return <Modal title={initial ? 'Shape this task' : 'Capture a task'} subtitle="Keep it clear enough that future-you knows where to begin." onClose={onClose}><form onSubmit={submit}><div className="form-grid"><Field label="Title" full><input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What needs your attention?" data-testid="input-task-title" /></Field><Field label="Area"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })} data-testid="select-task-category">{categories.map((category) => <option key={category}>{category}</option>)}</select></Field><Field label="Priority"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })} data-testid="select-task-priority"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field><Field label="Estimate (minutes)"><input type="number" min="1" max="1440" value={form.estimate} onChange={(e) => setForm({ ...form, estimate: e.target.value })} data-testid="input-task-estimate" /></Field><Field label="Deadline"><input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} data-testid="input-task-deadline" /></Field>{(form.category === 'Workout' || isWorkoutTitle(form.title)) && <Field label="Workout time (optional)"><input type="time" value={form.scheduledTime} onChange={(e) => setForm({ ...form, scheduledTime: e.target.value })} data-testid="input-task-scheduled-time" /></Field>}<Field label="Reminder (optional)"><input type="datetime-local" value={form.reminder} onChange={(e) => setForm({ ...form, reminder: e.target.value })} data-testid="input-task-reminder" /></Field><Field label="Project"><select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} data-testid="select-task-project"><option value="">No project</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field><Field label="Notes" full><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="A little context, if useful." data-testid="textarea-task-description" /></Field></div>{error && <p className="error-text">{error}</p>}<div className="modal-footer"><button type="button" className="soft-button" onClick={onClose} data-testid="button-cancel-task">Cancel</button><button className="primary-button" type="submit" data-testid="button-save-task">{initial ? 'Save changes' : 'Add task'}</button></div></form></Modal>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="modal" role="dialog" aria-modal="true"><div className="modal-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog" data-testid="button-close-dialog"><X size={16} /></button></div>{children}</div></div>; }
function Field({ label, full, children }: { label: string; full?: boolean; children: ReactNode }) { return <div className={cx('field', full && 'full')}><label>{label}</label>{children}</div>; }
function ConflictDialog({ overlaps, onChooseAnother, onReplace, onCancel }: { overlaps: Activity[]; onChooseAnother: () => void; onReplace: () => void; onCancel: () => void }) {
  return <div className="modal-backdrop" style={{ zIndex: 45 }} role="alertdialog" aria-modal="true" aria-labelledby="schedule-conflict-title"><div className="modal conflict-dialog"><div className="modal-header"><div><h2 id="schedule-conflict-title">That time is already spoken for.</h2><p>{overlaps.map((item) => `${item.title} (${item.start}, ${item.duration}m)`).join(' · ')}</p></div><button className="icon-button" onClick={onCancel} aria-label="Close conflict dialog" data-testid="button-close-conflict"><X size={16} /></button></div><p className="muted" style={{ marginBottom: 16 }}>Choose exactly what should happen next.</p><div className="conflict-actions"><button className="primary-button" onClick={onChooseAnother} data-testid="button-conflict-change-time">Choose another time</button><button className="danger-button" onClick={onReplace} data-testid="button-conflict-replace">Replace overlapping activities</button><button className="soft-button" onClick={onCancel} data-testid="button-conflict-cancel">Cancel</button></div></div></div>;
}

function Dashboard() {
  const data = useData();
  const [taskModal, setTaskModal] = useState<Task | 'new' | null>(null);
  const completed = data.tasks.filter((task) => task.done).length;
  const openCount = data.tasks.filter((task) => !task.done).length;
  const todayActivities = data.activities.filter((activity) => activity.date === dateKey());
  const minutes = data.sessions.filter((s) => sameDay(s.start, dateKey())).reduce((sum, s) => sum + s.actualSeconds, 0) / 60;
  const todayCompleted = data.tasks.filter((t) => t.done && t.completedAt?.startsWith(dateKey())).length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = data.settings.name && data.settings.name !== 'Your name' ? data.settings.name.split(' ')[0] : 'there';

  return <div className="page">
    <PageHeading
      eyebrow={new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}
      title={`${greeting}, ${firstName}.`}
      description="Your day, at a glance. Keep the next thing close."
      action={<button className="primary-button" onClick={() => setTaskModal('new')} data-testid="button-add-task"><Plus size={15} /> Add task</button>}
    />

    {/* Quick Action Toolbar */}
    <div className="quick-action-bar">
      <button className="quick-action-chip accent" onClick={() => setTaskModal('new')} data-testid="button-quick-task">
        <Plus size={14} /> Capture task
      </button>
      <Link href="/schedule" className="quick-action-chip" data-testid="button-quick-schedule">
        <CalendarDays size={14} /> Plan time
      </Link>
      <Link href="/study" className="quick-action-chip" data-testid="button-quick-focus">
        <Target size={14} /> Focus room
      </Link>
      <Link href="/workout" className="quick-action-chip" data-testid="button-quick-workout">
        <Zap size={14} /> Workout
      </Link>
    </div>

    {/* Hero Metrics */}
    <div className="grid grid-4">
      <div className="card metric">
        <div className="metric-head">
          <div className="eyebrow">Open tasks</div>
          <span className="metric-icon-wrap"><ListChecks size={16} /></span>
        </div>
        <div className="metric-value">{openCount}</div>
        <div className="metric-label">waiting in your flow</div>
        <div className="metric-trend"><TrendingUp size={12} /> {openCount} active</div>
      </div>

      <div className="card metric">
        <div className="metric-head">
          <div className="eyebrow">Completed</div>
          <span className="metric-icon-wrap" style={{ background: 'color-mix(in srgb, var(--mint) 15%, transparent)', color: 'var(--mint-ink)' }}><CheckCircle2 size={16} /></span>
        </div>
        <div className="metric-value">{completed}</div>
        <div className="metric-label">all-time, by you</div>
        <div className="metric-trend" style={{ color: 'var(--mint-ink)' }}>+{todayCompleted} finished today</div>
      </div>

      <div className="card metric">
        <div className="metric-head">
          <div className="eyebrow">Focus today</div>
          <span className="metric-icon-wrap" style={{ background: 'color-mix(in srgb, #6366f1 15%, transparent)', color: '#6366f1' }}><Clock3 size={16} /></span>
        </div>
        <div className="metric-value">{Math.round(minutes)}m</div>
        <div className="metric-label">real minutes recorded</div>
        <div className="metric-trend" style={{ color: '#6366f1' }}>{data.sessions.filter((s) => sameDay(s.start, dateKey())).length} focus sessions</div>
      </div>

      <div className="card metric">
        <div className="metric-head">
          <div className="eyebrow">Planned today</div>
          <span className="metric-icon-wrap" style={{ background: 'color-mix(in srgb, var(--sand-warm) 20%, transparent)', color: '#b45309' }}><CalendarDays size={16} /></span>
        </div>
        <div className="metric-value">{todayActivities.length}</div>
        <div className="metric-label">scheduled activities</div>
        <div className="metric-trend" style={{ color: '#b45309' }}>{todayActivities.reduce((s, a) => s + a.duration, 0)}m planned</div>
      </div>
    </div>

    {/* Inbox Preview and Weekly Chart */}
    <div className="grid grid-3" style={{ marginTop: 18 }}>
      <section className="card" style={{ gridColumn: 'span 2' }}>
        <div className="card-title">
          <div><div className="eyebrow">Task inbox</div><h2 className="section-title">The things worth moving</h2></div>
          <Link href="/inbox" className="soft-button" data-testid="link-open-inbox">View inbox ({openCount}) <ExternalLink size={13} /></Link>
        </div>
        {data.tasks.length ? (
          <div className="task-board">{data.tasks.slice(0, 6).map((task) => <TaskCard key={task.id} task={task} onEdit={setTaskModal} />)}</div>
        ) : (
          <Empty icon={ListChecks} title="Your board is clear" text="Capture one small thing and give it a place to land." action={<button className="primary-button" onClick={() => setTaskModal('new')} data-testid="button-empty-add-task"><Plus size={14} /> Capture a task</button>} />
        )}
      </section>

      <section className="card">
        <div className="card-title">
          <div><div className="eyebrow">This week</div><h2 className="section-title">Keep the thread</h2></div>
          <Link href="/analytics" className="icon-button" aria-label="Open analytics" data-testid="button-open-analytics"><MoreHorizontal size={16} /></Link>
        </div>
        <div className="stat-line"><span className="muted">Completion</span><strong>{data.tasks.length ? Math.round(completed / data.tasks.length * 100) : 0}%</strong></div>
        <div className="progress-track" style={{ margin: '10px 0 22px' }}>
          <div className="progress-bar mint" style={{ width: `${data.tasks.length ? completed / data.tasks.length * 100 : 0}%` }} />
        </div>
        <div className="grid" style={{ gap: 12 }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
            const isToday = new Date().getDay() === (i + 1) % 7;
            const daySeconds = data.sessions.filter((s) => new Date(s.start).getDay() === (i + 1) % 7).reduce((sum, s) => sum + s.actualSeconds, 0);
            return (
              <div className="stat-line" key={day} style={{ fontWeight: isToday ? 700 : 400 }}>
                <span className="tiny" style={{ color: isToday ? 'var(--coral)' : undefined }}>{day}{isToday ? ' •' : ''}</span>
                <div className="progress-track" style={{ flex: 1 }}>
                  <div className={cx('progress-bar', isToday && 'coral')} style={{ width: `${Math.min(100, (daySeconds / 3600) * 100)}%` }} />
                </div>
                <span className="tiny" style={{ width: 30, textAlign: 'right' }}>{Math.round(daySeconds / 60)}m</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>

    {/* Next Up Today */}
    <section className="card" style={{ marginTop: 18 }}>
      <div className="card-title">
        <div><div className="eyebrow">Next up</div><h2 className="section-title">Today's shape</h2></div>
        <Link href="/schedule" className="soft-button" data-testid="link-open-schedule">Open schedule <CalendarDays size={13} /></Link>
      </div>
      {todayActivities.length ? (
        <div className="grid grid-2">
          {todayActivities.slice(0, 4).map((activity) => (
            <div className="schedule-item" key={activity.id}>
              <div>
                <p>{activity.title}</p>
                <span>{activity.start} · {activity.duration} minutes</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="tag">{activity.category}</span>
                <WorkoutAction activity={activity} />
                {activity.taskId && <Link href={`/study?taskId=${encodeURIComponent(activity.taskId)}`} className="icon-button" style={{ width: 28, height: 28 }} title="Focus on this" data-testid={`button-dash-focus-${activity.id}`}><Target size={14} /></Link>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={CalendarDays} title="Nothing planned today" text="A loose plan can make the next step feel lighter." action={<Link href="/schedule" className="primary-button" data-testid="button-plan-today"><Plus size={14} /> Plan time</Link>} />
      )}
    </section>

    {taskModal && <TaskForm initial={taskModal === 'new' ? undefined : taskModal} onClose={() => setTaskModal(null)} />}
  </div>;
}

function Inbox() {
  const data = useData();
  const [modal, setModal] = useState<Task | 'new' | null>(null);
  const [filter, setFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');

  const filteredTasks = data.tasks.filter((t) => {
    const matchesCategory = filter === 'All' || t.category === filter;
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' && !t.done) || (statusFilter === 'completed' && t.done);
    return matchesCategory && matchesStatus;
  });

  return <div className="page">
    <PageHeading
      eyebrow="Task inbox"
      title="Everything has a place."
      description="Drag a sticky to Schedule, or work straight from here."
      action={<button className="primary-button" onClick={() => setModal('new')} data-testid="button-inbox-add"><Plus size={15} /> New task</button>}
    />

    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 19 }}>
      {/* Category filters */}
      <div className="date-nav" style={{ margin: 0 }}>
        {['All', ...categories].map((item) => {
          const count = item === 'All' ? data.tasks.length : data.tasks.filter((t) => t.category === item).length;
          return (
            <button key={item} className={cx(item === filter ? 'primary-button' : 'soft-button')} onClick={() => setFilter(item)} data-testid={`button-filter-${item.toLowerCase()}`}>
              {item} <span style={{ opacity: 0.75, fontSize: 11, marginLeft: 4 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* Status filter toggle */}
      <div className="date-nav" style={{ margin: 0 }}>
        {(['all', 'active', 'completed'] as const).map((s) => (
          <button
            key={s}
            className={cx(statusFilter === s ? 'primary-button' : 'soft-button')}
            onClick={() => setStatusFilter(s)}
            style={{ fontSize: 12, padding: '6px 12px' }}
            data-testid={`button-status-${s}`}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
    </div>

    {filteredTasks.length ? (
      <div className="task-board">{filteredTasks.map((task) => <TaskCard key={task.id} task={task} onEdit={setModal} />)}</div>
    ) : (
      <Empty
        icon={ListChecks}
        title={filter === 'All' ? 'Start with one clear thing' : `No ${filter.toLowerCase()} tasks yet`}
        text="Tasks you add here stay with you across the whole app."
        action={<button className="primary-button" onClick={() => setModal('new')} data-testid="button-inbox-empty-add"><Plus size={14} /> Add a task</button>}
      />
    )}

    {modal && <TaskForm initial={modal === 'new' ? undefined : modal} onClose={() => setModal(null)} />}
  </div>;
}

function Buildup() {
  const data = useData();
  const [date, setDate] = useState(dateKey());
  const [modal, setModal] = useState<Task | 'new' | null>(null);
  const [dragOverStart, setDragOverStart] = useState<string | null>(null);
  const [dropMessage, setDropMessage] = useState('');
  const [pendingDrop, setPendingDrop] = useState<{ task?: Task; activity?: Activity; start: string; overlaps: Activity[] } | null>(null);
  const activities = data.activities.filter((item) => item.date === date).sort((a, b) => a.start.localeCompare(b.start));
  const looseTasks = data.tasks.filter((task) => !task.done && !activities.some((activity) => activity.taskId === task.id));
  const hours = Array.from({ length: 24 }, (_, index) => index);
  const announce = (message: string) => { setDropMessage(message); window.setTimeout(() => setDropMessage(''), 2400); };
  const placeTask = (task: Task, start: string, replace = false) => {
    if (replace) (pendingDrop?.overlaps ?? []).forEach((item) => data.deleteActivity(item.id));
    data.addActivity({ title: task.title, taskId: task.id, category: task.category, date, start, duration: task.estimate });
    announce(`Placed "${task.title}" at ${start}.`);
    setPendingDrop(null);
  };
  const moveActivity = (activity: Activity, start: string, replace = false) => {
    if (replace) (pendingDrop?.overlaps ?? []).forEach((item) => data.deleteActivity(item.id));
    data.updateActivity(activity.id, { date, start });
    announce(`Moved "${activity.title}" to ${start}.`);
    setPendingDrop(null);
  };
  const handleDrop = (event: DragEvent, start: string) => {
    event.preventDefault();
    const activityId = event.dataTransfer.getData('activityId');
    const taskId = event.dataTransfer.getData('taskId');
    const activity = activityId ? data.activities.find((item) => item.id === activityId) : undefined;
    const task = taskId ? data.tasks.find((item) => item.id === taskId) : undefined;
    if (activity) {
      const overlaps = findOverlaps(data.activities, date, start, activity.duration, activity.id);
      if (overlaps.length) setPendingDrop({ activity, start, overlaps }); else moveActivity(activity, start);
    } else if (task) {
      const overlaps = findOverlaps(data.activities, date, start, task.estimate);
      if (overlaps.length) setPendingDrop({ task, start, overlaps }); else placeTask(task, start);
    }
    setDragOverStart(null);
  };
  const shiftDate = (amount: number) => { const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + amount); setDate(next.toISOString().slice(0, 10)); };
  return <div className="page">
    <PageHeading eyebrow="Buildup" title="Build a day that can happen." description="Turn loose tasks into movable blocks, then give each one a realistic place." action={<button className="primary-button" onClick={() => setModal('new')} data-testid="button-buildup-add-task"><Plus size={15} /> Add task block</button>} />
    <div className="date-nav buildup-date-nav"><button className="icon-button" onClick={() => shiftDate(-1)} aria-label="Previous buildup day" data-testid="button-buildup-previous-day"><ChevronLeft size={16} /></button><button className="date-pill" onClick={() => setDate(dateKey())} data-testid="button-buildup-date"><CalendarDays size={14} />{dateLabel(date)}</button><button className="icon-button" onClick={() => shiftDate(1)} aria-label="Next buildup day" data-testid="button-buildup-next-day"><ChevronRight size={16} /></button>{date !== dateKey() && <button className="soft-button" onClick={() => setDate(dateKey())}>Today</button>}</div>
    {dropMessage && <div className="toast">{dropMessage}</div>}
    <div className="buildup-layout">
      <section className="card buildup-blocks"><div className="card-title"><div><div className="eyebrow">Task blocks</div><h2 className="section-title">What can move today</h2></div><Blocks size={18} color="var(--coral)" /></div><p className="tiny buildup-help">Drag a block into a time slot. Blocks already on the chart can be dragged again to move them.</p>{looseTasks.length ? <div className="buildup-block-list">{looseTasks.map((task) => <div className={cx('buildup-block', categoryClass(task.category))} draggable onDragStart={(event) => { event.dataTransfer.setData('taskId', task.id); event.dataTransfer.effectAllowed = 'move'; }} key={task.id} data-testid={`buildup-task-${task.id}`}><GripVertical size={14} /><div><strong>{task.title}</strong><span>{task.category} · {task.estimate}m</span></div><span className="priority-spacer" /></div>)}</div> : <Empty icon={Check} title="Your blocks are placed" text="Add another task or move a planned block to a new time." action={<button className="soft-button" onClick={() => setModal('new')}><Plus size={13} /> Add block</button>} />}</section>
      <section className="buildup-chart-wrap"><div className="buildup-chart-header"><div><div className="eyebrow">Time chart</div><h2 className="section-title">{activities.length} blocks planned</h2></div><span className="tag">{activities.reduce((sum, item) => sum + item.duration, 0)}m planned</span></div><div className="buildup-timeline">{hours.map((hour) => { const start = `${String(hour).padStart(2, '0')}:00`; const items = activities.filter((activity) => activity.start.slice(0, 2) === String(hour).padStart(2, '0')); const label = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`; return <div className="buildup-time-row" key={hour}><div className="time-label">{label}</div><div className={cx('buildup-time-slot', dragOverStart === start && 'drop-target')} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverStart(start); }} onDragEnter={() => setDragOverStart(start)} onDragLeave={() => setDragOverStart(null)} onDrop={(event) => handleDrop(event, start)}>{items.map((item) => <div className={cx('buildup-planned-block', categoryClass(item.category))} draggable onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('activityId', item.id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragOverStart(null)} key={item.id} data-testid={`buildup-activity-${item.id}`}><GripVertical size={14} /><div><strong>{item.title}</strong><span>{item.duration}m · {item.category}{(item.completed || data.tasks.some((task) => task.id === item.taskId && task.done)) ? ' · Completed' : ''}</span></div><WorkoutAction activity={item} /><button className="icon-button" onClick={(event) => { event.stopPropagation(); data.deleteActivity(item.id); }} aria-label={`Remove ${item.title}`}><Trash2 size={12} /></button></div>)}</div></div>; })}</div></section>
    </div>
    {modal && <TaskForm initial={modal === 'new' ? undefined : modal} onClose={() => setModal(null)} />}
    {pendingDrop && <ConflictDialog overlaps={pendingDrop.overlaps} onChooseAnother={() => setPendingDrop(null)} onReplace={() => pendingDrop.activity ? moveActivity(pendingDrop.activity, pendingDrop.start, true) : pendingDrop.task ? placeTask(pendingDrop.task, pendingDrop.start, true) : setPendingDrop(null)} onCancel={() => setPendingDrop(null)} />}
  </div>;
}

function Schedule() {
  const data = useData();
  const [date, setDate] = useState(dateKey());
  const [modal, setModal] = useState<Activity | 'new' | null>(null);
  const [dropMessage, setDropMessage] = useState('');
  const [dragOverStart, setDragOverStart] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{ task: Task; start: string; overlaps: Activity[] } | null>(null);
  const activities = data.activities.filter((item) => item.date === date).sort((a, b) => a.start.localeCompare(b.start));
  const looseTasks = data.tasks.filter((task) => !task.done && !activities.some((activity) => activity.taskId === task.id)).slice(0, 7);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentHour = now.getHours();
  const currentActivity = date === dateKey() ? activities.find((item) => { const start = clockMinutes(item.start); return currentMinutes >= start && currentMinutes < start + item.duration; }) : undefined;
  const isToday = date === dateKey();

  const totalPlannedMinutes = activities.reduce((sum, item) => sum + item.duration, 0);
  const capacityPercent = Math.min(100, Math.round((totalPlannedMinutes / 480) * 100)); // 8 hour working capacity

  const stageDrop = (event: DragEvent, start: string) => { event.preventDefault(); const taskId = event.dataTransfer.getData('taskId') || draggingTaskId; const task = data.tasks.find((item) => item.id === taskId); if (!task) return; const overlaps = findOverlaps(data.activities, date, start, task.estimate); if (overlaps.length) setPendingDrop({ task, start, overlaps }); else { data.addActivity({ title: task.title, taskId: task.id, category: task.category, date, start, duration: task.estimate }); setDropMessage(`Placed "${task.title}" at ${start}.`); window.setTimeout(() => setDropMessage(''), 2500); } setDragOverStart(null); setDraggingTaskId(null); };
  const replaceDrop = () => { if (!pendingDrop) return; pendingDrop.overlaps.forEach((item) => data.deleteActivity(item.id)); data.addActivity({ title: pendingDrop.task.title, taskId: pendingDrop.task.id, category: pendingDrop.task.category, date, start: pendingDrop.start, duration: pendingDrop.task.estimate }); setDropMessage(`Placed "${pendingDrop.task.title}" at ${pendingDrop.start}.`); setPendingDrop(null); window.setTimeout(() => setDropMessage(''), 2500); };
  const shiftDate = (amount: number) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + amount); setDate(d.toISOString().slice(0, 10)); };

  return <div className="page">
    <PageHeading eyebrow="Schedule" title="Give the day a shape." description="A timeline that leaves room for real life." action={<button className="primary-button" onClick={() => setModal('new')} data-testid="button-add-activity"><Plus size={15} /> Add activity</button>} />

    {currentActivity && (
      <div className="tag coral" style={{ marginBottom: 16, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px', fontSize: 13, borderRadius: 999 }}>
        <ActivityIcon size={14} /> Happening now: <strong>{currentActivity.title}</strong> ({currentActivity.start}, {currentActivity.duration}m)
      </div>
    )}

    <div className="date-nav" style={{ marginBottom: 19 }}>
      <button className="icon-button" onClick={() => shiftDate(-1)} aria-label="Previous day" data-testid="button-previous-day"><ChevronLeft size={16} /></button>
      <button className="date-pill" onClick={() => setDate(dateKey())} data-testid="button-schedule-date"><CalendarDays size={14} />{dateLabel(date)}</button>
      <button className="icon-button" onClick={() => shiftDate(1)} aria-label="Next day" data-testid="button-next-day"><ChevronRight size={16} /></button>
      {!isToday && <button className="soft-button" onClick={() => setDate(dateKey())} data-testid="button-today">Today</button>}
    </div>

    {dropMessage && <div className="toast">{dropMessage}</div>}

    <div className="grid grid-3">
      <section className="timeline" style={{ gridColumn: 'span 2', position: 'relative' }}>
        {hours.map((hour) => {
          const start = `${String(hour).padStart(2, '0')}:00`;
          const item = activities.find((activity) => activity.start.slice(0, 2) === String(hour).padStart(2, '0'));
          const linkedTask = item?.taskId ? data.tasks.find((task) => task.id === item.taskId) : undefined;
          const preview = draggingTaskId && dragOverStart === start ? data.tasks.find((task) => task.id === draggingTaskId) : undefined;
          const label = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
          const isCurrentHour = isToday && hour === currentHour;

          return (
            <div className="time-row" key={hour} style={{ position: 'relative' }}>
              <div className="time-label">{label}</div>
              <div
                className={cx('time-slot', dragOverStart === start && 'drop-target')}
                style={{ position: 'relative' }}
                onDragOver={(event) => { event.preventDefault(); const taskId = event.dataTransfer.getData('taskId'); if (taskId) setDraggingTaskId(taskId); setDragOverStart(start); }}
                onDragEnter={() => setDragOverStart(start)}
                onDragLeave={() => setDragOverStart(null)}
                onDrop={(event) => stageDrop(event, start)}
              >
                {isCurrentHour && (
                  <div className="timeline-now-line" style={{ top: `${(now.getMinutes() / 60) * 100}%` }}>
                    <span className="timeline-now-badge">
                      {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
                    </span>
                  </div>
                )}
                {item && (
                  <div className={cx('schedule-item', item.category === 'Study' ? '' : item.category === 'Work' ? 'sand' : item.category === 'Coding' ? 'lavender' : 'coral', currentActivity?.id === item.id && 'current')}>
                    <div>
                      <p>{item.title}</p>
                      <span>{item.duration} minutes · {item.category}{(item.completed || data.tasks.some((task) => task.id === item.taskId && task.done)) ? ' · Completed' : ''}</span>
                    </div>
                    {linkedTask && (linkedTask.category === 'Study' || linkedTask.category === 'Work' || linkedTask.category === 'Coding') && (
                      <Link href={`/study?taskId=${encodeURIComponent(linkedTask.id)}`} className="icon-button" style={{ width: 28, height: 28, minHeight: 28, flexShrink: 0 }} aria-label={`Move ${linkedTask.title} to Focus Room`} title="Move to Focus Room" data-testid={`button-move-focus-${item.id}`}>
                        <Target size={14} />
                      </Link>
                    )}
                    <WorkoutAction activity={item} />
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button className="icon-button" style={{ width: 25, height: 25, minHeight: 25, border: 0, background: 'transparent' }} onClick={() => setModal(item)} aria-label="Edit activity" data-testid={`button-edit-activity-${item.id}`}><Pencil size={12} /></button>
                      <button className="icon-button" style={{ width: 25, height: 25, minHeight: 25, border: 0, background: 'transparent' }} onClick={() => data.deleteActivity(item.id)} aria-label="Delete activity" data-testid={`button-delete-activity-${item.id}`}><Trash2 size={12} /></button>
                    </span>
                  </div>
                )}
                {preview && <div className="drop-preview"><GripVertical size={13} />Preview: {preview.title} · {preview.estimate}m</div>}
              </div>
            </div>
          );
        })}
      </section>

      <aside className="grid" style={{ alignContent: 'start' }}>
        <div className="card">
          <div className="card-title">
            <div><div className="eyebrow">Day summary</div><h2 className="section-title">{activities.length} activities</h2></div>
            <Clock3 size={18} color="var(--coral)" />
          </div>
          <div className="stat-line"><span className="muted">Planned time</span><strong>{totalPlannedMinutes}m ({Math.round(totalPlannedMinutes / 60 * 10) / 10}h)</strong></div>
          <div className="progress-track" style={{ margin: '8px 0 14px' }}>
            <div className={cx('progress-bar', capacityPercent > 100 ? 'coral' : 'mint')} style={{ width: `${capacityPercent}%` }} />
          </div>
          <div className="stat-line" style={{ marginTop: 10 }}>
            <span className="muted">Completed tasks</span>
            <strong>{data.tasks.filter((task) => task.done && activities.some((item) => item.taskId === task.id)).length}</strong>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <div><div className="eyebrow">Drag to place</div><h2 className="section-title">Loose tasks</h2></div>
            <GripVertical size={17} color="var(--ink-soft)" />
          </div>
          {looseTasks.map((task) => (
            <div key={task.id} draggable onDragStart={(event) => { event.dataTransfer.setData('taskId', task.id); setDraggingTaskId(task.id); }} onDragEnd={() => { setDraggingTaskId(null); setDragOverStart(null); }} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: 12 }} data-testid={`draggable-task-${task.id}`}>
              <GripVertical size={13} color="var(--ink-soft)" />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
              {isWorkoutTask(task) && <Link href="/workout" className="icon-button" style={{ width: 26, height: 26, minHeight: 26, flexShrink: 0 }} onClick={() => data.setActiveWorkoutSchedule(task.id)} aria-label={`Open ${task.title} in Workout`} title="Open in Workout" data-testid={`button-schedule-task-workout-${task.id}`}><Dumbbell size={13} /></Link>}
              <span className="tiny" style={{ marginLeft: 'auto' }}>{task.estimate}m</span>
            </div>
          ))}
          {!looseTasks.length && <p className="tiny">Everything is placed or complete.</p>}
        </div>
      </aside>
    </div>

    {modal && <ActivityForm initial={modal === 'new' ? undefined : modal} date={date} onClose={() => setModal(null)} />}
    {pendingDrop && <ConflictDialog overlaps={pendingDrop.overlaps} onChooseAnother={() => setPendingDrop(null)} onReplace={replaceDrop} onCancel={() => setPendingDrop(null)} />}
  </div>;
}

function ActivityForm({ initial, date, onClose }: { initial?: Activity; date: string; onClose: () => void }) {
  const data = useData(); const [error, setError] = useState(''); const [conflicts, setConflicts] = useState<Activity[]>([]);
  const [form, setForm] = useState({ title: initial?.title ?? '', category: initial?.category ?? 'Study' as Category, date: initial?.date ?? date, start: initial?.start ?? '09:00', duration: String(initial?.duration ?? 25), taskId: initial?.taskId ?? '' });
  const payload = (duration: number) => ({ title: form.title.trim(), category: form.category as Category, start: form.start, duration, date: form.date, taskId: form.taskId || undefined });
  const commit = (duration: number, replace: boolean) => { if (replace) conflicts.forEach((item) => data.deleteActivity(item.id)); if (initial) data.updateActivity(initial.id, payload(duration)); else data.addActivity(payload(duration)); setConflicts([]); onClose(); };
  const submit = (event: FormEvent) => { event.preventDefault(); const duration = Number(form.duration); if (!form.title.trim()) return setError('Name the activity first.'); if (!Number.isFinite(duration) || duration <= 0 || duration > 1440) return setError('Duration must be between 1 and 1,440 minutes.'); const found = findOverlaps(data.activities, form.date, form.start, duration, initial?.id); if (found.length) return setConflicts(found); commit(duration, false); };
  return <Modal title={initial ? 'Adjust the plan' : 'Plan a window'} subtitle="Choose a time that feels possible, not aspirational." onClose={onClose}><form onSubmit={submit}><div className="form-grid"><Field label="Activity" full><input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="input-activity-title" /></Field><Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="input-activity-date" /></Field><Field label="Category"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })} data-testid="select-activity-category">{categories.map((category) => <option key={category}>{category}</option>)}</select></Field><Field label="Start"><input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} data-testid="input-activity-start" /></Field><Field label="Duration (minutes)"><input type="number" min="1" max="1440" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} data-testid="input-activity-duration" /></Field><Field label="Linked task" full><select value={form.taskId} onChange={(e) => setForm({ ...form, taskId: e.target.value })} data-testid="select-activity-task"><option value="">No linked task</option>{data.tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></Field></div>{error && <p className="error-text">{error}</p>}<div className="modal-footer"><button type="button" className="soft-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" data-testid="button-save-activity">Save activity</button></div></form>{conflicts.length > 0 && <ConflictDialog overlaps={conflicts} onChooseAnother={() => setConflicts([])} onReplace={() => commit(Number(form.duration), true)} onCancel={() => setConflicts([])} />}</Modal>;
}

function Study() {
  const data = useData();
  const [, setTick] = useState(0);
  const [note, setNote] = useState('');
  const [selectedTask, setSelectedTask] = useState(() => new URLSearchParams(window.location.search).get('taskId') ?? '');
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<'focus' | 'stopwatch' | 'break'>(data.timer?.mode ?? 'focus');
  const [pageVisible, setPageVisible] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [focusRailOpen, setFocusRailOpen] = useState(false);
  const [stickyPanelOpen, setStickyPanelOpen] = useState(false);
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const [ambientPanelOpen, setAmbientPanelOpen] = useState(false);
  const [completionMessage, setCompletionMessage] = useState('');
  const finishingRef = useRef(false);
  const focusRef = useRef<HTMLElementTagNameMap['section']>(null);
  const focusRailRef = useRef<HTMLElementTagNameMap['aside']>(null);
  const focusRailToggleRef = useRef<HTMLButtonElement>(null);
  const focusRailCloseRef = useRef<HTMLButtonElement>(null);
  const taskPanelRef = useRef<HTMLDivElement>(null);
  const ambientPanelRef = useRef<HTMLDivElement>(null);
  const sidePanelCloseTimer = useRef<number | null>(null);
  const focusRailHoverCloseTimer = useRef<number | null>(null);
  const focusRailOpenedByHover = useRef(false);

  const cancelSidePanelClose = () => {
    if (sidePanelCloseTimer.current !== null) window.clearTimeout(sidePanelCloseTimer.current);
    sidePanelCloseTimer.current = null;
  };
  const scheduleSidePanelClose = () => {
    cancelSidePanelClose();
    sidePanelCloseTimer.current = window.setTimeout(() => {
      setTaskPanelOpen(false);
      setAmbientPanelOpen(false);
      sidePanelCloseTimer.current = null;
    }, 220);
  };
  const cancelFocusRailHoverClose = () => {
    if (focusRailHoverCloseTimer.current !== null) window.clearTimeout(focusRailHoverCloseTimer.current);
    focusRailHoverCloseTimer.current = null;
  };
  const scheduleFocusRailHoverClose = () => {
    if (!focusRailOpenedByHover.current) return;
    cancelFocusRailHoverClose();
    focusRailHoverCloseTimer.current = window.setTimeout(() => {
      focusRailOpenedByHover.current = false;
      setFocusRailOpen(false);
      setTaskPanelOpen(false);
      setAmbientPanelOpen(false);
      focusRailHoverCloseTimer.current = null;
    }, 320);
  };

  useEffect(() => {
    if (!focusRailOpen) return;
    if (!focusRailOpenedByHover.current) focusRailCloseRef.current?.focus();
    const closeOnOutsideTap = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (focusRailToggleRef.current?.contains(target) || focusRailRef.current?.contains(target) || taskPanelRef.current?.contains(target) || ambientPanelRef.current?.contains(target) || target.closest('.sticky-fullscreen-panel')) return;
      focusRailOpenedByHover.current = false;
      cancelFocusRailHoverClose();
      setFocusRailOpen(false);
      setTaskPanelOpen(false);
      setAmbientPanelOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      focusRailOpenedByHover.current = false;
      cancelFocusRailHoverClose();
      setFocusRailOpen(false);
      setTaskPanelOpen(false);
      setAmbientPanelOpen(false);
      requestAnimationFrame(() => focusRailToggleRef.current?.focus());
    };
    document.addEventListener('pointerdown', closeOnOutsideTap);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideTap);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [focusRailOpen]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (data.timer?.taskId && data.timer.startedAt && data.tasks.some((task) => task.id === data.timer?.taskId && isFocusRoomTask(task))) setSelectedTask(data.timer.taskId);
    if (data.timer?.mode) setSelectedMode(data.timer.mode);
  }, [data.timer?.taskId, data.timer?.mode]);
  useEffect(() => {
    if (data.timer?.taskId && data.tasks.some((task) => task.id === data.timer?.taskId && isFocusRoomTask(task))) return;
    const selectedIsOpen = data.tasks.some((task) => task.id === selectedTask && !task.done && isFocusRoomTask(task));
    if (selectedIsOpen) return;
    setSelectedTask(data.tasks.find((task) => !task.done && isFocusRoomTask(task))?.id ?? '');
  }, [data.tasks, data.timer?.taskId, selectedTask]);
  useEffect(() => { if (!data.timer) finishingRef.current = false; }, [data.timer]);
  useEffect(() => {
    if (!completionMessage) return;
    const timeout = window.setTimeout(() => setCompletionMessage(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [completionMessage]);
  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (focusRailRef.current?.contains(target) || taskPanelRef.current?.contains(target) || ambientPanelRef.current?.contains(target)) return;
      cancelSidePanelClose();
      setTaskPanelOpen(false);
      setAmbientPanelOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      cancelSidePanelClose();
    };
  }, []);
  useEffect(() => {
    const onVisibilityChange = () => setPageVisible(document.visibilityState === 'visible');
    const onFullscreenChange = () => {
      const active = document.fullscreenElement === focusRef.current;
      setFocusMode(active);
      if (!active) {
        setStickyPanelOpen(false);
        setTaskPanelOpen(false);
        setAmbientPanelOpen(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  const seconds = data.timerSeconds();
  const timerComplete = Boolean(data.timer && data.timer.mode !== 'stopwatch' && seconds >= data.timer.duration);
  const running = Boolean(data.timer?.startedAt) && !timerComplete;
  useEffect(() => {
    if (timerComplete && data.timer?.startedAt && !focusMode) {
      window.dispatchEvent(new Event('focusflow-timer-finished'));
      data.pauseTimer();
    }
  }, [timerComplete, data.timer?.startedAt, focusMode]);
  const focusTask = data.tasks.find((task) => task.id === data.timer?.taskId && isFocusRoomTask(task));
  const selectedFocusTask = data.tasks.find((task) => task.id === selectedTask && !task.done && isFocusRoomTask(task));
  const displayTask = focusTask ?? data.tasks.find((task) => task.id === selectedTask && isFocusRoomTask(task));
  const activeMode = data.timer?.mode ?? selectedMode;
  const initialSeconds = activeMode === 'stopwatch' ? 0 : activeMode === 'break' ? data.settings.breakMinutes * 60 : (selectedFocusTask?.estimate ?? data.settings.pomodoro) * 60;
  const timerDuration = data.timer?.duration ?? initialSeconds;
  const shownSeconds = data.timer ? activeMode === 'stopwatch' ? seconds : Math.max(0, timerDuration - seconds) : initialSeconds;
  const elapsedSeconds = data.timer ? activeMode === 'stopwatch' ? seconds : Math.min(seconds, timerDuration) : 0;
  const clockProgress = activeMode === 'stopwatch' ? (seconds % 60) / 60 : timerDuration > 0 ? Math.max(0, Math.min(1, elapsedSeconds / timerDuration)) : 0;
  const remainingSeconds = activeMode === 'stopwatch' ? 0 : Math.max(0, timerDuration - seconds);
  const openTasks = data.tasks.filter((task) => !task.done);
  const taskQueuePosition = displayTask ? openTasks.findIndex((task) => task.id === displayTask.id) + 1 : 0;
  const timerUrgency = timerComplete ? 'complete' : data.timer && activeMode !== 'stopwatch' && shownSeconds < 60 ? 'urgent' : data.timer && activeMode !== 'stopwatch' && shownSeconds < 300 ? 'warning' : 'calm';
  const environment = getStudyEnvironment(data.settings.environment);
  const saveNote = () => {
    if (!note.trim()) return;
    if (editingNote) data.updateNote(editingNote, note.trim());
    else data.addNote(note.trim());
    setNote('');
    setEditingNote(null);
  };
  const enterFocusMode = () => {
    setFocusRailOpen(false);
    setTaskPanelOpen(false);
    setAmbientPanelOpen(false);
    setFocusMode(true);
    const element = focusRef.current;
    if (element?.requestFullscreen) void element.requestFullscreen().catch(() => setFocusMode(true));
  };
  const exitFocusMode = () => {
    focusRailOpenedByHover.current = false;
    cancelFocusRailHoverClose();
    setFocusRailOpen(false);
    setTaskPanelOpen(false);
    setAmbientPanelOpen(false);
    if (document.fullscreenElement === focusRef.current) void document.exitFullscreen().catch(() => setFocusMode(false));
    else setFocusMode(false);
  };
  const startTimer = () => { setCompletionMessage(''); data.startTimer(selectedMode === 'break' ? undefined : selectedTask || undefined, selectedMode); };
  const finishSession = () => {
    if (!data.timer || finishingRef.current) return;
    finishingRef.current = true;
    const finished = data.timer;
    const currentTask = finished.taskId ? data.tasks.find((task) => task.id === finished.taskId && !task.done) : undefined;
    data.finishTimer();
    if (currentTask) {
      const nextTask = data.tasks.find((task) => !task.done && task.id !== currentTask.id);
      setSelectedTask(nextTask?.id ?? '');
      setSelectedMode('focus');
      setCompletionMessage(nextTask ? `${currentTask.title} complete. Next up: ${nextTask.title}.` : `${currentTask.title} complete. You’ve finished every open task.`);
    } else setCompletionMessage('Session finished.');
  };
  const startSelectedSession = () => {
    if (!data.timer || running || (data.timer.taskId === (selectedMode === 'break' ? undefined : selectedTask || undefined) && data.timer.mode === selectedMode)) return;
    if (window.confirm('Start a new session with this task and mode? The paused timer progress will be discarded.')) {
      setCompletionMessage('');
      data.startTimer(selectedMode === 'break' ? undefined : selectedTask || undefined, selectedMode);
    }
  };

  return <div className="page study-page">
    <PageHeading eyebrow="Focus room" title="Make some quiet progress." description="One window. One task. No performance required." />
    <div className="grid grid-2 study-workspace">
      <section ref={focusRef} className={cx('focus-card', !pageVisible && 'page-hidden', focusMode && 'focus-fullscreen', focusMode && focusRailOpen && 'focus-rail-open')} data-environment={data.settings.environment} data-urgency={focusMode ? timerUrgency : undefined}>
        <div className="focus-atmosphere" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
        <div className="focus-card-content">
          <div className="focus-mode-topline"><div className="eyebrow">{focusMode ? 'Focus mode' : 'Current session'} · {data.settings.environment}</div>{focusMode ? <div className="focus-music-slot" /> : <button className="soft-button focus-enter" onClick={enterFocusMode}><Maximize2 size={14} /> Enter Focus Mode</button>}</div>
          {focusMode && <button ref={focusRailToggleRef} type="button" className="focus-rail-notch" onPointerEnter={(event) => { if (event.pointerType !== 'mouse') return; focusRailOpenedByHover.current = true; cancelFocusRailHoverClose(); setFocusRailOpen(true); }} onPointerLeave={scheduleFocusRailHoverClose} onClick={() => { const shouldOpen = !focusRailOpen; focusRailOpenedByHover.current = false; cancelFocusRailHoverClose(); setFocusRailOpen(shouldOpen); if (!shouldOpen) { setTaskPanelOpen(false); setAmbientPanelOpen(false); } }} aria-label={focusRailOpen ? 'Close focus tools' : 'Open focus tools'} aria-expanded={focusRailOpen} aria-controls="focus-tools-rail"><ChevronRight size={15} /></button>}
          {focusMode && <aside ref={focusRailRef} id="focus-tools-rail" className="focus-side-rail" aria-label="Focus tools" aria-hidden={!focusRailOpen} inert={!focusRailOpen || undefined} onPointerEnter={cancelFocusRailHoverClose} onPointerLeave={scheduleFocusRailHoverClose} onMouseEnter={cancelSidePanelClose} onMouseLeave={scheduleSidePanelClose}>
            <button ref={focusRailCloseRef} type="button" className="focus-rail-close" onClick={() => { focusRailOpenedByHover.current = false; cancelFocusRailHoverClose(); setFocusRailOpen(false); setTaskPanelOpen(false); setAmbientPanelOpen(false); requestAnimationFrame(() => focusRailToggleRef.current?.focus()); }} aria-label="Hide focus tools"><ChevronLeft size={20} /></button>
            <button className={cx('focus-rail-button', taskPanelOpen && 'active')} onClick={() => { setTaskPanelOpen((open) => !open); setAmbientPanelOpen(false); }} title="Tasks" aria-label="Tasks"><ListChecks size={24} /><span>Tasks</span></button>
            <button className={cx('focus-rail-button', ambientPanelOpen && 'active')} onClick={() => { setAmbientPanelOpen((open) => !open); setTaskPanelOpen(false); }} title="Environment and ambience" aria-label="Environment and ambience"><Music2 size={24} /><span>Sound</span></button>
            <button className="focus-rail-button" onClick={() => setStickyPanelOpen(true)} title="Sticky Notes" aria-label="Sticky Notes"><StickyNoteIcon size={24} /><span>Sticky Notes</span></button>
            <button className="focus-rail-button" onClick={exitFocusMode} title="Exit Focus Mode" aria-label="Exit Focus Mode"><X size={24} /><span>Exit</span></button>
          </aside>}
          {focusMode && taskPanelOpen && <div ref={taskPanelRef} className="focus-rail-panel focus-task-panel" onPointerEnter={cancelFocusRailHoverClose} onPointerLeave={scheduleFocusRailHoverClose} onMouseEnter={cancelSidePanelClose} onMouseLeave={scheduleSidePanelClose}><label htmlFor="fullscreen-focus-task">Focus task</label><select id="fullscreen-focus-task" value={selectedTask} disabled={running || selectedMode === 'break'} onChange={(event) => setSelectedTask(event.target.value)}><option value="">{data.tasks.some(isFocusRoomTask) ? 'Open focus, no task attached' : 'No Study, Work, or Coding tasks yet'}</option>{data.tasks.filter(isFocusRoomTask).map((task) => <option key={task.id} value={task.id}>{task.title}{task.done ? ' · completed' : ''} · {task.estimate}m</option>)}</select>{data.timer && <span>Pause to choose another task. Starting a different task replaces this paused session after confirmation.</span>}</div>}
          {focusMode && <FocusStage selectedMode={selectedMode} setSelectedMode={setSelectedMode} selectedTask={selectedTask} setSelectedTask={setSelectedTask} onFinishSession={finishSession} />}
          <div className="focus-center-stage">
            <div className="focus-task-status-zone">
              {focusMode && <div className="focus-session-kicker"><span>Focus session {String(data.sessions.length + 1).padStart(2, '0')}</span>{displayTask && taskQueuePosition > 0 && <span className="focus-queue-position">Task {String(taskQueuePosition).padStart(2, '0')} of {String(openTasks.length).padStart(2, '0')}</span>}</div>}
              <div className="focus-task">{displayTask?.title ?? 'Ready to focus?'}</div>
              {focusMode && displayTask && <div className="focus-task-meta">{displayTask.category}{displayTask.projectId && data.projects.find((project) => project.id === displayTask.projectId) ? ` · ${data.projects.find((project) => project.id === displayTask.projectId)?.name}` : ''}</div>}
              <div className="focus-copy">{displayTask ? (timerComplete ? 'Time is up. Finish to save this session and complete the linked task.' : activeMode === 'break' ? 'Step away. Your focus will be here when you return.' : activeMode === 'stopwatch' ? 'Count up as long as the work is useful.' : 'Focus on this task, one step at a time.') : 'Choose a task and start your next session.'}</div>
              {focusMode && displayTask && <div className="focus-motivation">One task. One session.</div>}
              {focusMode && !displayTask && <button className="primary-button focus-choose-task" onClick={() => { setTaskPanelOpen(true); setAmbientPanelOpen(false); }}><ListChecks size={15} /> Choose Your Next Task</button>}
              {focusMode && displayTask && taskQueuePosition > 0 && <div className="focus-task-queue-track" role="progressbar" aria-label="Task queue position" aria-valuemin={0} aria-valuemax={openTasks.length} aria-valuenow={taskQueuePosition}><span style={{ width: `${taskQueuePosition / openTasks.length * 100}%` }} /></div>}
            </div>
            <div className="focus-timer-zone">
              {focusMode && <div className={cx('focus-clock-wrap', timerComplete && 'is-complete')} aria-label={`${activeMode === 'stopwatch' ? 'Elapsed' : 'Remaining'} time ${prettyTime(shownSeconds)}`}><svg className="focus-clock" viewBox="0 0 220 220" role="progressbar" aria-label={activeMode === 'stopwatch' ? 'Elapsed minute progress' : 'Session elapsed progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clockProgress * 100)}><circle className="focus-clock-track" cx="110" cy="110" r="96" /><circle className="focus-clock-progress" cx="110" cy="110" r="96" style={{ strokeDashoffset: 603.19 * (1 - clockProgress) }} /></svg><div className="focus-clock-time"><strong>{prettyTime(shownSeconds)}</strong><span>{timerComplete ? 'COMPLETE' : activeMode === 'stopwatch' ? 'ELAPSED' : 'REMAINING'}</span></div></div>}
              {focusMode && <div className="focus-session-progress">
                <div className="focus-session-progress-track" role="progressbar" aria-label={activeMode === 'stopwatch' ? 'Elapsed minute progress' : 'Session elapsed progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clockProgress * 100)}><span style={{ width: `${clockProgress * 100}%` }} /></div>
                <div className="focus-session-progress-labels"><span>{activeMode === 'stopwatch' ? `Elapsed ${prettyTime(elapsedSeconds)}` : `Elapsed ${prettyTime(elapsedSeconds)}`}</span><span>{activeMode === 'stopwatch' ? '60 sec cycle' : timerComplete ? 'Time is up' : `${prettyTime(remainingSeconds)} left`}</span></div>
              </div>}
            </div>
            <div className={cx('timer', focusMode && 'focus-timer-large')}>{prettyTime(shownSeconds)}</div>
            <div className="focus-controls-zone">
              <div className="timer-actions">{running ? <button className={cx(focusMode ? 'primary-button' : 'soft-button', focusMode && 'focus-icon-action')} onClick={() => data.pauseTimer()} data-testid="button-pause-timer"><Pause size={14} /> Pause</button> : data.timer ? <><button className={cx('primary-button', focusMode && 'focus-icon-action')} onClick={timerComplete ? finishSession : () => data.startTimer(data.timer?.taskId, data.timer?.mode)} data-testid="button-resume-timer">{timerComplete ? <Check size={14} /> : <Play size={14} />} {timerComplete ? "Finish task" : "Resume"}</button>{(selectedTask !== (data.timer.taskId ?? '') || selectedMode !== data.timer.mode) && <button className={cx('soft-button', focusMode && 'focus-icon-action')} onClick={startSelectedSession}><Play size={14} /> Start selected session</button>}</> : <button className={cx('primary-button', focusMode && 'focus-icon-action')} onClick={startTimer} data-testid="button-start-timer"><Play size={14} /> Start {selectedMode === 'stopwatch' ? 'stopwatch' : selectedMode === 'break' ? 'break' : 'focus'}</button>}{data.timer && <><button className={cx('soft-button', focusMode && 'focus-add-time')} onClick={data.addFiveMinutes} aria-label="Add 5 minutes" title="Add 5 minutes" data-testid="button-add-five-minutes"><Plus size={14} /> +5 min</button><button className={cx('soft-button', focusMode && 'focus-icon-action')} onClick={finishSession} data-testid="button-finish-timer"><Check size={14} /> Finish</button><button className={cx('soft-button', focusMode && 'focus-icon-action')} onClick={() => data.resetTimer()} data-testid="button-reset-timer" aria-label="Reset timer"><RotateCcw size={14} /> Reset</button></>}</div>
              {focusMode && <div className="fullscreen-tools"><div className="focus-mode-picker" role="group" aria-label="Timer mode"><button className={cx(selectedMode === 'focus' && 'selected')} disabled={running} onClick={() => setSelectedMode('focus')}>Pomodoro</button><button className={cx(selectedMode === 'stopwatch' && 'selected')} disabled={running} onClick={() => setSelectedMode('stopwatch')}>Stopwatch</button><button className={cx(selectedMode === 'break' && 'selected')} disabled={running} onClick={() => setSelectedMode('break')}>Break</button></div><span className="fullscreen-duration">{selectedMode === 'break' ? data.settings.breakMinutes : data.settings.pomodoro} min</span></div>}
              {completionMessage && !data.timer && <p className="focus-completion-message" role="status">{completionMessage}</p>}
            </div>
            {completionMessage && !data.timer && <p className="focus-completion-message" role="status">{completionMessage}</p>}
          </div>
          <div ref={ambientPanelRef} className={cx('focus-ambient-panel', focusMode && 'focus-rail-panel focus-sound-panel', focusMode && !ambientPanelOpen && 'focus-ambient-panel-hidden')} onPointerEnter={cancelFocusRailHoverClose} onPointerLeave={scheduleFocusRailHoverClose} onMouseEnter={cancelSidePanelClose} onMouseLeave={scheduleSidePanelClose}>
            {focusMode && <EnvironmentPicker selected={data.settings.environment} onSelect={(selectedEnvironment) => data.updateSettings({ environment: selectedEnvironment })} />}
            <AmbientAudioControls environment={environment} />
          </div>
          {focusMode && stickyPanelOpen && <StickyWorkspace fullscreen onClose={() => setStickyPanelOpen(false)} />}
        </div>
      </section>
      <section className="grid study-controls" style={{ alignContent: 'start' }}>
        <div className="card"><div className="card-title"><div><div className="eyebrow">Timer mode</div><h2 className="section-title">Choose your pace</h2></div><Clock3 size={18} color="var(--coral)" /></div><div className="date-nav" style={{ marginBottom: 14 }}><button className={cx(selectedMode === 'focus' ? 'primary-button' : 'soft-button')} disabled={running} onClick={() => setSelectedMode('focus')} data-testid="button-mode-pomodoro">Pomodoro</button><button className={cx(selectedMode === 'stopwatch' ? 'primary-button' : 'soft-button')} disabled={running} onClick={() => setSelectedMode('stopwatch')} data-testid="button-mode-stopwatch">Stopwatch</button><button className={cx(selectedMode === 'break' ? 'primary-button' : 'soft-button')} disabled={running} onClick={() => setSelectedMode('break')} data-testid="button-mode-break">Break</button></div><select value={selectedTask} disabled={running || selectedMode === 'break'} onChange={(event) => setSelectedTask(event.target.value)} className="field input" style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: 10, background: 'var(--card)', fontSize: 12 }} data-testid="select-focus-task"><option value="">{data.tasks.some(isFocusRoomTask) ? 'Open focus, no task attached' : 'No Study, Work, or Coding tasks yet'}</option>{data.tasks.filter(isFocusRoomTask).map((task) => <option key={task.id} value={task.id}>{task.title}{task.done ? ' · completed' : ''} · {task.estimate}m</option>)}</select><p className="tiny" style={{ marginTop: 12 }}>{selectedMode === 'stopwatch' ? 'Stopwatch has no cap.' : selectedMode === 'break' ? `Breaks are ${data.settings.breakMinutes} minutes.` : `Pomodoro is ${data.settings.pomodoro} minutes.`} Adjust defaults in Settings.{data.timer ? ' Pause the timer to choose another task or mode; start a selected session to replace this paused one.' : ''}</p></div>
        <div className="card study-environment-panel"><div className="card-title"><div><div className="eyebrow">Study environment</div><h2 className="section-title">Choose your atmosphere</h2></div><Sparkles size={18} color="var(--coral)" /></div><EnvironmentPicker selected={data.settings.environment} onSelect={(selectedEnvironment) => data.updateSettings({ environment: selectedEnvironment })} /></div>
      </section>
    </div>
    <StickyWorkspace />
    <section className="card quick-notes" style={{ marginTop: 18 }}><div className="card-title"><div><div className="eyebrow">Quick notes</div><h2 className="section-title">Leave a breadcrumb</h2></div><span className="tiny">{data.notes.filter((item) => item.date === dateKey()).length} today</span></div><div className="quick-note-entry"><input value={note} onChange={(event) => setNote(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && saveNote()} placeholder="A thought worth keeping..." aria-label="Quick note" data-testid="input-study-note" /><button className="primary-button" onClick={saveNote} data-testid="button-save-note">{editingNote ? 'Update' : 'Add note'}</button></div><div className="notes-list">{data.notes.slice(0, 6).map((item) => <div className="note-row" key={item.id}><p>{item.text}<br /><span className="tiny">{formatDate(item.date)}</span></p><span style={{ display: 'flex', gap: 5 }}><button className="icon-button" onClick={() => { setEditingNote(item.id); setNote(item.text); }} aria-label="Edit note" data-testid={`button-edit-note-${item.id}`}><Pencil size={13} /></button><button className="icon-button" onClick={() => data.deleteNote(item.id)} aria-label={`Delete ${item.text}`} data-testid={`button-delete-note-${item.id}`}><Trash2 size={13} /></button></span></div>)}</div>{!data.notes.length && <p className="tiny">Notes made here stay private in this browser.</p>}</section>
  </div>;
}

function EnvironmentPicker({ selected, onSelect }: { selected: string; onSelect: (environment: string) => void }) {
  return <div className="environment-grid" role="group" aria-label="Study environments">{studyEnvironments.map((environment) => <button type="button" className={cx('env-option', selected === environment.name && 'active')} key={environment.name} onClick={() => onSelect(environment.name)} aria-pressed={selected === environment.name} data-testid={`button-environment-${environment.name.toLowerCase().replaceAll(' ', '-')}`}><span className="env-preview" style={{ '--environment-color': environment.color } as CSSProperties}><span /></span><strong>{environment.name}</strong><span className="env-description">{environment.description}</span></button>)}</div>}

function AmbientAudioControls({ environment }: { environment: typeof studyEnvironments[number] }) {
  const data = useData();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const [status, setStatus] = useState<'paused' | 'loading' | 'playing' | 'error' | 'unavailable'>('paused');
  const [error, setError] = useState('');
  const enabled = data.settings.ambientEnabled;
  const volume = Math.min(0.6, data.settings.ambientVolume / 100 * 0.6);
  const liveAudioPrefs = useRef({ volume, muted: data.settings.ambientMuted });
  liveAudioPrefs.current = { volume, muted: data.settings.ambientMuted };

  const stopFade = () => {
    if (fadeRef.current !== null) cancelAnimationFrame(fadeRef.current);
    fadeRef.current = null;
  };
  const prepareAudio = (asset: string) => {
    const audio = new Audio(asset);
    audio.loop = true;
    audio.preload = 'auto';
    audio.dataset.asset = asset;
    audio.volume = data.settings.ambientMuted ? 0 : volume;
    audio.addEventListener('error', () => {
      if (audioRef.current === audio) {
        audioRef.current = null;
        audio.pause();
        setStatus('error');
        setError('This ambient file could not be loaded. The visual environment is still available.');
      }
    }, { once: true });
    return audio;
  };
  const startAudio = (asset: string, fromClick: boolean) => {
    const generation = ++generationRef.current;
    stopFade();
    const previous = audioRef.current;
    const next = prepareAudio(asset);
    if (fromClick) next.volume = data.settings.ambientMuted ? 0 : volume;
    else next.volume = 0;
    setStatus('loading');
    setError('');
    void next.play().then(() => {
      if (generation !== generationRef.current) {
        next.pause();
        return;
      }
      audioRef.current = next;
      data.updateSettings({ ambientEnabled: true });
      setStatus('playing');
      if (fromClick || !previous) return;
      const startAt = performance.now();
      const previousVolume = previous.volume;
      const fade = (now: number) => {
        if (generation !== generationRef.current) return;
        const progress = Math.min(1, (now - startAt) / 650);
        next.volume = liveAudioPrefs.current.muted ? 0 : liveAudioPrefs.current.volume * progress;
        previous.volume = previousVolume * (1 - progress);
        if (progress < 1) fadeRef.current = requestAnimationFrame(fade);
        else {
          previous.pause();
          previous.src = '';
          fadeRef.current = null;
        }
      };
      fadeRef.current = requestAnimationFrame(fade);
    }).catch(() => {
      next.pause();
      if (previous) {
        previous.pause();
        previous.src = '';
      }
      if (audioRef.current === previous) audioRef.current = null;
      data.updateSettings({ ambientEnabled: false });
      setStatus('error');
      setError('Ambient audio could not start. Press play to allow it in this browser.');
    });
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = data.settings.ambientMuted ? 0 : volume;
  }, [data.settings.ambientMuted, data.settings.ambientVolume]);
  useEffect(() => {
    if (!enabled) {
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.src = '';
      audioRef.current = null;
      setStatus((current) => current === 'error' ? 'error' : environment.asset ? 'paused' : 'unavailable');
      return;
    }
    if (!environment.asset) {
      generationRef.current++;
      stopFade();
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.src = '';
      audioRef.current = null;
      data.updateSettings({ ambientEnabled: false });
      setStatus('unavailable');
      setError('No verified licensed audio file is configured for this environment.');
      return;
    }
    if (audioRef.current?.dataset.asset !== environment.asset) startAudio(environment.asset, false);
  }, [environment.asset, enabled]);
  useEffect(() => () => {
    generationRef.current++;
    stopFade();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  }, []);

  const toggle = () => {
    if (!environment.asset) return;
    if (enabled) {
      generationRef.current++;
      stopFade();
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.src = '';
      audioRef.current = null;
      data.updateSettings({ ambientEnabled: false });
      setStatus('paused');
      return;
    }
    startAudio(environment.asset, true);
  };

  const unavailable = !environment.asset;
  return <div className="ambient-controls" aria-label="Ambient audio controls"><div className="ambient-control-head"><div><strong>{environment.soundtrack}</strong><span>{unavailable ? 'Licensed recording not added yet' : status === 'playing' ? 'Playing separately from YouTube' : status === 'loading' ? 'Loading ambience…' : 'Separate from YouTube MusicDock'}</span></div><button type="button" className={enabled ? 'soft-button' : 'primary-button'} disabled={unavailable || status === 'loading'} onClick={toggle} aria-label={enabled ? 'Pause ambient audio' : 'Play ambient audio'}>{enabled ? <><Pause size={14} /> Pause</> : unavailable ? 'Unavailable' : <><Play size={14} /> Play ambience</>}</button></div><div className="ambient-volume-row"><button type="button" className="icon-button" aria-label={data.settings.ambientMuted ? 'Unmute ambient sound' : 'Mute ambient sound'} onClick={() => data.updateSettings({ ambientMuted: !data.settings.ambientMuted })}>{data.settings.ambientMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button><label htmlFor="ambient-volume">Ambient level</label><input id="ambient-volume" type="range" min="0" max="100" value={data.settings.ambientVolume} onChange={(event) => data.updateSettings({ ambientVolume: Number(event.target.value) })} aria-label="Ambient volume" /><span>{data.settings.ambientVolume}%</span></div><p className={cx('ambient-error', status === 'playing' && 'ambient-success')} role="status">{error || (unavailable ? 'The audio file for this environment is missing.' : status === 'loading' ? 'Preparing ambient track…' : status === 'playing' ? 'Ambient audio is playing.' : '')}</p></div>;
}

type WorkoutExercise = WorkoutPlanExercise;
type LibraryExercise = Pick<WorkoutExercise, 'id' | 'name' | 'category'>;

function Workout() {
  const data = useData();

  const [showLibrary, setShowLibrary] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<LibraryExercise | null>(null);
  const [activeWorkout, setActiveWorkout] = useState(false);
  const [workoutStartIndex, setWorkoutStartIndex] = useState(0);
  const [allExercisesCompleted, setAllExercisesCompleted] = useState(false);

  const today = dateKey();
  const todayExercises = data.exercises.filter((item) => item.date === today);

  const [customExercise, setCustomExercise] = useState({
    name: '',
    category: 'Core',
  });

  const scheduledWorkouts = workoutSchedules(data).filter((session) => session.date >= localDateKey() || !session.completed || session.id === data.activeWorkoutScheduleId);
  const activePlanId = data.activeWorkoutScheduleId === 'default' ? 'default' : data.activeWorkoutScheduleId && scheduledWorkouts.some((session) => session.id === data.activeWorkoutScheduleId)
    ? data.activeWorkoutScheduleId
    : scheduledWorkouts[0]?.id ?? 'default';
  const workoutPlan = data.workoutPlans[activePlanId] ?? (activePlanId === 'default' ? data.workoutPlan : []);
  const selectedWorkout = scheduledWorkouts.find((session) => session.id === activePlanId);
  const [showProjects, setShowProjects] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  const exerciseLibrary: LibraryExercise[] = [
    {
      id: 'pushups',
      name: 'Push-ups',
      category: 'Upper Body',
    },
    {
      id: 'squats',
      name: 'Squats',
      category: 'Lower Body',
    },
    {
      id: 'lunges',
      name: 'Lunges',
      category: 'Lower Body',
    },
    {
      id: 'jumping-jacks',
      name: 'Jumping Jacks',
      category: 'Cardio',
    },
    {
      id: 'plank',
      name: 'Plank',
      category: 'Core',
    },
    {
      id: 'crunches',
      name: 'Crunches',
      category: 'Core',
    },
    {
      id: 'bicycle-crunches',
      name: 'Bicycle Crunches',
      category: 'Core',
    },
    {
      id: 'leg-raises',
      name: 'Leg Raises',
      category: 'Core',
    },
    {
      id: 'mountain-climbers',
      name: 'Mountain Climbers',
      category: 'Cardio',
    },
    {
      id: 'high-knees',
      name: 'High Knees',
      category: 'Cardio',
    },
    {
      id: 'burpees',
      name: 'Burpees',
      category: 'Full Body',
    },
    {
      id: 'glute-bridge',
      name: 'Glute Bridge',
      category: 'Lower Body',
    },
    {
      id: 'calf-raises',
      name: 'Calf Raises',
      category: 'Lower Body',
    },
    {
      id: 'wall-sit',
      name: 'Wall Sit',
      category: 'Lower Body',
    },
  ];
  const addExerciseToPlan = (exercise: LibraryExercise) => {
  setSelectedExercise({
    ...exercise,
  });
 };
  const configureExercise = (mode: 'timed' | 'untimed', value: number) => {
  const target = Number(value);
  if (!selectedExercise || !Number.isFinite(target) || target <= 0) return;

  const configured: WorkoutExercise = {
    ...selectedExercise,
    mode,
    target,
    completed: false,
  };

  data.updateWorkoutPlan((current) => [
    ...current,
    configured,
  ], activePlanId);

  setSelectedExercise(null);
 };

  const removeFromPlan = (index: number) => {
    data.updateWorkoutPlan((current) => current.filter((_, i) => i !== index), activePlanId);
  };
  const saveWorkoutProject = (event: FormEvent) => {
  event.preventDefault();

  const name = projectName.trim();

  if (!name || workoutPlan.length === 0) return;

  const workoutExercises = workoutPlan.map((exercise) => ({
    id: exercise.id, name: exercise.name, category: exercise.category,
    mode: exercise.mode ?? 'untimed', target: Number(exercise.target),
  })).filter((exercise) => Number.isFinite(exercise.target) && exercise.target > 0);
  if (!workoutExercises.length) return;

  if (editingProjectId) data.updateProject(editingProjectId, {
    workoutExercises, description: `${workoutExercises.length} exercise workout`,
  }); else data.addProject({
    name,
    description: `${workoutPlan.length} exercise workout`,
    deadline: '',
    priority: 'medium',
    status: 'active',
    type: 'workout',
    workoutExercises,
  });

  setProjectName('');
  setShowCreateProject(false);
  setEditingProjectId(null);
 };
  const startProject = (project: Project) => {
  if (
    project.type !== 'workout' ||
    !project.workoutExercises?.length
  ) {
    return;
  }

  const plan: WorkoutExercise[] = project.workoutExercises.map(
    (exercise) => ({
      ...exercise,
      completed: false,
    }),
  );

  data.updateWorkoutPlan(plan, activePlanId);
  setActiveProjectId(project.id);
  setShowProjects(false);
  };
  const deleteWorkoutProject = (projectId: string) => {
  data.deleteProject(projectId);

  if (activeProjectId === projectId) {
    setActiveProjectId(null);
  }
 };
 const editWorkoutProject = (project: Project) => {
   if (!project.workoutExercises?.length) return;
   data.updateWorkoutPlan(project.workoutExercises.map((exercise) => ({ ...exercise, completed: false })), activePlanId);
   setEditingProjectId(project.id);
   setProjectName(project.name);
   setShowProjects(false);
 };

  const createCustomExercise = (event: FormEvent) => {
    event.preventDefault();

    if (!customExercise.name.trim()) return;

    const newExercise: LibraryExercise = {
      id: `custom-${Date.now()}`,
      name: customExercise.name.trim(),
      category: customExercise.category,
    };

    setSelectedExercise(newExercise);
    setShowCustom(false);
    setCustomExercise({
      name: '',
      category: 'Core',
    });
  };

  const startWorkout = () => {
    if (!workoutPlan.length) return;

    const firstIncompleteIndex = workoutPlan.findIndex((exercise) => !exercise.completed);
    if (firstIncompleteIndex === -1) {
      setAllExercisesCompleted(true);
      return;
    }

    setAllExercisesCompleted(false);
    setWorkoutStartIndex(firstIncompleteIndex);
    setActiveWorkout(true);
  };

  if (activeWorkout) {
    return (
      <WorkoutSession
        exercises={workoutPlan}
        initialIndex={workoutStartIndex}
        onExerciseComplete={(_exercise, index) => {
          data.updateWorkoutPlan((current) => current.map((item, itemIndex) =>
            itemIndex === index ? { ...item, completed: true } : item,
          ), activePlanId);
        }}
        onFinish={() => {
          setActiveWorkout(false);
          if (selectedWorkout?.activity) data.updateActivity(selectedWorkout.activity.id, { completed: true });
          if (selectedWorkout?.task) data.updateTask(selectedWorkout.task.id, { done: true, completedAt: new Date().toISOString() });
          data.completeWorkoutDay(today);
          setAllExercisesCompleted(true);
        }}
        onExit={() => setActiveWorkout(false)}
      />
    );
  }

  return (
    <div className="page">

      <PageHeading
        eyebrow="Body break"
        title="Move, then keep moving."
        description="Build a workout, start when you're ready, and let Do-Fo-Done guide you through it."
        action={
          <div style={{display:'flex',gap:8}}>
            <button
              className="soft-button"
              onClick={()=> setShowProjects(true)}
              >
                <FolderKanban size={15}/>
                Projects
            </button>
            <button
              className="primary-button"
              onClick={() => setShowLibrary(true)}
            >
              <Plus size={15} />
              Add exercise
            </button>
          </div>
        }
      />

      {/* WORKOUT BUILDER */}
      <section className="card">
          <div className="card-title">
            <div>
              <div className="eyebrow">Today's workout</div>

              <h2 className="section-title">
                {workoutPlan.length
                  ? `${workoutPlan.length} exercises`
                  : 'Build your session'}
              </h2>
            </div>

            {workoutPlan.length > 0 && (
              <span className="tag sky">
                Ready
              </span>
            )}
          </div>

          {allExercisesCompleted && (
            <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12, padding: '11px 13px', borderRadius: 10, background: 'var(--mint)', color: 'var(--mint-ink)' }}>
              <span>Workout completed.</span>
              <button
                className="soft-button"
                onClick={() => {
                  data.updateWorkoutPlan((current) => current.map((exercise) => ({ ...exercise, completed: false })), activePlanId);
                  setAllExercisesCompleted(false);
                }}
              >
                Reset workout
              </button>
            </div>
          )}

          {workoutPlan.length > 0 ? (
            <>
              <div
                style={{
                  display: 'grid',
                  gap: 8,
                  marginTop: 14,
                }}
              >
                {workoutPlan.map((exercise, index) => (
                  <div
                    key={`${exercise.id}-${index}`}
                    className={cx('schedule-item', exercise.completed && 'done')}
                    style={{
                      borderLeftColor: 'var(--coral)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <span
                        className="eyebrow"
                        style={{ minWidth: 22 }}
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          {exercise.completed
                            ? <Check size={14} color="var(--mint-ink)" aria-label="Completed" />
                            : <Circle size={14} color="var(--ink-soft)" aria-label="Not completed" />}
                          <p style={{ textDecoration: exercise.completed ? 'line-through' : 'none' }}>{exercise.name}</p>
                        </div>

                        <span>
                            {exercise.mode === 'timed'
                            ? `${exercise.target} seconds`
                            : `${exercise.target} reps · No timer`}
                         </span>
                        {editingProjectId && <div style={{ display: 'flex', gap: 6, marginTop: 6 }}><select aria-label={`Mode for ${exercise.name}`} value={exercise.mode} onChange={(event) => data.updateWorkoutPlan((items) => items.map((item, i) => i === index ? { ...item, mode: event.target.value as 'timed' | 'untimed' } : item), activePlanId)}><option value="untimed">Reps</option><option value="timed">Timed</option></select><input aria-label={`Target for ${exercise.name}`} type="number" min="1" step="1" value={exercise.target} style={{ width: 72 }} onChange={(event) => { const target = Number(event.target.value); if (Number.isFinite(target) && target > 0) data.updateWorkoutPlan((items) => items.map((item, i) => i === index ? { ...item, target } : item), activePlanId); }} /></div>}
                      </div>
                    </div>

                    <button
                      className="icon-button"
                      onClick={() => removeFromPlan(index)}
                      aria-label={`Remove ${exercise.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginTop: 14,
                  flexWrap: 'wrap',
                }}
              >
                <button
                  className="soft-button"
                  onClick={() => setShowLibrary(true)}
                >
                  <Plus size={14} />
                  Add more
                </button>

                <button
                  className="soft-button"
                  onClick={() =>
                    setShowCreateProject(true)}>
                  <FolderPlus size={15} />
                   {editingProjectId ? 'Update Project' : 'Save as Project'}
                </button>
                <button
                  className="primary-button"
                  onClick={startWorkout}
                  >
                    <Play size={14}/>
                    Start workout
                  </button>
              </div>

            </>
          ) : (
            <Empty
              icon={Dumbbell}
              title="Build your workout"
              text="Choose exercises, set your reps or time, and start your session."
              action={
                <button
                  className="primary-button"
                  onClick={() => setShowLibrary(true)}
                >
                  <Plus size={14} />
                  Choose exercises
                </button>
              }
            />
          )}
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-title"><div><div className="eyebrow">Scheduled sessions</div><h2 className="section-title">Your upcoming workouts</h2></div><CalendarDays size={18} color="var(--coral)" /></div>
        {scheduledWorkouts.length ? <div className="grid grid-2" style={{ marginTop: 12 }}>
          {scheduledWorkouts.map((session) => <div className="schedule-item" key={session.id} style={{ alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}><p style={{ textDecoration: session.completed ? 'line-through' : 'none' }}>{session.title}</p><span>{session.date === localDateKey() ? 'Today' : formatDate(session.date)}{session.start ? ` · ${session.start}` : ' · time not set'} · {session.duration}m{timeUntilWorkout(session) ? ` · ${timeUntilWorkout(session)}` : ''}</span><span className="tiny" style={{ display: 'block', marginTop: 4 }}>{session.planConfigured ? 'Workout plan configured' : 'No workout plan yet'} · {session.completed ? 'Completed' : 'Planned'}</span></div>
            <button className={session.planConfigured ? 'soft-button' : 'primary-button'} onClick={() => { data.setActiveWorkoutSchedule(session.id); setAllExercisesCompleted(false); if (!session.planConfigured) setShowLibrary(true); }} data-testid={`button-workout-plan-${session.id}`}>{session.planConfigured ? 'View Workout Plan' : 'Add Workout Plan'}</button>
          </div>)}
        </div> : <Empty icon={Dumbbell} title="No gym sessions scheduled" text="Add a Workout task or schedule a Workout activity; it will appear here automatically." />}
        {data.workoutPlans.default?.length > 0 && <div className="stat-line" style={{ marginTop: 12 }}><span className="tiny">Unscheduled workout plan · {data.workoutPlans.default.length} exercises</span><button className="soft-button" onClick={() => data.setActiveWorkoutSchedule('default')}>View plan</button></div>}
      </section>



      <div className="grid grid-2 workout-wellbeing-grid">
        <Hydration />
        <BmiCalculator />
      </div>

      {/* EXISTING LOG */}
      <section
        className="card"
        style={{ marginTop: 16 }}
      >
        <div className="card-title">
          <div>
            <div className="eyebrow">Training log</div>

            <h2 className="section-title">
              {todayExercises.length
                ? `${todayExercises.filter((e) => e.completed).length} of ${todayExercises.length} checked`
                : 'Completed exercises'}
            </h2>
          </div>
        </div>

        {todayExercises.length ? (
          <div
            className="grid grid-2"
            style={{ marginTop: 12 }}
          >
            {todayExercises.map((exercise) => (
              <ExerciseRow
                key={exercise.id}
                exercise={exercise}
              />
            ))}
          </div>
        ) : (
          <p
            className="tiny"
            style={{ marginTop: 12 }}
          >
            Completed workout exercises will appear here.
          </p>
        )}
      </section>

      {/* EXERCISE LIBRARY */}
      {showLibrary && (
        <Modal
          title="Choose an exercise"
          subtitle="Build your workout one exercise at a time."
          onClose={() => setShowLibrary(false)}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 8,
            }}
          >
            {exerciseLibrary.map((exercise) => (
              <button
                key={exercise.id}
                className="soft-button"
                style={{
                  minHeight: 72,
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  display: 'block',
                }}
                onClick={() => addExerciseToPlan(exercise)}
              >
                <strong>{exercise.name}</strong>

                <span
                  className="tiny"
                  style={{
                    display: 'block',
                    marginTop: 4,
                  }}
                >
                  {exercise.category}
                </span>
              </button>
            ))}
          </div>

          <div
            style={{
              marginTop: 14,
              borderTop: '1px solid var(--line)',
              paddingTop: 14,
            }}
          >
            <button
              className="primary-button"
              onClick={() => {
                setShowLibrary(false);
                setShowCustom(true);
              }}
            >
              <Plus size={14} />
              Create custom exercise
            </button>
          </div>
        </Modal>
      )}

      {/* EXERCISE CONFIGURATION */}
      {selectedExercise && (
        <ExerciseConfiguration
          exercise={selectedExercise}
          onClose={() => setSelectedExercise(null)}
          onConfigure={configureExercise}
        />
      )}

      {/* CUSTOM EXERCISE */}
      {showCustom && (
        <Modal
          title="Create exercise"
          subtitle="Add your own movement to Do-Fo-Done."
          onClose={() => setShowCustom(false)}
        >
          <form onSubmit={createCustomExercise}>
            <div className="form-grid">

              <Field label="Exercise" full>
                <input
                  autoFocus
                  value={customExercise.name}
                  onChange={(event) =>
                    setCustomExercise({
                      ...customExercise,
                      name: event.target.value,
                    })
                  }
                  placeholder="e.g. Diamond push-ups"
                />
              </Field>

              <Field label="Category" full>
                <select
                  value={customExercise.category}
                  onChange={(event) =>
                    setCustomExercise({
                      ...customExercise,
                      category: event.target.value,
                    })
                  }
                >
                  <option>Core</option>
                  <option>Upper Body</option>
                  <option>Lower Body</option>
                  <option>Full Body</option>
                  <option>Cardio</option>
                </select>
              </Field>

            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="soft-button"
                onClick={() => setShowCustom(false)}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-button"
              >
                Create exercise
              </button>
            </div>
          </form>
        </Modal>
      )}
      {showCreateProject && <Modal title={editingProjectId ? 'Update workout project' : 'Save workout project'} subtitle="Reuse this workout whenever you need it." onClose={() => { setShowCreateProject(false); setEditingProjectId(null); }}><form onSubmit={saveWorkoutProject}><Field label="Project name" full><input autoFocus value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Six Pack Beginner" /></Field><div className="modal-footer"><button type="button" className="soft-button" onClick={() => { setShowCreateProject(false); setEditingProjectId(null); }}>Cancel</button><button type="submit" className="primary-button">{editingProjectId ? 'Update Project' : 'Save as Project'}</button></div></form></Modal>}
      {showProjects && <Modal title="Workout Projects" subtitle="Saved workout plans you can reuse." onClose={() => setShowProjects(false)}>{data.projects.filter((project) => project.type === 'workout').length ? <div className="grid" style={{ gap: 10 }}>{data.projects.filter((project) => project.type === 'workout').map((project) => <div className="schedule-item" key={project.id}><div><p>{project.name}</p><span>{project.workoutExercises?.length ?? 0} exercises</span></div><div style={{ display: 'flex', gap: 5 }}><button className="soft-button" onClick={() => startProject(project)}><Play size={13} /> Start</button><button className="icon-button" onClick={() => editWorkoutProject(project)} aria-label={`Edit ${project.name}`}><Pencil size={13} /></button><button className="icon-button" onClick={() => deleteWorkoutProject(project.id)} aria-label={`Delete ${project.name}`}><Trash2 size={13} /></button></div></div>)}</div> : <Empty icon={FolderKanban} title="No workout projects" text="Build a workout and save it as a project to reuse it anytime." />}</Modal>}
    </div>
  );
}

export function Hydration() {
  const data = useData();

  const today = dateKey();

  // Existing Do-Fo-Done water values are stored as 250 ml servings per day.
  const [goalMl, setGoalMl] = useState(data.settings.waterGoal);

  // Amount added each time
  const [addAmount, setAddAmount] = useState(250);

  // Unit used for setting the goal
  const [goalUnit, setGoalUnit] = useState<'ml' | 'litres' | 'glasses'>(
    'litres'
  );

  // Glass size when using glasses
  const [glassSize, setGlassSize] = useState(250);

  /*
   * Water is persisted in the existing date-keyed store as millilitres.
   */
  const waterMl = data.water[today] ?? 0;

  const percentage = useMemo(() => {
    if (goalMl <= 0) return 0;

    return Math.min(100, Math.round((waterMl / goalMl) * 100));
  }, [waterMl, goalMl]);

  const remainingMl = Math.max(goalMl - waterMl, 0);

  const updateGoalMl = (nextGoalMl: number) => {
    setGoalMl(nextGoalMl);
    data.updateSettings({ waterGoal: nextGoalMl });
  };

  const displayGoal = useMemo(() => {
    if (goalUnit === 'litres') {
      return `${(goalMl / 1000).toFixed(goalMl % 1000 === 0 ? 0 : 1)} L`;
    }

    if (goalUnit === 'glasses') {
      return `${Math.round(goalMl / glassSize)} glasses`;
    }

    return `${goalMl} ml`;
  }, [goalMl, goalUnit, glassSize]);

  const addWater = () => {
    if (addAmount <= 0) return;

    const nextAmount = Math.min(goalMl, waterMl + addAmount);

    data.setWater(today, nextAmount);
  };

  const removeWater = () => {
    const nextAmount = Math.max(0, waterMl - addAmount);

    data.setWater(today, nextAmount);
  };

  const handleGoalUnitChange = (unit: 'ml' | 'litres' | 'glasses') => {
    setGoalUnit(unit);
  };

  return (
    <section className="hydration-card">
      <div className="hydration-header">
        <div>
          <div className="hydration-title-row">
            <Droplets size={20} />
            <h2>Hydration</h2>
          </div>

          <p className="hydration-subtitle">
            Keep yourself hydrated throughout the day.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div className="hydration-percent">
            {percentage}%
          </div>
          <button
            className="soft-button"
            onClick={() => data.setWater(today, 0)}
            disabled={waterMl === 0}
            aria-label="Reset today's hydration"
          >
            <RotateCcw size={13} />
            Reset
          </button>
        </div>
      </div>

      <div className="hydration-main">
        {/* GLASS */}
        <div className="water-glass-wrapper">
          <div className="water-glass">

            {/* Water */}
            <div
              className="water-fill"
              style={{
                height: `${percentage}%`,
              }}
            >
              <div className="water-wave water-wave-one" />
              <div className="water-wave water-wave-two" />

              <div className="water-bubble bubble-one" />
              <div className="water-bubble bubble-two" />
              <div className="water-bubble bubble-three" />
            </div>

            {/* Glass shine */}
            <div className="glass-shine" />

            {/* Glass highlight */}
            <div className="glass-highlight" />
          </div>

          <div className="glass-label">
            <GlassWater size={18} />

            <strong>
              {waterMl >= 1000
                ? `${(waterMl / 1000).toFixed(2)} L`
                : `${waterMl} ml`}
            </strong>

            <span>
              of {displayGoal}
            </span>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="hydration-controls">

          <div className="hydration-stat">
            <span>Today's water</span>
            <strong>
              {waterMl >= 1000
                ? `${(waterMl / 1000).toFixed(2)} L`
                : `${waterMl} ml`}
            </strong>
          </div>

          <div className="hydration-stat">
            <span>Remaining</span>
            <strong>
              {remainingMl >= 1000
                ? `${(remainingMl / 1000).toFixed(2)} L`
                : `${remainingMl} ml`}
            </strong>
          </div>

          {/* DAILY GOAL */}
          <div className="hydration-setting">
            <label>Daily goal</label>

            <div className="goal-row">
              <input
                type="number"
                min="1"
                value={
                  goalUnit === 'litres'
                    ? goalMl / 1000
                    : goalUnit === 'glasses'
                    ? Math.round(goalMl / glassSize)
                    : goalMl
                }
                onChange={(e) => {
                  const value = Number(e.target.value);

                  if (!Number.isFinite(value) || value <= 0) return;

                  if (goalUnit === 'litres') {
                    updateGoalMl(value * 1000);
                  } else if (goalUnit === 'glasses') {
                    updateGoalMl(value * glassSize);
                  } else {
                    updateGoalMl(value);
                  }
                }}
              />

              <select
                value={goalUnit}
                onChange={(e) =>
                  handleGoalUnitChange(
                    e.target.value as 'ml' | 'litres' | 'glasses'
                  )
                }
              >
                <option value="litres">Litres</option>
                <option value="ml">Millilitres</option>
                <option value="glasses">Glasses</option>
              </select>
            </div>
          </div>

          {/* GLASS SIZE */}
          {goalUnit === 'glasses' && (
            <div className="hydration-setting">
              <label>Glass size</label>

              <select
                value={glassSize}
                onChange={(e) => {
                  const size = Number(e.target.value);

                  setGlassSize(size);
                  updateGoalMl(Math.round(goalMl / glassSize) * size);
                }}
              >
                <option value={150}>150 ml</option>
                <option value={200}>200 ml</option>
                <option value={250}>250 ml</option>
                <option value={300}>300 ml</option>
                <option value={500}>500 ml</option>
              </select>
            </div>
          )}

          {/* ADD AMOUNT */}
          <div className="hydration-setting">
            <label>Add amount</label>

            <select
              value={addAmount}
              onChange={(e) =>
                setAddAmount(Number(e.target.value))
              }
            >
              <option value={100}>100 ml</option>
              <option value={150}>150 ml</option>
              <option value={200}>200 ml</option>
              <option value={250}>250 ml</option>
              <option value={300}>300 ml</option>
              <option value={500}>500 ml</option>
            </select>
          </div>

          {/* Quick Presets */}
          <div className="hydration-presets">
            <button
              type="button"
              className="hydration-preset-btn"
              onClick={() => data.setWater(today, Math.min(goalMl, waterMl + 250))}
              aria-label="Add 250 ml glass"
            >
              <GlassWater size={13} /> +250 ml (Glass)
            </button>
            <button
              type="button"
              className="hydration-preset-btn"
              onClick={() => data.setWater(today, Math.min(goalMl, waterMl + 500))}
              aria-label="Add 500 ml bottle"
            >
              <Droplets size={13} /> +500 ml (Bottle)
            </button>
            <button
              type="button"
              className="hydration-preset-btn"
              onClick={() => data.setWater(today, Math.min(goalMl, waterMl + 750))}
              aria-label="Add 750 ml flask"
            >
              <Droplets size={13} /> +750 ml (Flask)
            </button>
          </div>

          {/* WATER BUTTON */}
          <div className="water-actions">
            <button
              className="water-minus"
              onClick={removeWater}
              disabled={waterMl === 0}
              aria-label="Remove water"
            >
              <Minus size={18} />
            </button>

            <button
              className="water-add"
              onClick={addWater}
              disabled={waterMl >= goalMl}
            >
              <Plus size={19} />
              Add Water
            </button>
          </div>

          {percentage >= 100 && (
            <div className="hydration-complete">
              💧 Daily hydration goal reached!
            </div>
          )}
        </div>
      </div>

      <style>{`
        .hydration-card {
          width: 100%;
          padding: 26px;
          border-radius: 20px;
          background: linear-gradient(145deg, var(--card) 0%, rgba(56,189,248,0.07) 100%);
          border: 1px solid rgba(56,189,248,0.2);
          box-shadow: 0 12px 28px rgba(23,36,51,0.06);
          box-sizing: border-box;
        }

        .hydration-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 24px;
        }

        .hydration-title-row {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .hydration-title-row svg {
          color: #38bdf8;
        }

        .hydration-title-row h2 {
          margin: 0;
          font-size: 20px;
        }

        .hydration-subtitle {
          margin: 6px 0 0;
          opacity: 0.6;
          font-size: 13px;
        }

        .hydration-percent {
          font-size: 24px;
          font-weight: 700;
        }

        .hydration-main {
          display: grid;
          grid-template-columns: minmax(145px, 0.8fr) minmax(0, 1.2fr);
          gap: 14px;
          align-items: center;
        }

        /* GLASS */

        .water-glass-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .water-glass {
          position: relative;
          width: 155px;
          height: 205px;
          overflow: hidden;

          border: 3px solid rgba(255,255,255,0.45);
          border-top: 5px solid rgba(255,255,255,0.6);

          border-radius: 12px 12px 28px 28px;

          background:
            linear-gradient(
              90deg,
              rgba(255,255,255,0.10),
              rgba(255,255,255,0.025),
              rgba(255,255,255,0.10)
            );

          box-shadow:
            inset 8px 0 15px rgba(255,255,255,0.06),
            inset -8px 0 15px rgba(255,255,255,0.04);
        }

        .water-fill {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;

          background:
            linear-gradient(
              to top,
              #0284c7,
              #38bdf8
            );

          transition:
            height 700ms cubic-bezier(0.22, 1, 0.36, 1);

          overflow: hidden;
        }

        .water-wave {
          position: absolute;
          top: -10px;
          left: -25%;
          width: 150%;
          height: 25px;

          border-radius: 50%;

          background: rgba(255,255,255,0.18);

          animation: waveMove 3s linear infinite;
        }

        .water-wave-two {
          top: -7px;
          opacity: 0.35;
          animation-duration: 4s;
          animation-direction: reverse;
        }

        @keyframes waveMove {
          from {
            transform: translateX(-12%);
          }

          to {
            transform: translateX(12%);
          }
        }

        .water-bubble {
          position: absolute;
          bottom: 15%;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: rgba(255,255,255,0.35);

          animation: bubbleRise 3s infinite ease-in;
        }

        .bubble-one {
          left: 30%;
        }

        .bubble-two {
          left: 55%;
          animation-delay: 1s;
        }

        .bubble-three {
          left: 70%;
          animation-delay: 1.7s;
        }

        @keyframes bubbleRise {
          0% {
            transform: translateY(0);
            opacity: 0;
          }

          30% {
            opacity: 1;
          }

          100% {
            transform: translateY(-110px);
            opacity: 0;
          }
        }

        .glass-shine {
          position: absolute;
          top: 10px;
          left: 14px;
          width: 9px;
          height: 170px;

          border-radius: 20px;

          background: linear-gradient(
            to bottom,
            rgba(255,255,255,0.35),
            rgba(255,255,255,0)
          );

          pointer-events: none;
        }

        .glass-highlight {
          position: absolute;
          top: 0;
          right: 12px;
          width: 3px;
          height: 100%;

          background: rgba(255,255,255,0.12);

          pointer-events: none;
        }

        .glass-label {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 14px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .glass-label svg {
          color: #38bdf8;
        }

        .glass-label strong {
          font-size: 18px;
        }

        .glass-label span {
          opacity: 0.55;
          font-size: 13px;
        }

        /* CONTROLS */

        .hydration-controls {
          display: flex;
          flex-direction: column;
          gap: 17px;
        }

        .hydration-stat {
          display: flex;
          align-items: center;
          justify-content: space-between;

          padding: 14px 16px;
          border-radius: 13px;

          background: rgba(56,189,248,0.07);
        }

        .hydration-stat span {
          opacity: 0.6;
          font-size: 13px;
        }

        .hydration-stat strong {
          font-size: 15px;
        }

        .hydration-setting {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .hydration-setting label {
          font-size: 12px;
          opacity: 0.65;
        }

        .goal-row {
          display: grid;
          grid-template-columns: 1fr 140px;
          gap: 8px;
        }

        .hydration-setting input,
        .hydration-setting select {
          width: 100%;
          box-sizing: border-box;

          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.05);
          color: inherit;

          border-radius: 10px;
          padding: 10px 12px;

          outline: none;
        }

        .hydration-setting input:focus,
        .hydration-setting select:focus {
          border-color: #38bdf8;
        }

        .water-actions {
          display: flex;
          gap: 8px;
          margin-top: 4px;
        }

        .water-minus,
        .water-add {
          border: none;
          cursor: pointer;
          border-radius: 11px;
          min-height: 44px;
        }

        .water-minus {
          width: 48px;

          background: rgba(255,255,255,0.07);
          color: inherit;
        }

        .water-add {
          flex: 1;

          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;

          background: #0ea5e9;
          color: white;

          font-weight: 600;
        }

        .water-add:hover {
          background: #0284c7;
        }

        .water-minus:disabled,
        .water-add:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .hydration-complete {
          padding: 11px 13px;
          border-radius: 10px;

          background: rgba(34,197,94,0.12);
          border: 1px solid rgba(34,197,94,0.2);

          color: #4ade80;
          font-size: 13px;
          text-align: center;
        }

        @media (max-width: 700px) {
          .hydration-main {
            grid-template-columns: 1fr;
          }

          .goal-row {
            grid-template-columns: 1fr;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .water-fill {
            transition: none;
          }

          .water-wave,
          .water-bubble {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}

function BmiCalculator() {
  const [heightCm, setHeightCm] = useState('170');
  const [weightKg, setWeightKg] = useState('70');
  const height = Number(heightCm) / 100;
  const weight = Number(weightKg);
  const bmi = height > 0 && weight > 0 ? weight / (height * height) : null;

  const category = bmi === null
    ? 'Enter height and weight'
    : bmi < 18.5
      ? 'Below the healthy range'
      : bmi < 25
        ? 'Within the healthy range'
        : bmi < 30
          ? 'Above the healthy range'
          : 'High range';

  const categoryColor = bmi === null
    ? ''
    : bmi < 18.5
      ? 'sand'
      : bmi < 25
        ? 'mint'
        : bmi < 30
          ? 'sand'
          : 'coral';

  // Spectrum range: 15 to 35
  const needlePercent = bmi === null || !Number.isFinite(bmi)
    ? 50
    : Math.max(0, Math.min(100, ((bmi - 15) / 20) * 100));

  return (
    <section className="card bmi-card" style={{ alignSelf: 'stretch' }}>
      <div className="card-title">
        <div>
          <div className="eyebrow">Wellbeing</div>
          <h2 className="section-title">BMI calculator</h2>
        </div>
        <Target size={18} color="var(--mint-ink)" />
      </div>

      <div className="grid grid-2" style={{ gap: 12, marginTop: 16 }}>
        <Field label="Height (cm)">
          <input
            type="number"
            min="1"
            step="0.1"
            value={heightCm}
            onChange={(event) => setHeightCm(event.target.value)}
            aria-label="Height in centimetres"
          />
        </Field>
        <Field label="Weight (kg)">
          <input
            type="number"
            min="1"
            step="0.1"
            value={weightKg}
            onChange={(event) => setWeightKg(event.target.value)}
            aria-label="Weight in kilograms"
          />
        </Field>
      </div>

      {/* Visual Spectrum Bar */}
      <div className="bmi-spectrum-bar" title={bmi ? `BMI: ${bmi.toFixed(1)}` : 'BMI Gauge'}>
        <div className="bmi-spectrum-needle" style={{ left: `${needlePercent}%` }} />
      </div>

      <div className="bmi-spectrum-labels">
        <span>&lt;18.5</span>
        <span>18.5 - 24.9</span>
        <span>25 - 29.9</span>
        <span>30+</span>
      </div>

      <div className="bmi-result" style={{ marginTop: 16 }}>
        <div className="eyebrow">Your BMI</div>
        <div style={{ fontSize: 32, fontWeight: 700, marginTop: 3 }}>
          {bmi === null || !Number.isFinite(bmi) ? '—' : bmi.toFixed(1)}
        </div>
        <div style={{ marginTop: 6 }}>
          <span className={cx('tag', categoryColor)} style={{ fontWeight: 700, fontSize: 11 }}>
            {category}
          </span>
        </div>
      </div>
    </section>
  );
}

function ExerciseRow({ exercise }: { exercise: Exercise }) {
  const data = useData();
  return <div className={cx('schedule-item', exercise.completed && 'done')}>
    <div><p style={{ textDecoration: exercise.completed ? 'line-through' : 'none' }}>{exercise.name}</p><span>{exercise.sets} {exercise.sets === 1 ? 'set' : 'sets'} · {exercise.mode === 'time' ? `${exercise.durationSeconds ?? exercise.target ?? exercise.reps} seconds` : `${exercise.reps} reps`}{exercise.weight ? ` · ${exercise.weight} kg` : ''}</span></div>
    <div style={{ display: 'flex', gap: 5 }}>
      <button className="icon-button" onClick={() => data.updateExercise(exercise.id, { completed: !exercise.completed })} aria-label={exercise.completed ? `Reopen ${exercise.name}` : `Complete ${exercise.name}`}>
        {exercise.completed ? <RotateCcw size={13} /> : <Check size={13} />}
      </button>
      <button className="icon-button" onClick={() => data.deleteExercise(exercise.id)} aria-label={`Delete ${exercise.name}`}><Trash2 size={13} /></button>
    </div>
  </div>;
}

function ExerciseConfiguration({
  exercise,
  onClose,
  onConfigure,
}: {
  exercise: LibraryExercise;
  onClose: () => void;
  onConfigure: (mode: 'timed' | 'untimed', value: number) => void;
}) {
  const [mode, setMode] = useState<'timed' | 'untimed'>('untimed');
  const [value, setValue] = useState('12');

  const numericValue = Number(value);

  const submit = (event: FormEvent) => {
    event.preventDefault();

    if (!Number.isFinite(numericValue) || numericValue < 1) {
      return;
    }

    onConfigure(mode, numericValue);
  };

  return (
    <Modal
      title={exercise.name}
      subtitle="Choose how you want to complete this exercise."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginBottom: 16,
          }}
        >
          <button
            type="button"
            className={
              mode === 'untimed'
                ? 'primary-button'
                : 'soft-button'
            }
            onClick={() => {
              setMode('untimed');
              setValue('12');
            }}
          >
            No Timer
          </button>

          <button
            type="button"
            className={
              mode === 'timed'
                ? 'primary-button'
                : 'soft-button'
            }
            onClick={() => {
              setMode('timed');
              setValue('30');
            }}
          >
            Timed
          </button>
        </div>

        <Field
          label={
            mode === 'timed'
              ? 'Duration (seconds)'
              : 'Number of reps'
          }
          full
        >
          <input
            autoFocus
            type="number"
            min="1"
            step="1"
            value={value}
            onChange={(event) =>
              setValue(event.target.value)
            }
          />
        </Field>

        <div className="modal-footer">
          <button
            type="button"
            className="soft-button"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="primary-button"
            disabled={
              !Number.isFinite(numericValue) ||
              numericValue < 1
            }
          >
            Add to workout
          </button>
        </div>
      </form>
    </Modal>
  );
}

function getWorkoutTheme(category: string) {
  const themes: Record<string, { accent: string; bright: string; glow: string }> = {
    'Upper Body': { accent: '#e75b62', bright: '#ff9b83', glow: 'rgba(231, 91, 98, .24)' },
    'Lower Body': { accent: '#e88945', bright: '#ffc16e', glow: 'rgba(232, 137, 69, .24)' },
    Core: { accent: '#a982ef', bright: '#d3a5ff', glow: 'rgba(169, 130, 239, .25)' },
    Cardio: { accent: '#54a9e8', bright: '#86ddff', glow: 'rgba(84, 169, 232, .25)' },
    'Full Body': { accent: '#54bd8a', bright: '#9be5ae', glow: 'rgba(84, 189, 138, .24)' },
    Other: { accent: '#e16dad', bright: '#ffadd1', glow: 'rgba(225, 109, 173, .24)' },
  };
  return themes[category] ?? themes.Other;
}

function WorkoutSession({
  exercises,
  initialIndex,
  onExerciseComplete,
  onFinish,
  onExit,
}: {
  exercises: WorkoutExercise[];
  initialIndex: number;
  onExerciseComplete: (exercise: WorkoutExercise, index: number) => void;
  onFinish: () => void;
  onExit: () => void;
}) {
  const data = useData();
  // This ref resets with each mounted workout session and guards both timed
  // completion paths synchronously, including repeated copies of one exercise.
  const loggedExerciseIds = useRef(new Set<string>());
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [remaining, setRemaining] = useState(
    exercises[initialIndex]?.mode === 'timed' ? exercises[initialIndex].target : 0
  );
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [workoutFinished, setWorkoutFinished] = useState(false);

  const exercise = exercises[currentIndex];
  const theme = getWorkoutTheme(exercise?.category ?? 'Other');
  const logExercise = (index: number) => {
    const item = exercises[index];
    if (!item) return false;
    // Include the plan position because a workout may contain the same library
    // exercise more than once, while each occurrence still needs its own log.
    const sessionExerciseId = `${index}:${item.id}`;
    if (loggedExerciseIds.current.has(sessionExerciseId)) return false;
    loggedExerciseIds.current.add(sessionExerciseId);
    const timed = item.mode === 'timed';
    data.addExercise({ name: item.name, sets: 1, reps: timed ? 0 : item.target, weight: 0, completed: true, date: dateKey(), mode: timed ? 'time' : 'reps', target: item.target, ...(timed ? { durationSeconds: item.target } : {}) });
    return true;
  };
  const completeExercise = (index: number) => {
    if (!logExercise(index)) return;
    const item = exercises[index];
    if (item) onExerciseComplete(item, index);
  };

  /*
   * TIMER
   */
  useEffect(() => {
    if (
      !exercise ||
      exercise.mode !== 'timed' ||
      !running ||
      completed
    ) {
      return;
    }

    const startedAt = Date.now();
    const startingRemaining = remaining;

    const interval = window.setInterval(() => {
      const elapsed = Math.floor(
        (Date.now() - startedAt) / 1000
      );

      const next = Math.max(
        0,
        startingRemaining - elapsed
      );

      setRemaining(next);

      if (next <= 0) {
        completeExercise(currentIndex);
        window.clearInterval(interval);
        setRunning(false);
        setCompleted(true);
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [timerKey, running, completed, currentIndex]);

  /*
   * RESET WHEN MOVING TO NEXT EXERCISE
   */
  useEffect(() => {
    if (!exercise) return;

    setRunning(false);
    setCompleted(false);

    if (exercise.mode === 'timed') {
      setRemaining(exercise.target);
    } else {
      setRemaining(0);
    }

    setTimerKey((key) => key + 1);
  }, [currentIndex]);

  /*
   * FINISH WORKOUT
   */
  useEffect(() => {
    if (!exercise) {
      onFinish();
    }
  }, [exercise, onFinish]);

  if (!exercise) {
    return null;
  }

  const target = exercise.target;

  /*
   * CIRCLE PROGRESS
   */
  const progress =
    exercise.mode === 'timed' && target > 0
      ? remaining / target
      : completed
        ? 1
        : 0;

  const circleRadius = 120;
  const circumference = 2 * Math.PI * circleRadius;

  const dashOffset =
    circumference * (1 - progress);

  /*
   * TIMER CONTROLS
   */
  const startTimer = () => {
    if (completed) return;

    if (remaining <= 0) {
      setRemaining(target);
    }

    setRunning(true);
    setTimerKey((key) => key + 1);
  };

  const pauseTimer = () => {
    setRunning(false);
  };

  const restartTimer = () => {
    setRemaining(target);
    setCompleted(false);
    setRunning(true);
    setTimerKey((key) => key + 1);
  };

  const completeTimedExercise = () => {
    completeExercise(currentIndex);
    setRunning(false);
    setCompleted(true);
    setRemaining(0);
  };

  /*
   * UNTITLED EXERCISE COMPLETION
   */
  const completeUntimedExercise = () => {
    completeExercise(currentIndex);
    setCompleted(true);
  };

  /*
   * NEXT EXERCISE
   */
  const nextExercise = () => {
    if (currentIndex >= exercises.length - 1) {
      setWorkoutFinished(true);
      return;
    }

    setCurrentIndex((index) => index + 1);
  };

  /*
   * FULLSCREEN
   */
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      setFullscreen(false);
    }
  };

  if (workoutFinished) {
    return (
      <div className="workout-session workout-session-complete" style={{ '--workout-accent': theme.accent, '--workout-glow': theme.glow } as CSSProperties}>
        <div className="workout-atmosphere" aria-hidden="true"><span /><span /><span /></div>
        <div className="workout-finish-card">
          <span className="workout-mode-label">WORKOUT COMPLETE</span>
          <div className="workout-finish-check"><Check size={42} strokeWidth={2.5} /></div>
          <h1>GREAT WORK!</h1>
          <p>{exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'} completed</p>
          <button className="workout-complete-button" onClick={onFinish}>Done <ChevronRight size={18} /></button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="workout-session"
      style={{ '--workout-accent': theme.accent, '--workout-glow': theme.glow } as CSSProperties}
    >
      <div className="workout-atmosphere" aria-hidden="true"><span /><span /><span /></div>
      {/* TOP BAR */}
      <header className="workout-session-topbar">
        <button
          className="workout-utility-button"
          onClick={onExit}
        >
          <X size={16} />
          Exit
        </button>

        <div className="workout-top-progress"><span className="workout-mode-label">WORKOUT MODE</span><strong>Exercise {currentIndex + 1} of {exercises.length}</strong></div>

        <button
          className="workout-utility-button"
          onClick={toggleFullscreen}
        >
          <Maximize2 size={16} />
          {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
      </header>

      {/* MAIN */}
      <main className="workout-session-main" key={currentIndex}>
        <div className="workout-session-content">
          {/* EXERCISE INFO */}
          <div className="workout-exercise-heading">
            <span className="workout-category-badge">{exercise.category}</span>
            <h1>{exercise.name}</h1>
            <span className="workout-exercise-count">{currentIndex + 1} <i>/</i> {exercises.length}</span>
          </div>

          {/* ===================== */}
          {/* TIMED EXERCISE */}
          {/* ===================== */}

          {exercise.mode === 'timed' && (
            <>
              <div className="workout-timer-wrap">
                <svg
                  className="workout-timer-svg"
                  viewBox="0 0 300 300"
                  role="img"
                  aria-label={`${Math.ceil(remaining)} seconds remaining`}
                >
                  <defs>
                    <linearGradient id="workout-ring-gradient" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={theme.bright} />
                      <stop offset="100%" stopColor={theme.accent} />
                    </linearGradient>
                  </defs>
                  {/* BACKGROUND CIRCLE */}
                  <circle
                    cx="150"
                    cy="150"
                    r={circleRadius}
                    fill="none"
                    stroke="rgba(255,255,255,.12)"
                    strokeWidth="9"
                  />

                  {/* PROGRESS CIRCLE */}
                  <circle
                    cx="150"
                    cy="150"
                    r={circleRadius}
                    fill="none"
                    stroke="url(#workout-ring-gradient)"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    style={{
                      filter: `drop-shadow(0 0 10px ${theme.glow})`,
                      transition: 'stroke-dashoffset 0.2s linear',
                    }}
                  />
                </svg>

                {/* CENTER CONTENT */}
                <div
                  className="workout-timer-center"
                >
                  <div className="workout-timer-value">
                    {String(Math.ceil(remaining)).padStart(2, '0')}
                  </div>
                  <div className="workout-timer-unit">SECONDS</div>
                  <div className="workout-timer-percent">{Math.round(progress * 100)}% LEFT</div>
                </div>
              </div>

              {/* TIMER BUTTONS */}
              {!completed && (
                <div
                  className="workout-control-row"
                >
                  {!running ? (
                    <button
                      className="workout-control-button workout-control-start"
                      onClick={startTimer}
                    >
                      <Play size={16} />
                      Start
                    </button>
                  ) : (
                    <button
                      className="workout-control-button workout-control-start"
                      onClick={pauseTimer}
                    >
                      <Pause size={16} />
                      Pause
                    </button>
                  )}

                  <button
                    className="workout-control-button"
                    onClick={restartTimer}
                  >
                    <RotateCcw size={16} />
                    Restart
                  </button>

                </div>
              )}
              {!completed && <button className="workout-complete-button" onClick={completeTimedExercise}><Check size={18} /> Complete Exercise</button>}
            </>
          )}

          {/* ===================== */}
          {/* UNTIMED EXERCISE */}
          {/* ===================== */}

          {exercise.mode === 'untimed' && (
            <>
              <div className="workout-reps-orb" style={{ borderColor: theme.accent }}>
                <div className="workout-reps-value">
                  {target}
                </div>
                <div className="workout-reps-label">REPS</div>
                <div className="workout-reps-prompt">PERFORM YOUR REPS</div>
              </div>

              {!completed && (
                <button
                  className="workout-complete-button"
                  onClick={completeUntimedExercise}
                >
                  <Check size={18} />
                  Complete Exercise
                </button>
              )}
            </>
          )}

          {/* COMPLETED */}
          {completed && (
            <div className="workout-exercise-completed">
              <div className="workout-completed-label"><Check size={18} /> Exercise completed</div>

              <button
                className="workout-complete-button workout-next-button"
                onClick={nextExercise}
              >
                {currentIndex === exercises.length - 1
                  ? 'Finish Workout'
                  : 'Next Exercise'}
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      </main>

      {/* FOOTER */}
      <footer className="workout-session-footer">
        {currentIndex < exercises.length - 1 ? <><span>NEXT UP</span><strong>{exercises[currentIndex + 1]?.name}</strong></> : <span>YOU’RE ON YOUR FINAL EXERCISE</span>}
      </footer>
    </div>
  );
}
function WorkoutCalendar() {
  const data = useData();

  const today = dateKey();

  const [currentMonth, setCurrentMonth] = useState(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const monthName = currentMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const previousMonth = () => {
    setCurrentMonth(
      new Date(year, month - 1, 1)
    );
  };

  const nextMonth = () => {
    setCurrentMonth(
      new Date(year, month + 1, 1)
    );
  };

  const getDateKey = (day: number) => {
    const monthNumber = String(month + 1).padStart(2, '0');
    const dayNumber = String(day).padStart(2, '0');

    return `${year}-${monthNumber}-${dayNumber}`;
  };

  const selectedWorkoutDay =
    selectedDate
      ? data.workoutCalendar[selectedDate]
      : undefined;

  return (
    <section className="card workout-calendar">
      <div className="workout-calendar-header">
        <div>
          <p className="eyebrow">Training</p>
          <h2>Workout Calendar</h2>
          <p className="muted">
            Plan your workout and rest days.
          </p>
        </div>

        <div className="calendar-navigation">
          <button
            className="icon-button"
            onClick={previousMonth}
            aria-label="Previous month"
          >
            ←
          </button>

          <strong>{monthName}</strong>

          <button
            className="icon-button"
            onClick={nextMonth}
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>

      <div className="workout-calendar-weekdays">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
          (day) => (
            <div key={day}>{day}</div>
          )
        )}
      </div>

      <div className="workout-calendar-grid">
        {Array.from({ length: firstDay }).map((_, index) => (
          <div
            key={`empty-${index}`}
            className="workout-calendar-empty"
          />
        ))}

        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1;
          const date = getDateKey(day);

          const workoutDay =
            data.workoutCalendar[date];

          const isToday = date === today;

          return (
            <button
              key={date}
              className={[
                'workout-calendar-day',
                isToday ? 'today' : '',
                workoutDay?.type === 'workout'
                  ? 'planned-workout'
                  : '',
                workoutDay?.type === 'rest'
                  ? 'planned-rest'
                  : '',
                workoutDay?.completed
                  ? 'completed'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSelectedDate(date)}
            >
              <span className="calendar-day-number">
                {day}
              </span>

              {workoutDay?.type === 'workout' && (
                <span className="calendar-day-status">
                  {workoutDay.completed ? '✓' : '🏋️'}
                </span>
              )}

              {workoutDay?.type === 'rest' && (
                <span className="calendar-day-status">
                  💤
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="workout-calendar-legend">
        <span>
          <i className="legend-dot workout" />
          Workout
        </span>

        <span>
          <i className="legend-dot rest" />
          Rest
        </span>

        <span>
          ✓ Completed
        </span>
      </div>

      {selectedDate && (
        <div className="calendar-day-menu">
          <div>
            <strong>{selectedDate}</strong>

            <button
              className="icon-button"
              onClick={() => setSelectedDate(null)}
            >
              ×
            </button>
          </div>

          <div className="calendar-day-actions">
            <button
              className="primary-button"
              onClick={() => {
                data.setWorkoutDay(
                  selectedDate,
                  'workout'
                );
                setSelectedDate(null);
              }}
            >
              🏋️ Workout Day
            </button>

            <button
              className="soft-button"
              onClick={() => {
                data.setWorkoutDay(
                  selectedDate,
                  'rest'
                );
                setSelectedDate(null);
              }}
            >
              💤 Rest Day
            </button>

            {selectedWorkoutDay?.type === 'workout' &&
              !selectedWorkoutDay.completed && (
                <button
                  className="soft-button"
                  onClick={() => {
                    data.completeWorkoutDay(
                      selectedDate
                    );
                    setSelectedDate(null);
                  }}
                >
                  ✓ Check In
                </button>
              )}

            {selectedWorkoutDay && (
              <button
                className="soft-button"
                onClick={() => {
                  data.clearWorkoutDay(
                    selectedDate
                  );
                  setSelectedDate(null);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
function Work() {
  const data = useData();
  const [modal, setModal] = useState<Project | 'new' | null>(null);
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all');
  const allProjects = data.projects.filter((p) => (p.type === undefined || p.type === 'normal' || p.type === 'workout'));
  const projects = allProjects.filter((p) => status === 'all' || p.status === status);

  return <div className="page">
    <PageHeading
      eyebrow="Work projects"
      title="Make the bigger things legible."
      description="Projects hold the context that individual tasks cannot."
      action={<button className="primary-button" onClick={() => setModal('new')} data-testid="button-add-project"><Plus size={15} /> New project</button>}
    />

    <div className="date-nav" style={{ marginBottom: 19 }}>
      {(['all', 'planning', 'active', 'paused', 'done'] as const).map((item) => {
        const count = item === 'all' ? allProjects.length : allProjects.filter((p) => p.status === item).length;
        return (
          <button
            className={cx(status === item ? 'primary-button' : 'soft-button')}
            key={item}
            onClick={() => setStatus(item)}
            data-testid={`button-project-filter-${item}`}
          >
            {item === 'all' ? 'All projects' : item[0].toUpperCase() + item.slice(1)} <span style={{ opacity: 0.75, fontSize: 11 }}>({count})</span>
          </button>
        );
      })}
    </div>

    {projects.length ? (
      <div className="grid grid-3">{projects.map((project) => <ProjectCard key={project.id} project={project} onEdit={setModal} />)}</div>
    ) : (
      <Empty
        icon={FolderKanban}
        title="No projects in view"
        text="Start with the outcome you want to make visible."
        action={<button className="primary-button" onClick={() => setModal('new')} data-testid="button-empty-add-project"><Plus size={14} /> Create project</button>}
      />
    )}

    {modal && <ProjectForm initial={modal === 'new' ? undefined : modal} onClose={() => setModal(null)} />}
  </div>;
}

function ProjectCard({ project, onEdit }: { project: Project; onEdit: (project: Project) => void }) {
  const data = useData();
  const linked = data.tasks.filter((task) => task.projectId === project.id);
  const done = linked.filter((task) => task.done).length;
  const isWorkout = project.type === 'workout';
  const progressPercent = linked.length ? Math.round((done / linked.length) * 100) : 0;

  return <div className="card">
    <div className="card-title">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span className={cx('tag', project.priority === 'high' ? 'coral' : project.priority === 'medium' ? 'sand' : '')}>
          {project.priority}
        </span>
        <span className={cx('tag', project.status === 'done' ? 'mint' : project.status === 'active' ? 'coral' : 'sand')} style={{ fontSize: 11 }}>
          {project.status}
        </span>
      </div>
      <button className="icon-button" onClick={() => onEdit(project)} aria-label="Edit project" data-testid={`button-edit-project-${project.id}`}>
        <Pencil size={13} />
      </button>
    </div>

    <h2 className="section-title" style={{ marginTop: 6 }}>{project.name}</h2>
    <p className="tiny" style={{ minHeight: 32, margin: '8px 0 16px', color: 'var(--ink-soft)' }}>
      {isWorkout ? `${project.workoutExercises?.length ?? 0} exercises · Training Routine` : project.description || 'No description added yet.'}
    </p>

    <div className="stat-line">
      <span className="muted">{isWorkout ? `${project.workoutExercises?.length ?? 0} exercises` : `${done} of ${linked.length} tasks completed`}</span>
      <strong>{progressPercent}%</strong>
    </div>

    <div className="progress-track" style={{ margin: '8px 0 16px' }}>
      <div className={cx('progress-bar', progressPercent === 100 ? 'mint' : 'coral')} style={{ width: `${progressPercent}%` }} />
    </div>

    <div className="stat-line" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
      <span className="tiny" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <CalendarDays size={12} color="var(--ink-soft)" />
        {project.deadline ? `Due ${formatDate(project.deadline)}` : 'Flexible timing'}
      </span>
      <button
        className="danger-button"
        style={{ padding: '4px 8px', fontSize: 11 }}
        onClick={() => { if (window.confirm('Delete this project? Linked tasks will stay, but lose their project link.')) data.deleteProject(project.id); }}
        data-testid={`button-delete-project-${project.id}`}
      >
        <Trash2 size={12} />
      </button>
    </div>
  </div>;
}

function ProjectForm({ initial, onClose }: { initial?: Project; onClose: () => void }) {
  const data = useData();
  const [form, setForm] = useState({ name: initial?.name ?? '', description: initial?.description ?? '', deadline: initial?.deadline ?? '', priority: initial?.priority ?? 'medium' as Priority, status: initial?.status ?? 'planning' as ProjectStatus });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (initial) data.updateProject(initial.id, { ...form, name: form.name.trim() });
    else data.addProject({ ...form, name: form.name.trim() });
    onClose();
  };
  return <Modal title={initial ? 'Edit project' : 'New project'} subtitle="Give the work a home and a next chapter." onClose={onClose}>
    <form onSubmit={submit}>
      <div className="form-grid">
        <Field label="Project name" full><input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="What are you making?" data-testid="input-project-name" /></Field>
        <Field label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })} data-testid="select-project-status"><option value="planning">Planning</option><option value="active">Active</option><option value="paused">Paused</option><option value="done">Done</option></select></Field>
        <Field label="Priority"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })} data-testid="select-project-priority"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
        <Field label="Deadline"><input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} data-testid="input-project-deadline" /></Field>
        <Field label="Description" full><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="textarea-project-description" /></Field>
      </div>
      <div className="modal-footer">
        <button type="button" className="soft-button" onClick={onClose}>Cancel</button>
        <button className="primary-button" type="submit" data-testid="button-save-project">Save project</button>
      </div>
    </form>
  </Modal>;
}

function Analytics() {
  const data = useData();
  const [range, setRange] = useState(7);
  const end = new Date(`${dateKey()}T12:00:00`);
  const days = Array.from({ length: range }, (_, index) => {
    const d = new Date(end);
    d.setDate(end.getDate() - (range - index - 1));
    return d.toISOString().slice(0, 10);
  });

  const sessions = data.sessions.filter((s) => days.includes(s.start.slice(0, 10)));
  const completed = data.tasks.filter((t) => t.done && t.completedAt && days.includes(t.completedAt.slice(0, 10)));
  const trackedTasks = data.tasks.filter((task) => (task.completedAt && days.includes(task.completedAt.slice(0, 10))) || (task.deadline && days.includes(task.deadline)));
  const completionRate = trackedTasks.length ? Math.round(trackedTasks.filter((task) => task.done).length / trackedTasks.length * 100) : 0;
  const focusMinutesTotal = Math.round(sessions.reduce((sum, s) => sum + s.actualSeconds, 0) / 60);

  const focusMax = Math.max(1, ...days.map((day) => data.sessions.filter((s) => s.start.slice(0, 10) === day).reduce((sum, s) => sum + s.actualSeconds, 0)));
  const completedMax = Math.max(1, ...days.map((day) => data.tasks.filter((task) => task.completedAt?.slice(0, 10) === day).length));
  const categoryCounts = categories.map((category) => ({ category, count: data.tasks.filter((task) => task.category === category).length })).filter((item) => item.count > 0);

  return <div className="page">
    <PageHeading
      eyebrow="Analytics"
      title="Progress you can trust."
      description="Only time and completions you recorded appear here."
    />

    <div className="date-nav" style={{ marginBottom: 19 }}>
      {[1, 7, 30].map((item) => (
        <button className={cx(range === item ? 'primary-button' : 'soft-button')} key={item} onClick={() => setRange(item)} data-testid={`button-analytics-${item}`}>
          {item === 1 ? 'Today' : `${item} days`}
        </button>
      ))}
    </div>

    {/* Productivity Banner */}
    <div className="card" style={{ marginBottom: 18, padding: '14px 18px', background: 'linear-gradient(135deg, color-mix(in srgb, var(--coral) 8%, var(--card)), var(--card))', borderColor: 'color-mix(in srgb, var(--coral) 30%, var(--border))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'color-mix(in srgb, var(--coral) 15%, transparent)', display: 'grid', placeItems: 'center', color: 'var(--coral)', flexShrink: 0 }}>
          <Trophy size={18} />
        </div>
        <div>
          <strong style={{ fontSize: 14, display: 'block', color: 'var(--ink)' }}>
            {completionRate >= 70 ? '🔥 Stellar consistency!' : sessions.length > 0 ? '🌱 Steady momentum recorded' : 'Your space is primed for progress'}
          </strong>
          <span className="tiny" style={{ color: 'var(--ink-soft)' }}>
            {sessions.length > 0 ? `${focusMinutesTotal} minutes logged across ${sessions.length} sessions, with ${completed.length} tasks finished in this window.` : 'Start a session in the Focus Room to begin charting your real attention.'}
          </span>
        </div>
      </div>
    </div>

    <div className="grid grid-4">
      <div className="card metric">
        <div className="metric-head">
          <div className="eyebrow">Focus minutes</div>
          <span className="metric-icon-wrap"><Clock3 size={16} /></span>
        </div>
        <div className="metric-value">{focusMinutesTotal}</div>
        <div className="metric-label">across {sessions.length} sessions</div>
      </div>

      <div className="card metric">
        <div className="metric-head">
          <div className="eyebrow">Tasks finished</div>
          <span className="metric-icon-wrap" style={{ background: 'color-mix(in srgb, var(--mint) 15%, transparent)', color: 'var(--mint-ink)' }}><CheckCircle2 size={16} /></span>
        </div>
        <div className="metric-value">{completed.length}</div>
        <div className="metric-label">in this window</div>
      </div>

      <div className="card metric">
        <div className="metric-head">
          <div className="eyebrow">Completion rate</div>
          <span className="metric-icon-wrap" style={{ background: 'color-mix(in srgb, #6366f1 15%, transparent)', color: '#6366f1' }}><TrendingUp size={16} /></span>
        </div>
        <div className="metric-value">{completionRate}%</div>
        <div className="metric-label">{trackedTasks.length ? `${trackedTasks.length} dated records` : 'No dated tasks'}</div>
      </div>

      <div className="card metric">
        <div className="metric-head">
          <div className="eyebrow">Active days</div>
          <span className="metric-icon-wrap" style={{ background: 'color-mix(in srgb, var(--sand-warm) 20%, transparent)', color: '#b45309' }}><CalendarDays size={16} /></span>
        </div>
        <div className="metric-value">{new Set(sessions.map((s) => s.start.slice(0, 10))).size}</div>
        <div className="metric-label">with recorded focus</div>
      </div>
    </div>

    <div className="grid grid-2" style={{ marginTop: 18 }}>
      <section className="card">
        <div className="card-title"><div><div className="eyebrow">Daily focus</div><h2 className="section-title">Show up, then count it</h2></div></div>
        <div className="chart-wrap">
          {days.map((day) => {
            const value = data.sessions.filter((s) => s.start.slice(0, 10) === day).reduce((sum, s) => sum + s.actualSeconds, 0);
            return (
              <div className="bar-col" key={day}>
                <div className="bar" style={{ height: `${Math.max(value ? 3 : 0, value / focusMax * 100)}%` }} title={`${Math.round(value / 60)} minutes`} />
                <span>{new Intl.DateTimeFormat('en', { weekday: 'short' }).format(new Date(`${day}T12:00:00`)).slice(0, 2)}</span>
              </div>
            );
          })}
        </div>
        {!sessions.length && <p className="tiny" style={{ marginTop: 12 }}>No focus sessions in this window yet.</p>}
      </section>

      <section className="card">
        <div className="card-title"><div><div className="eyebrow">Focus by area</div><h2 className="section-title">Where energy went</h2></div></div>
        {categories.map((category) => {
          const total = data.sessions.filter((s) => s.category === category && days.includes(s.start.slice(0, 10))).reduce((sum, s) => sum + s.actualSeconds, 0);
          return (
            <div className="stat-line" style={{ marginBottom: 15 }} key={category}>
              <span className="muted">{category}</span>
              <strong>{Math.round(total / 60)}m</strong>
            </div>
          );
        })}
      </section>
    </div>

    <div className="grid grid-2" style={{ marginTop: 18 }}>
      <section className="card">
        <div className="card-title"><div><div className="eyebrow">Productivity trend</div><h2 className="section-title">Completions by day</h2></div></div>
        <div className="chart-wrap">
          {days.map((day) => {
            const value = data.tasks.filter((task) => task.completedAt?.slice(0, 10) === day).length;
            return (
              <div className="bar-col" key={day}>
                <div className="bar alt" style={{ height: `${Math.max(value ? 3 : 0, value / completedMax * 100)}%` }} title={`${value} tasks completed`} />
                <span>{new Intl.DateTimeFormat('en', { weekday: 'short' }).format(new Date(`${day}T12:00:00`)).slice(0, 2)}</span>
              </div>
            );
          })}
        </div>
        {!completed.length && <p className="tiny" style={{ marginTop: 12 }}>Complete a task to build this trend.</p>}
      </section>

      <section className="card">
        <div className="card-title"><div><div className="eyebrow">Task distribution</div><h2 className="section-title">Your work by area</h2></div></div>
        {categoryCounts.length ? categoryCounts.map(({ category, count }) => (
          <div className="stat-line" style={{ marginBottom: 13 }} key={category}>
            <span className="muted">{category}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="progress-track" style={{ width: 100 }}>
                <div className="progress-bar mint" style={{ width: `${count / Math.max(1, data.tasks.length) * 100}%` }} />
              </div>
              <strong>{count}</strong>
            </span>
          </div>
        )) : (
          <Empty title="No task distribution yet" text="Capture a task to see where your attention is going." />
        )}
      </section>
    </div>
  </div>;
}

function HistoryPage() {
  const data = useData();
  const [selected, setSelected] = useState(dateKey());
  const days = Array.from(new Set([...data.tasks.map((t) => t.completedAt?.slice(0, 10)), ...data.tasks.map((t) => t.deadline), ...data.activities.map((a) => a.date), ...data.sessions.map((s) => s.start.slice(0, 10)), ...data.exercises.map((e) => e.date)].filter(Boolean) as string[])).sort().reverse();
  const selectedTasks = data.tasks.filter((task) => task.deadline === selected || task.completedAt?.slice(0, 10) === selected || data.activities.some((activity) => activity.date === selected && activity.taskId === task.id));
  const chosenSessions = data.sessions.filter((s) => s.start.slice(0, 10) === selected);
  const chosenExercises = data.exercises.filter((e) => e.date === selected);
  const completedCount = selectedTasks.filter((task) => task.done).length;
  const completionPercentage = selectedTasks.length ? Math.round(completedCount / selectedTasks.length * 100) : 0;

  return <div className="page">
    <PageHeading eyebrow="History" title="Look back gently." description="A record of what really happened, not what was planned." />
    {days.length ? (
      <div className="grid grid-3">
        <div className="history-list">
          {days.map((day) => {
            const dayTasks = data.tasks.filter((task) => task.deadline === day || task.completedAt?.slice(0, 10) === day || data.activities.some((activity) => activity.date === day && activity.taskId === task.id));
            return (
              <button className="history-day" key={day} onClick={() => setSelected(day)} style={{ textAlign: 'left', borderColor: day === selected ? 'var(--coral)' : 'var(--line)' }} data-testid={`button-history-${day}`}>
                <span>
                  <strong>{dateLabel(day).split(',')[0]}</strong>
                  <p>{formatDate(day)} · {dayTasks.filter((task) => task.done).length}/{dayTasks.length} tasks</p>
                </span>
                <span className="tag">{Math.round(data.sessions.filter((s) => s.start.slice(0, 10) === day).reduce((sum, s) => sum + s.actualSeconds, 0) / 60)}m</span>
              </button>
            );
          })}
        </div>

        <section className="card" style={{ gridColumn: 'span 2' }}>
          <div className="eyebrow">{dateLabel(selected)}</div>
          <h2 className="section-title" style={{ margin: '7px 0 8px' }}>The shape of this day</h2>
          <div className="stat-line" style={{ marginBottom: 17 }}>
            <span className="muted">Task completion</span>
            <strong>{completionPercentage}% · {completedCount}/{selectedTasks.length || 0}</strong>
          </div>
          <div className="progress-track" style={{ marginBottom: 20 }}>
            <div className="progress-bar mint" style={{ width: `${completionPercentage}%` }} />
          </div>

          <div className="history-detail-grid">
            <div>
              <div className="eyebrow">Tasks</div>
              <div className="grid" style={{ gap: 9, marginTop: 10 }}>
                {selectedTasks.map((task) => (
                  <div className={cx('schedule-item', task.done ? '' : 'coral')} key={task.id}>
                    <div>
                      <p style={{ textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</p>
                      <span>{task.category} · {task.done ? 'completed' : 'incomplete'}</span>
                    </div>
                    {task.done ? <Check size={16} color="var(--mint-ink)" /> : <Circle size={16} color="var(--coral)" />}
                  </div>
                ))}
                {!selectedTasks.length && <p className="tiny">No tasks were due, scheduled, or completed on this day.</p>}
              </div>
            </div>

            <div>
              <div className="eyebrow">Focus by category</div>
              <div className="grid" style={{ gap: 9, marginTop: 10 }}>
                {categories.map((category) => {
                  const total = chosenSessions.filter((session) => session.category === category).reduce((sum, session) => sum + session.actualSeconds, 0);
                  return (
                    <div className="stat-line" key={category}>
                      <span className="muted">{category}</span>
                      <strong>{Math.round(total / 60)}m</strong>
                    </div>
                  );
                })}
              </div>

              <div className="eyebrow" style={{ marginTop: 22 }}>Workout</div>
              {chosenExercises.length ? (
                <p className="tiny" style={{ marginTop: 8 }}>
                  {chosenExercises.filter((exercise) => exercise.completed).length} of {chosenExercises.length} exercises completed · {chosenExercises.reduce((sum, exercise) => sum + exercise.sets * exercise.reps, 0)} total reps
                </p>
              ) : (
                <p className="tiny" style={{ marginTop: 8 }}>No workout logged.</p>
              )}
            </div>
          </div>

          {!selectedTasks.length && !chosenSessions.length && !chosenExercises.length && <Empty title="A quiet day" text="No activity was recorded here." />}
        </section>
      </div>
    ) : (
      <Empty icon={History} title="Your history starts here" text="Complete a task, plan a day, log a workout, or finish a focus session, and it will appear." action={<Link href="/study" className="primary-button" data-testid="button-history-focus"><Play size={14} /> Start focus</Link>} />
    )}
  </div>;
}

function Profile() {
  const data = useData();
  const [name, setName] = useState(data.settings.name);
  const [saved, setSaved] = useState(false);

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    data.updateSettings({ name: name.trim(), avatar: initials(name) });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return <div className="page">
    <PageHeading eyebrow="Profile" title="Make it yours." description="A small identity for a very personal practice." />
    <div className="grid grid-2">
      <section className="card">
        <div className="card-title">
          <div><div className="eyebrow">Your details</div><h2 className="section-title">How should Do-Fo-Done greet you?</h2></div>
          <span className="avatar" style={{ width: 50, height: 50, fontSize: 16 }}>{initials(name)}</span>
        </div>
        <form onSubmit={save}>
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-profile-name" />
          </Field>
          <div className="modal-footer" style={{ marginTop: 18 }}>
            <button className="primary-button" type="submit" data-testid="button-save-profile">Save profile</button>
          </div>
          {saved && <p className="tiny" style={{ color: 'var(--mint-ink)', marginTop: 8 }}>Saved locally.</p>}
        </form>
      </section>

      <section className="card">
        <div className="eyebrow">Your footprint</div>
        <h2 className="section-title" style={{ margin: '7px 0 18px' }}>Built from your days</h2>
        <div className="stat-line" style={{ marginBottom: 15 }}>
          <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ListChecks size={14} /> Tasks captured</span>
          <strong>{data.tasks.length}</strong>
        </div>
        <div className="stat-line" style={{ marginBottom: 15 }}>
          <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Clock3 size={14} /> Focus sessions</span>
          <strong>{data.sessions.length}</strong>
        </div>
        <div className="stat-line" style={{ marginBottom: 15 }}>
          <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FolderKanban size={14} /> Projects</span>
          <strong>{data.projects.length}</strong>
        </div>
        <div className="stat-line">
          <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Flame size={14} /> Workout streak</span>
          <strong>{calculateStreak(data.workoutCalendar)} days</strong>
        </div>
      </section>
    </div>
  </div>;
}

function MusicLibrary() {
  const data = useData();
  const [error, setError] = useState('');
  const addFile = (file: File) => {
    setError('');
    if (!file.type.startsWith('audio/')) return setError('Choose an audio file.');
    if (file.size > 4 * 1024 * 1024) return setError('Keep device tracks under 4 MB so your offline library stays reliable.');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') data.addMusicTrack({ name: file.name.replace(/\.[^/.]+$/, ''), type: file.type, dataUrl: reader.result });
    };
    reader.onerror = () => setError('That file could not be added. Try another audio file.');
    reader.readAsDataURL(file);
  };
  return <div className="card music-library">
    <div className="card-title"><div><div className="eyebrow">Add music</div><h2 className="section-title">Your own soundtrack</h2></div><Music2 size={18} color="var(--coral)" /></div>
    <p className="tiny" style={{ marginBottom: 15 }}>Add small audio files from this device. They stay in your private browser library.</p>
    <label className="soft-button music-upload-button"><Upload size={14} /> Choose audio file<input type="file" accept="audio/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) addFile(file); event.currentTarget.value = ''; }} data-testid="input-add-music" /></label>
    {error && <p className="error-text">{error}</p>}
    {data.musicTracks.length ? (
      <div className="music-library-list">
        {data.musicTracks.map((track) => (
          <div className="music-library-row" key={track.id}>
            <Music2 size={14} color="var(--coral)" />
            <span>{track.name}</span>
            <button className="icon-button" onClick={() => data.deleteMusicTrack(track.id)} aria-label={`Remove ${track.name}`} data-testid={`button-remove-music-${track.id}`}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    ) : (
      <p className="tiny music-library-empty">No device tracks added yet.</p>
    )}
  </div>;
}

function SettingsPage() {
  const data = useData();
  const [confirm, setConfirm] = useState(false);
  const update = (patch: Parameters<typeof data.updateSettings>[0]) => data.updateSettings(patch);

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ tasks: data.tasks, activities: data.activities, sessions: data.sessions, notes: data.notes, exercises: data.exercises, projects: data.projects, water: data.water, waterUnit: data.waterUnit, musicTracks: data.musicTracks, settings: data.settings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focusflow-${dateKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return <div className="page">
    <PageHeading eyebrow="Settings" title="Set the conditions." description="Preferences and music stay private in this browser." />
    <div className="grid grid-2">
      <section className="card">
        <div className="eyebrow">Preferences</div>

        {/* Visual Theme Selection Cards */}
        <div style={{ margin: '14px 0 20px' }}>
          <strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Color theme</strong>
          <p className="tiny" style={{ marginBottom: 10 }}>Choose the lighting that helps you concentrate.</p>
          <div className="theme-picker-grid">
            <button
              type="button"
              className={cx('theme-card-option', data.settings.theme === 'light' && 'active')}
              onClick={() => update({ theme: 'light' })}
            >
              <div className="theme-preview-box light">
                <div className="theme-mini-sidebar" />
                <div className="theme-mini-content">
                  <div className="theme-mini-bar" style={{ width: '60%' }} />
                  <div className="theme-mini-bar" style={{ width: '90%' }} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
                <Sun size={14} color="#f59e0b" /> Warm Paper (Light)
              </div>
            </button>

            <button
              type="button"
              className={cx('theme-card-option', data.settings.theme === 'dark' && 'active')}
              onClick={() => update({ theme: 'dark' })}
            >
              <div className="theme-preview-box dark">
                <div className="theme-mini-sidebar" />
                <div className="theme-mini-content">
                  <div className="theme-mini-bar" style={{ width: '60%' }} />
                  <div className="theme-mini-bar" style={{ width: '90%' }} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
                <Moon size={14} color="#6366f1" /> Obsidian (Dark)
              </div>
            </button>
          </div>
        </div>

        <div className="settings-group">
          <div className="setting-row">
            <div><strong>Theme toggle</strong><p>Quick button switch.</p></div>
            <div className="setting-control">
              <button className="soft-button" onClick={() => update({ theme: data.settings.theme === 'light' ? 'dark' : 'light' })} data-testid="button-toggle-theme">
                {data.settings.theme === 'light' ? <Sun size={14} /> : <Moon size={14} />}
                {data.settings.theme === 'light' ? 'Light' : 'Dark'}
              </button>
            </div>
          </div>
          <div className="setting-row"><div><strong>Focus minutes</strong><p>Length of a new focus session.</p></div><div className="setting-control"><input type="number" min="1" max="180" value={data.settings.pomodoro} onChange={(e) => update({ pomodoro: Math.max(1, Number(e.target.value)) })} style={{ width: 70, padding: 8, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)' }} data-testid="input-pomodoro" /></div></div>
          <div className="setting-row"><div><strong>Break minutes</strong><p>Reset time between focus sessions.</p></div><div className="setting-control"><input type="number" min="1" max="60" value={data.settings.breakMinutes} onChange={(e) => update({ breakMinutes: Math.max(1, Number(e.target.value)) })} style={{ width: 70, padding: 8, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)' }} data-testid="input-break-minutes" /></div></div>
          <div className="setting-row"><div><strong>Daily water goal</strong><p>Goal in millilitres.</p></div><div className="setting-control"><input type="number" min="1" max="20000" step="50" value={data.settings.waterGoal} onChange={(e) => update({ waterGoal: Math.max(1, Number(e.target.value)) })} style={{ width: 70, padding: 8, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)' }} data-testid="input-water-goal" /></div></div>
          <div className="setting-row"><div><strong>Notifications</strong><p>Ask for permission only when you opt in.</p></div><button className={cx('toggle', data.settings.notifications && 'on')} onClick={async () => { if (!data.settings.notifications && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); update({ notifications: !data.settings.notifications }); }} aria-label="Toggle notifications" data-testid="button-toggle-notifications"><span /></button></div>
          <div className="setting-row"><div><strong>Timer sounds</strong><p>Play a quiet countdown tick and a chime when the timer finishes.</p></div><button className={cx('toggle', data.settings.timerSounds && 'on')} onClick={() => update({ timerSounds: !data.settings.timerSounds })} aria-label="Toggle timer sounds" data-testid="button-toggle-timer-sounds"><span /></button></div>
          <div className="setting-row"><div><strong>Music volume</strong><p>The player stays quiet until a source is available.</p></div><div className="setting-control" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Volume2 size={14} color="var(--ink-soft)" /><input type="range" min="0" max="100" value={data.settings.volume} onChange={(e) => update({ volume: Number(e.target.value) })} data-testid="input-volume" /></div></div>
        </div>
      </section>

      <section className="grid" style={{ alignContent: 'start' }}>
        <MusicLibrary />
        <div className="card"><div className="eyebrow">Your data</div><h2 className="section-title" style={{ margin: '7px 0 8px' }}>Portable by default</h2><p className="tiny" style={{ marginBottom: 17 }}>Export a readable JSON copy any time. Nothing leaves this browser unless you move it yourself.</p><button className="soft-button" onClick={exportData} data-testid="button-export-data">Export my data</button></div>
        <div className="card"><div className="eyebrow">Start over</div><h2 className="section-title" style={{ margin: '7px 0 8px' }}>Reset local data</h2><p className="tiny" style={{ marginBottom: 17 }}>This permanently removes your tasks, sessions, projects, and preferences from this browser.</p>{confirm ? <div style={{ display: 'flex', gap: 8 }}><button className="danger-button" onClick={() => data.resetAll()} data-testid="button-confirm-reset">Yes, reset everything</button><button className="soft-button" onClick={() => setConfirm(false)} data-testid="button-cancel-reset">Cancel</button></div> : <button className="danger-button" onClick={() => setConfirm(true)} data-testid="button-reset-data">Reset local data</button>}</div>
      </section>
    </div>
  </div>;
}

function NotFound() { return <div className="page"><Empty icon={Search} title="This page wandered off" text="Use the navigation to find your way back into the flow." action={<Link href="/" className="primary-button" data-testid="link-not-found-home">Back to today</Link>} /></div>; }

export default App;
