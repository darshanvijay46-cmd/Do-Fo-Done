import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type Category = 'Study' | 'Coding' | 'Workout' | 'Work' | 'Personal' | 'Other';
export type Priority = 'low' | 'medium' | 'high';
export type ProjectStatus = 'planning' | 'active' | 'paused' | 'done';

export interface Task {
  id: string; title: string; description: string; category: Category; priority: Priority;
  estimate: number; deadline: string; reminder: string; done: boolean; completedAt?: string;
  actualSeconds: number; projectId?: string; scheduledTime?: string;
}
export interface Activity {
  id: string; title: string; taskId?: string; category: Category; date: string; start: string; duration: number;
}
export interface FocusSession { id: string; taskId?: string; category: Category; start: string; end: string; actualSeconds: number; }
export interface StudyNote { id: string; text: string; date: string; }
export interface Exercise { id: string; name: string; sets: number; reps: number; weight: number; completed: boolean; date: string; }
export interface Project { id: string; name: string; description: string; deadline: string; priority: Priority; status: ProjectStatus; }
export interface TimerState {
  taskId?: string; category: Category; mode: 'focus' | 'break' | 'stopwatch'; duration: number;
  startedAt?: number; elapsedBefore: number; startIso?: string;
}
export interface Settings {
  name: string; avatar: string; theme: 'light' | 'dark'; pomodoro: number; breakMinutes: number;
  waterGoal: number; notifications: boolean; environment: string; volume: number;
}
export interface MusicTrack { id: string; name: string; type: string; dataUrl: string; }
export interface AppData {
  tasks: Task[]; activities: Activity[]; sessions: FocusSession[]; notes: StudyNote[];
  exercises: Exercise[]; projects: Project[]; water: Record<string, number>; musicTracks: MusicTrack[]; settings: Settings; timer?: TimerState;
}

const KEY_PREFIX = 'focusflow-data-v1';
const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const defaultData: AppData = {
  tasks: [], activities: [], sessions: [], notes: [], exercises: [], projects: [], water: {}, musicTracks: [],
  settings: { name: 'Your name', avatar: 'YN', theme: 'light', pomodoro: 25, breakMinutes: 5, waterGoal: 8, notifications: false, environment: 'Rain on glass', volume: 55 },
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
    return { ...defaultData, ...parsed, settings: { ...defaultData.settings, ...parsed.settings } };
  } catch { return defaultData; }
}

interface Store extends AppData {
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
  addExercise: (exercise: Omit<Exercise, 'id'>) => void;
  updateExercise: (id: string, patch: Partial<Exercise>) => void;
  deleteExercise: (id: string) => void;
  addProject: (project: Omit<Project, 'id'>) => void;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  addMusicTrack: (track: Omit<MusicTrack, 'id'>) => void;
  deleteMusicTrack: (id: string) => void;
  setWater: (date: string, count: number) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  startTimer: (taskId?: string, mode?: 'focus' | 'break' | 'stopwatch') => void;
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
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(data)); }, [data, storageKey]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', data.settings.theme === 'dark');
  }, [data.settings.theme]);

  const store = useMemo<Store>(() => {
    const patch = (fn: (draft: AppData) => void) => setData((current) => { const next = { ...current }; fn(next); return next; });
    return {
      ...data,
      addTask: (task) => patch((d) => { d.tasks = [{ ...task, id: uid('task'), done: false, actualSeconds: 0 }, ...d.tasks]; }),
      updateTask: (id, change) => patch((d) => { d.tasks = d.tasks.map((task) => task.id === id ? { ...task, ...change } : task); }),
      deleteTask: (id) => patch((d) => { d.tasks = d.tasks.filter((task) => task.id !== id); d.activities = d.activities.filter((activity) => activity.taskId !== id); }),
      addActivity: (activity) => patch((d) => { d.activities = [...d.activities, { ...activity, id: uid('activity') }]; }),
      updateActivity: (id, change) => patch((d) => { d.activities = d.activities.map((a) => a.id === id ? { ...a, ...change } : a); }),
      deleteActivity: (id) => patch((d) => { d.activities = d.activities.filter((a) => a.id !== id); }),
      addSession: (session) => patch((d) => { d.sessions = [{ ...session, id: uid('session') }, ...d.sessions]; }),
      addNote: (text, date = today()) => patch((d) => { d.notes = [{ id: uid('note'), text, date }, ...d.notes]; }),
      updateNote: (id, text) => patch((d) => { d.notes = d.notes.map((note) => note.id === id ? { ...note, text } : note); }),
      deleteNote: (id) => patch((d) => { d.notes = d.notes.filter((note) => note.id !== id); }),
      addExercise: (exercise) => patch((d) => { d.exercises = [{ ...exercise, id: uid('exercise') }, ...d.exercises]; }),
      updateExercise: (id, change) => patch((d) => { d.exercises = d.exercises.map((e) => e.id === id ? { ...e, ...change } : e); }),
      deleteExercise: (id) => patch((d) => { d.exercises = d.exercises.filter((e) => e.id !== id); }),
      addProject: (project) => patch((d) => { d.projects = [{ ...project, id: uid('project') }, ...d.projects]; }),
      updateProject: (id, change) => patch((d) => { d.projects = d.projects.map((p) => p.id === id ? { ...p, ...change } : p); }),
      deleteProject: (id) => patch((d) => { d.projects = d.projects.filter((p) => p.id !== id); d.tasks = d.tasks.map((t) => t.projectId === id ? { ...t, projectId: undefined } : t); }),
      addMusicTrack: (track) => patch((d) => { d.musicTracks = [...d.musicTracks, { ...track, id: uid('music') }]; }),
      deleteMusicTrack: (id) => patch((d) => { d.musicTracks = d.musicTracks.filter((track) => track.id !== id); }),
      setWater: (date, count) => patch((d) => { d.water = { ...d.water, [date]: Math.max(0, count) }; }),
      updateSettings: (change) => patch((d) => { d.settings = { ...d.settings, ...change }; }),
      startTimer: (taskId, mode = 'focus') => patch((d) => {
        const task = d.tasks.find((item) => item.id === taskId);
        const existing = d.timer && d.timer.taskId === taskId && d.timer.mode === mode ? d.timer : undefined;
        d.timer = { taskId, category: task?.category ?? existing?.category ?? 'Study', mode, duration: existing?.duration ?? (mode === 'focus' ? d.settings.pomodoro : mode === 'break' ? d.settings.breakMinutes : 0) * 60, elapsedBefore: existing?.elapsedBefore ?? 0, startedAt: Date.now(), startIso: existing?.startIso ?? new Date().toISOString() };
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