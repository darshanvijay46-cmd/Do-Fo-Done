import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type Category = 'Study' | 'Coding' | 'Workout' | 'Work' | 'Personal' | 'Other';
export type Priority = 'low' | 'medium' | 'high';
export type ProjectStatus = 'planning' | 'active' | 'paused' | 'done';
export type WorkoutDayType = 'workout' | 'rest';

export interface WorkoutCalendarDay {

  date: string; // YYYY-MM-DD

  type: WorkoutDayType;

  completed: boolean;

}
export interface Task {
  id: string; title: string; description: string; category: Category; priority: Priority;
  estimate: number; deadline: string; reminder: string; done: boolean; completedAt?: string;
  actualSeconds: number; projectId?: string; scheduledTime?: string;
}
export interface Activity {
  id: string; title: string; taskId?: string; category: Category; date: string; start: string; duration: number; completed?: boolean;
}
export interface FocusSession { id: string; taskId?: string; category: Category; start: string; end: string; actualSeconds: number; }
export interface StudyNote { id: string; text: string; date: string; }
export interface StickyNote { id: string; title: string; content: string; x: number; y: number; createdAt: string; updatedAt: string; folderId?: string; }
export interface StickyFolder { id: string; title: string; x: number; y: number; createdAt: string; updatedAt: string; }
export interface Exercise {
  id: string; name: string; sets: number; reps: number; weight: number; completed: boolean; date: string;
  mode?: 'reps' | 'time'; target?: number; durationSeconds?: number;
  timerRemaining?: number; timerStartedAt?: number; sessionStarted?: boolean;
}
export interface WorkoutProjectExercise {
  id: string;
  name: string;
  category: string;
  mode: 'timed' | 'untimed';
  target: number;
}
export interface WorkoutPlanExercise extends WorkoutProjectExercise {
  completed: boolean;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  deadline: string;
  priority: Priority;
  status: ProjectStatus;

  // 'normal' = regular Work project
  // 'workout' = reusable Workout project
  type?: 'normal' | 'workout';

  // Only used when type === 'workout'
  workoutExercises?: WorkoutProjectExercise[];
}
export interface TimerState {
  taskId?: string; category: Category; mode: 'focus' | 'break' | 'stopwatch'; duration: number;
  startedAt?: number; elapsedBefore: number; startIso?: string;
}
export interface Settings {
  name: string; avatar: string; theme: 'light' | 'dark'; pomodoro: number; breakMinutes: number;
  waterGoal: number; notifications: boolean; timerSounds: boolean; environment: string; volume: number; musicEnabled: boolean;
  ambientEnabled: boolean; ambientVolume: number; ambientMuted: boolean;
}
export interface MusicTrack { id: string; name: string; type: string; dataUrl: string; }
export interface YouTubeTrack { videoId: string; title: string; channel: string; thumbnail: string; }
export interface AppData {
  workoutPlan: WorkoutPlanExercise[];
  workoutPlans: Record<string, WorkoutPlanExercise[]>;
  activeWorkoutScheduleId?: string;
  workoutCalendar: Record<string, WorkoutCalendarDay>;
  tasks: Task[]; activities: Activity[]; sessions: FocusSession[]; notes: StudyNote[];
  stickyNotes: StickyNote[]; stickyFolders: StickyFolder[];
  exercises: Exercise[]; projects: Project[]; water: Record<string, number>; musicTracks: MusicTrack[];
  waterUnit: 'ml';
  youtubeQueue: YouTubeTrack[]; youtubeFavorites: YouTubeTrack[]; youtubeRecent: YouTubeTrack[]; youtubeCurrent?: YouTubeTrack;
  settings: Settings; timer?: TimerState;
}

const KEY_PREFIX = 'focusflow-data-v1';
const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const defaultData: AppData = {
  workoutPlan: [],
  workoutPlans: {},
  workoutCalendar: {},
  tasks: [], activities: [], sessions: [], notes: [], stickyNotes: [], stickyFolders: [], exercises: [], projects: [], water: {}, waterUnit: 'ml', musicTracks: [], youtubeQueue: [], youtubeFavorites: [], youtubeRecent: [],
  settings: { name: 'Your name', avatar: 'YN', theme: 'light', pomodoro: 25, breakMinutes: 5, waterGoal: 2000, notifications: false, timerSounds: true, environment: 'Rain on Glass', volume: 55, musicEnabled: false, ambientEnabled: false, ambientVolume: 24, ambientMuted: false },
};

function readData(key: string, initialName: string): AppData {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) {
      return {
        ...defaultData,
        settings: { ...defaultData.settings, name: initialName || defaultData.settings.name },
      };
    }
    const parsed = JSON.parse(saved);
    const waterAlreadyUsesMl = parsed.waterUnit === 'ml';
    const water = Object.fromEntries(
      Object.entries(parsed.water ?? {}).map(([date, amount]) => [
        date,
        waterAlreadyUsesMl ? amount : Number(amount) * 250,
      ]),
    );
    const storedWaterGoal = parsed.settings?.waterGoal;
    const settings = {
      ...defaultData.settings,
      ...parsed.settings,
      environment: parsed.settings?.environment === 'Rain on glass' ? 'Rain on Glass' : parsed.settings?.environment ?? defaultData.settings.environment,
      waterGoal: waterAlreadyUsesMl
        ? storedWaterGoal ?? defaultData.settings.waterGoal
        : (storedWaterGoal ?? 8) * 250,
    };
    const workoutPlan = Array.isArray(parsed.workoutPlan) ? parsed.workoutPlan : [];
    const workoutPlans = parsed.workoutPlans && typeof parsed.workoutPlans === 'object' ? parsed.workoutPlans : {};
    return { ...defaultData, ...parsed, workoutPlan, workoutPlans: { ...workoutPlans, default: workoutPlans.default ?? workoutPlan }, stickyNotes: Array.isArray(parsed.stickyNotes) ? parsed.stickyNotes : [], stickyFolders: Array.isArray(parsed.stickyFolders) ? parsed.stickyFolders : [], water, waterUnit: 'ml', settings };
  } catch { return defaultData; }
}

interface Store extends AppData {
  updateWorkoutPlan: (plan: WorkoutPlanExercise[] | ((current: WorkoutPlanExercise[]) => WorkoutPlanExercise[]), scheduleId?: string) => void;
  setActiveWorkoutSchedule: (scheduleId?: string) => void;
  setWorkoutDay: (date: string, type: WorkoutDayType) => void;
  clearWorkoutDay: (date: string) => void;
  completeWorkoutDay: (date: string) => void;
  addTask: (task: Omit<Task, 'id' | 'done' | 'actualSeconds'>) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addActivity: (activity: Omit<Activity, 'id'>) => void;
  updateActivity: (id: string, patch: Partial<Activity>) => void;
  deleteActivity: (id: string) => void;
  addSession: (session: Omit<FocusSession, 'id'>) => void;
  addNote: (text: string, date?: string) => void;
  updateNote: (id: string, text: string) => void;
  deleteNote: (id: string) => void;
  addStickyNote: (title: string, content: string, x: number, y: number) => void;
  updateStickyNote: (id: string, patch: Pick<StickyNote, 'title' | 'content'>) => void;
  moveStickyNote: (id: string, x: number, y: number) => void;
  moveStickyFolder: (id: string, x: number, y: number) => void;
  groupStickyNotes: (firstId: string, secondId: string, x: number, y: number) => string | undefined;
  addStickyNoteToFolder: (noteId: string, folderId: string) => void;
  mergeStickyFolders: (sourceId: string, targetId: string) => void;
  extractStickyNote: (noteId: string, x: number, y: number) => void;
  deleteStickyNote: (id: string) => void;
  addExercise: (exercise: Omit<Exercise, 'id'>) => void;
  updateExercise: (id: string, patch: Partial<Exercise>) => void;
  deleteExercise: (id: string) => void;
  addProject: (project: Omit<Project, 'id'>) => void;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  addMusicTrack: (track: Omit<MusicTrack, 'id'>) => void;
  deleteMusicTrack: (id: string) => void;
  setMusicEnabled: (enabled: boolean) => void;
  setYoutubeQueue: (tracks: YouTubeTrack[]) => void;
  setYoutubeCurrent: (track?: YouTubeTrack) => void;
  toggleYoutubeFavorite: (track: YouTubeTrack) => void;
  addYoutubeRecent: (track: YouTubeTrack) => void;
  setWater: (date: string, count: number) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  startTimer: (taskId?: string, mode?: 'focus' | 'break' | 'stopwatch') => void;
  addFiveMinutes: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  finishTimer: () => void;
  timerSeconds: () => number;
  resetAll: () => void;
}
const DataContext = createContext<Store | null>(null);

export function DataProvider({ children, userId, initialName }: { children: ReactNode; userId: string; initialName: string }) {
  const storageKey = `${KEY_PREFIX}-${userId}`;
  const [data, setData] = useState<AppData>(() => readData(storageKey, initialName));
  const workoutPlansRef = useRef(data.workoutPlans);
  workoutPlansRef.current = data.workoutPlans;
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(data)); }, [data, storageKey]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', data.settings.theme === 'dark');
  }, [data.settings.theme]);

  const store = useMemo<Store>(() => {
    const patch = (fn: (draft: AppData) => void) => setData((current) => { const next = { ...current }; fn(next); return next; });
    return {
      ...data,
      updateWorkoutPlan: (plan, scheduleId = 'default') => {
        const currentPlan = workoutPlansRef.current[scheduleId] ?? (scheduleId === 'default' ? data.workoutPlan : []);
        const nextPlan = typeof plan === 'function' ? plan(currentPlan) : plan;
        const nextPlans = { ...workoutPlansRef.current, [scheduleId]: nextPlan };
        workoutPlansRef.current = nextPlans;
        setData((current) => ({ ...current, workoutPlan: scheduleId === 'default' ? nextPlan : current.workoutPlan, workoutPlans: nextPlans }));

        // Persist the plan in the existing AppData record immediately. The
        // provider's general persistence effect still writes the full state,
        // while this write protects plan edits from a rapid route change or
        // page refresh before that effect runs.
        try {
          const saved = localStorage.getItem(storageKey);
          const persisted = saved ? JSON.parse(saved) as Partial<AppData> : {};
          localStorage.setItem(storageKey, JSON.stringify({ ...persisted, workoutPlan: scheduleId === 'default' ? nextPlan : persisted.workoutPlan ?? data.workoutPlan, workoutPlans: nextPlans }));
        } catch {
          // Keep in-memory state usable if browser storage is unavailable.
        }
      },
      setActiveWorkoutSchedule: (scheduleId) => patch((d) => { d.activeWorkoutScheduleId = scheduleId; }),
      setWorkoutDay: (date, type) => patch((d) => { d.workoutCalendar = { ...d.workoutCalendar, [date]: { date, type, completed: false } }; }),
      clearWorkoutDay: (date) => patch((d) => { const workoutCalendar = { ...d.workoutCalendar }; delete workoutCalendar[date]; d.workoutCalendar = workoutCalendar; }),
      completeWorkoutDay: (date) => patch((d) => {
        const day = d.workoutCalendar[date];
        if (day?.type === 'workout') d.workoutCalendar = { ...d.workoutCalendar, [date]: { ...day, completed: true } };
      }),
      addTask: (task) => patch((d) => { d.tasks = [{ ...task, id: uid('task'), done: false, actualSeconds: 0 }, ...d.tasks]; }),
      updateTask: (id, change) => patch((d) => {
        d.tasks = d.tasks.map((task) => task.id === id ? { ...task, ...change } : task);
        d.activities = d.activities.map((activity) => activity.taskId !== id ? activity : {
          ...activity,
          ...(change.title !== undefined ? { title: change.title } : {}),
          ...(change.category !== undefined ? { category: change.category } : {}),
          ...(change.estimate !== undefined ? { duration: change.estimate } : {}),
          ...(change.done !== undefined ? { completed: change.done } : {}),
          ...(change.deadline !== undefined && change.deadline ? { date: change.deadline } : {}),
          ...(change.scheduledTime !== undefined && change.scheduledTime ? { start: change.scheduledTime } : {}),
        });
      }),
      deleteTask: (id) => patch((d) => {
        const linkedActivities = d.activities.filter((activity) => activity.taskId === id);
        d.tasks = d.tasks.filter((task) => task.id !== id);
        d.activities = d.activities.filter((activity) => activity.taskId !== id);
        const workoutPlans = { ...d.workoutPlans };
        delete workoutPlans[id];
        linkedActivities.forEach((activity) => delete workoutPlans[activity.id]);
        d.workoutPlans = workoutPlans;
        if (d.activeWorkoutScheduleId === id || linkedActivities.some((activity) => activity.id === d.activeWorkoutScheduleId)) d.activeWorkoutScheduleId = undefined;
      }),
      addActivity: (activity) => patch((d) => { d.activities = [...d.activities, { ...activity, id: uid('activity') }]; }),
      updateActivity: (id, change) => patch((d) => { d.activities = d.activities.map((a) => a.id === id ? { ...a, ...change } : a); }),
      deleteActivity: (id) => patch((d) => {
        const activity = d.activities.find((item) => item.id === id);
        d.activities = d.activities.filter((item) => item.id !== id);
        if (!activity?.taskId || !d.tasks.some((task) => task.id === activity.taskId && task.category === 'Workout')) {
          const workoutPlans = { ...d.workoutPlans };
          delete workoutPlans[id];
          d.workoutPlans = workoutPlans;
        }
        if (d.activeWorkoutScheduleId === id) d.activeWorkoutScheduleId = undefined;
      }),
      addSession: (session) => patch((d) => { d.sessions = [{ ...session, id: uid('session') }, ...d.sessions]; }),
      addNote: (text, date = today()) => patch((d) => { d.notes = [{ id: uid('note'), text, date }, ...d.notes]; }),
      updateNote: (id, text) => patch((d) => { d.notes = d.notes.map((note) => note.id === id ? { ...note, text } : note); }),
      deleteNote: (id) => patch((d) => { d.notes = d.notes.filter((note) => note.id !== id); }),
      addStickyNote: (title, content, x, y) => patch((d) => {
        const now = new Date().toISOString();
        d.stickyNotes = [...d.stickyNotes, { id: uid('sticky'), title: title.trim(), content, x, y, createdAt: now, updatedAt: now }];
      }),
      updateStickyNote: (id, change) => patch((d) => {
        const now = new Date().toISOString();
        const current = d.stickyNotes.find((note) => note.id === id);
        const title = change.title.trim();
        const leavesFolder = Boolean(current?.folderId && title.replace(/\s+/g, ' ').toLowerCase() !== d.stickyFolders.find((folder) => folder.id === current.folderId)?.title.trim().replace(/\s+/g, ' ').toLowerCase());
        d.stickyNotes = d.stickyNotes.map((note) => note.id === id ? { ...note, ...change, title, ...(leavesFolder ? { folderId: undefined } : {}), updatedAt: now } : note);
        if (leavesFolder && current?.folderId) {
          const remaining = d.stickyNotes.filter((note) => note.folderId === current.folderId);
          if (remaining.length === 1) {
            const folder = d.stickyFolders.find((item) => item.id === current.folderId);
            d.stickyNotes = d.stickyNotes.map((note) => note.id === remaining[0].id ? { ...note, folderId: undefined, x: folder?.x ?? note.x, y: folder?.y ?? note.y } : note);
            d.stickyFolders = d.stickyFolders.filter((item) => item.id !== current.folderId);
          } else if (!remaining.length) d.stickyFolders = d.stickyFolders.filter((item) => item.id !== current.folderId);
        }
      }),
      moveStickyNote: (id, x, y) => patch((d) => {
        d.stickyNotes = d.stickyNotes.map((note) => note.id === id ? { ...note, x, y, updatedAt: new Date().toISOString() } : note);
      }),
      moveStickyFolder: (id, x, y) => patch((d) => {
        d.stickyFolders = d.stickyFolders.map((folder) => folder.id === id ? { ...folder, x, y, updatedAt: new Date().toISOString() } : folder);
      }),
      groupStickyNotes: (firstId, secondId, x, y) => {
        const first = data.stickyNotes.find((note) => note.id === firstId);
        const second = data.stickyNotes.find((note) => note.id === secondId);
        if (!first || !second || first.id === second.id || first.folderId || second.folderId || first.title.trim().replace(/\s+/g, ' ').toLowerCase() !== second.title.trim().replace(/\s+/g, ' ').toLowerCase()) return undefined;
        const folderId = uid('sticky-folder');
        patch((d) => {
          const now = new Date().toISOString();
          d.stickyFolders = [...d.stickyFolders, { id: folderId, title: first.title.trim(), x, y, createdAt: now, updatedAt: now }];
          d.stickyNotes = d.stickyNotes.map((note) => note.id === firstId || note.id === secondId ? { ...note, folderId, updatedAt: now } : note);
        });
        return folderId;
      },
      addStickyNoteToFolder: (noteId, folderId) => patch((d) => {
        const note = d.stickyNotes.find((item) => item.id === noteId);
        const folder = d.stickyFolders.find((item) => item.id === folderId);
        if (!note || !folder || note.title.trim().replace(/\s+/g, ' ').toLowerCase() !== folder.title.trim().replace(/\s+/g, ' ').toLowerCase()) return;
        const now = new Date().toISOString();
        d.stickyNotes = d.stickyNotes.map((item) => item.id === noteId ? { ...item, folderId, updatedAt: now } : item);
        d.stickyFolders = d.stickyFolders.map((item) => item.id === folderId ? { ...item, updatedAt: now } : item);
      }),
      mergeStickyFolders: (sourceId, targetId) => patch((d) => {
        if (sourceId === targetId) return;
        const source = d.stickyFolders.find((folder) => folder.id === sourceId);
        const target = d.stickyFolders.find((folder) => folder.id === targetId);
        if (!source || !target || source.title.trim().replace(/\s+/g, ' ').toLowerCase() !== target.title.trim().replace(/\s+/g, ' ').toLowerCase()) return;
        const now = new Date().toISOString();
        d.stickyNotes = d.stickyNotes.map((note) => note.folderId === sourceId ? { ...note, folderId: targetId, updatedAt: now } : note);
        d.stickyFolders = d.stickyFolders.filter((folder) => folder.id !== sourceId).map((folder) => folder.id === targetId ? { ...folder, updatedAt: now } : folder);
      }),
      extractStickyNote: (noteId, x, y) => patch((d) => {
        const note = d.stickyNotes.find((item) => item.id === noteId);
        if (!note) return;
        const folderId = note.folderId;
        const now = new Date().toISOString();
        d.stickyNotes = d.stickyNotes.map((item) => item.id === noteId ? { ...item, folderId: undefined, x, y, updatedAt: now } : item);
        if (folderId) {
          const remaining = d.stickyNotes.filter((item) => item.folderId === folderId);
          if (remaining.length === 1) {
            const folder = d.stickyFolders.find((item) => item.id === folderId);
            d.stickyNotes = d.stickyNotes.map((item) => item.id === remaining[0].id ? { ...item, folderId: undefined, x: folder?.x ?? item.x, y: folder?.y ?? item.y, updatedAt: now } : item);
            d.stickyFolders = d.stickyFolders.filter((item) => item.id !== folderId);
          } else if (remaining.length === 0) d.stickyFolders = d.stickyFolders.filter((item) => item.id !== folderId);
        }
      }),
      deleteStickyNote: (id) => patch((d) => {
        const note = d.stickyNotes.find((item) => item.id === id);
        if (!note) return;
        d.stickyNotes = d.stickyNotes.filter((item) => item.id !== id);
        if (!note.folderId) return;
        const remaining = d.stickyNotes.filter((item) => item.folderId === note.folderId);
        if (remaining.length === 1) {
          const folder = d.stickyFolders.find((item) => item.id === note.folderId);
          d.stickyNotes = d.stickyNotes.map((item) => item.id === remaining[0].id ? { ...item, folderId: undefined, x: folder?.x ?? item.x, y: folder?.y ?? item.y } : item);
          d.stickyFolders = d.stickyFolders.filter((item) => item.id !== note.folderId);
        } else if (!remaining.length) d.stickyFolders = d.stickyFolders.filter((item) => item.id !== note.folderId);
      }),
      addExercise: (exercise) => patch((d) => { d.exercises = [{ ...exercise, id: uid('exercise') }, ...d.exercises]; }),
      updateExercise: (id, change) => patch((d) => { d.exercises = d.exercises.map((e) => e.id === id ? { ...e, ...change } : e); }),
      deleteExercise: (id) => patch((d) => { d.exercises = d.exercises.filter((e) => e.id !== id); }),
      addProject: (project) => patch((d) => { d.projects = [{ ...project, id: uid('project') }, ...d.projects]; }),
      updateProject: (id, change) => patch((d) => { d.projects = d.projects.map((p) => p.id === id ? { ...p, ...change } : p); }),
      deleteProject: (id) => patch((d) => { d.projects = d.projects.filter((p) => p.id !== id); d.tasks = d.tasks.map((t) => t.projectId === id ? { ...t, projectId: undefined } : t); }),
      addMusicTrack: (track) => patch((d) => { d.musicTracks = [...d.musicTracks, { ...track, id: uid('music') }]; }),
      deleteMusicTrack: (id) => patch((d) => { d.musicTracks = d.musicTracks.filter((track) => track.id !== id); }),
      setMusicEnabled: (enabled) => patch((d) => { d.settings = { ...d.settings, musicEnabled: enabled }; }),
      setYoutubeQueue: (tracks) => patch((d) => { d.youtubeQueue = tracks; }),
      setYoutubeCurrent: (track) => patch((d) => { d.youtubeCurrent = track; }),
      toggleYoutubeFavorite: (track) => patch((d) => { d.youtubeFavorites = d.youtubeFavorites.some((item) => item.videoId === track.videoId) ? d.youtubeFavorites.filter((item) => item.videoId !== track.videoId) : [track, ...d.youtubeFavorites]; }),
      addYoutubeRecent: (track) => patch((d) => { d.youtubeRecent = [track, ...d.youtubeRecent.filter((item) => item.videoId !== track.videoId)].slice(0, 10); }),
      setWater: (date, amountMl) => patch((d) => { d.water = { ...d.water, [date]: Math.max(0, amountMl) }; }),
      updateSettings: (change) => patch((d) => { d.settings = { ...d.settings, ...change }; }),
      startTimer: (taskId, mode = 'focus') => patch((d) => {
        const task = d.tasks.find((item) => item.id === taskId);
        const existing = d.timer && d.timer.taskId === taskId && d.timer.mode === mode ? d.timer : undefined;
        d.timer = { taskId, category: task?.category ?? existing?.category ?? 'Study', mode, duration: existing?.duration ?? (mode === 'focus' ? task?.estimate ?? d.settings.pomodoro : mode === 'break' ? d.settings.breakMinutes : 0) * 60, elapsedBefore: existing?.elapsedBefore ?? 0, startedAt: Date.now(), startIso: existing?.startIso ?? new Date().toISOString() };
      }),
      addFiveMinutes: () => patch((d) => {
        if (!d.timer) return;
        if (d.timer.mode === 'stopwatch') {
          const elapsed = d.timer.elapsedBefore + (d.timer.startedAt ? Math.floor((Date.now() - d.timer.startedAt) / 1000) : 0);
          d.timer = { ...d.timer, elapsedBefore: elapsed + 300, startedAt: d.timer.startedAt ? Date.now() : undefined };
        } else d.timer = { ...d.timer, duration: d.timer.duration + 300 };
      }),
      pauseTimer: () => patch((d) => {
        if (!d.timer?.startedAt) return;
        d.timer = { ...d.timer, elapsedBefore: d.timer.elapsedBefore + Math.floor((Date.now() - d.timer.startedAt) / 1000), startedAt: undefined };
      }),
      resetTimer: () => patch((d) => { d.timer = undefined; }),
      finishTimer: () => patch((d) => {
        if (!d.timer) return;
        const elapsed = d.timer.elapsedBefore + (d.timer.startedAt ? Math.floor((Date.now() - d.timer.startedAt) / 1000) : 0);
        const seconds = d.timer.mode === 'stopwatch' ? elapsed : Math.min(d.timer.duration, elapsed);
        const end = new Date().toISOString();
        if (d.timer.mode === 'focus' && seconds > 0) {
          d.sessions = [{ id: uid('session'), taskId: d.timer.taskId, category: d.timer.category, start: d.timer.startIso ?? end, end, actualSeconds: seconds }, ...d.sessions];
          if (d.timer.taskId) d.tasks = d.tasks.map((task) => task.id === d.timer?.taskId ? { ...task, actualSeconds: task.actualSeconds + seconds } : task);
        }
        if (d.timer.taskId) d.tasks = d.tasks.map((task) => task.id === d.timer?.taskId ? { ...task, done: true, completedAt: end } : task);
        d.timer = undefined;
      }),
      timerSeconds: () => data.timer ? (data.timer.mode === 'stopwatch' ? data.timer.elapsedBefore + (data.timer.startedAt ? Math.floor((Date.now() - data.timer.startedAt) / 1000) : 0) : Math.min(data.timer.duration, data.timer.elapsedBefore + (data.timer.startedAt ? Math.floor((Date.now() - data.timer.startedAt) / 1000) : 0))) : 0,
      resetAll: () => setData(defaultData),
    };
  }, [data]);
  return <DataContext.Provider value={store}>{children}</DataContext.Provider>;
}
export function useData() {
  const value = useContext(DataContext);
  if (!value) throw new Error('useData must be used inside DataProvider');
  return value;
}
export const dateKey = today;
export const makeId = uid;
export function formatDate(value: string) {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}
export function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'YN';
}
export const categories: Category[] = ['Study', 'Coding', 'Workout', 'Work', 'Personal', 'Other'];
