import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Blocks, CalendarDays, Check, ChevronLeft, ChevronRight, Circle, Clock3, Droplets, ExternalLink, FolderKanban, GripVertical, History, LayoutDashboard, ListChecks, Moon, MoreHorizontal, Music2, Pause, Pencil, Play, Plus, RotateCcw, Search, Settings, Sparkles, Sun, Target, Trash2, Trophy, Upload, Volume2, X, Zap } from 'lucide-react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { DataProvider, categories, dateKey, formatDate, initials, useData, type Activity, type Category, type Exercise, type MusicTrack, type Priority, type Project, type ProjectStatus, type Task, type YouTubeTrack } from '@/lib/store';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

type YouTubePlayerApi = {
  destroy: () => void;
  cueVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
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
  return <WouterRouter base={basePath}><ClerkRoutes /></WouterRouter>;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to return to your flow' } },
      signUp: { start: { title: 'Create your FocusFlow account', subtitle: 'Keep your days in one private space' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/" component={HomeRoute} />
      <Route component={ProtectedApp} />
    </Switch>
  </ClerkProvider>;
}

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

function AuthLoading() {
  return <div className="auth-page"><div className="auth-loading"><span className="brand-mark" /><p>Preparing your private space…</p></div></div>;
}

function SignInPage() {
  return <div className="auth-page"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}

function SignUpPage() {
  return <div className="auth-page"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function HomeRoute() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <AuthLoading />;
  if (isSignedIn) return <Redirect to="/dashboard" />;
  return <LandingPage />;
}

function ProtectedApp() {
  const { isLoaded, isSignedIn, user } = useUser();
  if (!isLoaded) return <AuthLoading />;
  if (!isSignedIn || !user) return <Redirect to="/" />;
  const displayName = user.firstName || user.username || user.emailAddresses[0]?.emailAddress?.split('@')[0] || 'Your name';
  return <DataProvider userId={user.id} initialName={displayName}><Shell /></DataProvider>;
}

function LandingPage() {
  return <div className="landing-page"><div className="landing-orbit landing-orbit-one" /><div className="landing-orbit landing-orbit-two" /><header className="landing-header"><Link href="/" className="brand"><span className="brand-mark" /><span className="brand-name">FocusFlow</span></Link><div className="landing-actions"><Link href="/sign-in" className="soft-button">Sign in</Link><Link href="/sign-up" className="primary-button">Create account</Link></div></header><main className="landing-main"><div className="landing-copy"><div className="eyebrow">A calmer way to get things done</div><h1>Give your attention somewhere to land.</h1><p>FocusFlow connects the little pieces of a productive day: capture a task, shape the time, get into focus, and see the progress you actually made.</p><div className="landing-actions"><Link href="/sign-up" className="primary-button">Start your flow <ArrowRightIcon /></Link><Link href="/sign-in" className="landing-text-link">Already have an account? Sign in</Link></div></div><div className="landing-preview"><div className="preview-topline"><span className="tag">Today</span><span className="tiny">Your private workspace</span></div><div className="preview-heading">A little room to move.</div><div className="preview-progress"><span /><span /><span /><span /></div><div className="preview-task"><span className="preview-dot coral-dot" /><div><strong>Outline the project brief</strong><small>Study · 25 minutes</small></div><Check size={16} /></div><div className="preview-task"><span className="preview-dot mint-dot" /><div><strong>Walk between meetings</strong><small>Personal · 20 minutes</small></div><span className="preview-time">3:30 PM</span></div><div className="preview-note">Write <span>→</span> Schedule <span>→</span> Focus <span>→</span> Complete</div></div></main><footer className="landing-footer"><span>Private by default</span><span>Works offline in your browser</span><span>Built for real days</span></footer></div>;
}

function ArrowRightIcon() {
  return <span aria-hidden="true">→</span>;
}

function Shell() {
  const [location] = useLocation();
  const data = useData();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const results = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return [
      ...data.tasks.filter((item) => item.title.toLowerCase().includes(query)).map((item) => ({ label: item.title, type: 'Task', href: '/inbox' })),
      ...data.activities.filter((item) => item.title.toLowerCase().includes(query)).map((item) => ({ label: item.title, type: 'Schedule', href: '/schedule' })),
      ...data.projects.filter((item) => item.name.toLowerCase().includes(query)).map((item) => ({ label: item.name, type: 'Project', href: '/work' })),
    ].slice(0, 7);
  }, [data.tasks, data.activities, data.projects, search]);
  useEffect(() => {
    if (!data.settings.notifications || !('Notification' in window) || Notification.permission !== 'granted') return;
    const checkReminders = () => {
      const now = Date.now();
      data.tasks.filter((task) => task.reminder && !task.done).forEach((task) => {
        const reminderAt = new Date(task.reminder).getTime();
        const reminderKey = `focusflow-reminded-${task.id}-${task.reminder}`;
        if (reminderAt <= now && now - reminderAt < 120000 && !localStorage.getItem(reminderKey)) {
          new Notification(`FocusFlow reminder: ${task.title}`, { body: task.description || 'A task is waiting in your flow.' });
          localStorage.setItem(reminderKey, '1');
        }
      });
    };
    checkReminders();
    const interval = window.setInterval(checkReminders, 30000);
    return () => window.clearInterval(interval);
  }, [data.settings.notifications, data.tasks]);
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand" data-testid="link-brand"><span className="brand-mark" /><span className="brand-name">FocusFlow</span></Link>
      <div className="eyebrow">Your space</div>
      <nav className="nav-list">{nav.map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={cx('nav-link', (location === href || (href === '/' && location === '/dashboard')) && 'active')} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></Link>)}</nav>
      <div className="sidebar-spacer" />
      <Link href="/settings" className={cx('nav-link', location === '/settings' && 'active')} data-testid="link-settings"><Settings size={17} strokeWidth={1.8} /><span>Settings</span></Link>
      <Link href="/profile" className={cx('profile-mini', location === '/profile' && 'active')} data-testid="link-profile"><span className="avatar">{initials(data.settings.name)}</span><span><p>{data.settings.name}</p><span>Personal space</span></span></Link>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <Link href="/" className="mobile-brand" data-testid="link-mobile-brand"><span className="brand-mark" /><span>FocusFlow</span></Link>
        <div className="search" onFocus={() => setSearchOpen(true)} data-testid="search-global"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your flow..." data-testid="input-global-search" /><button className="icon-button" style={{ display: search ? 'inline-flex' : 'none', border: 0 }} onClick={() => setSearch('')} aria-label="Clear search" data-testid="button-clear-search"><X size={14} /></button>
          {searchOpen && search && <div style={{ position: 'absolute', top: 52, width: 'min(360px, calc(100vw - 32px))', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 7, zIndex: 20 }}>{results.length ? results.map((result, index) => <Link key={`${result.type}-${index}`} href={result.href} onClick={() => { setSearchOpen(false); setSearch(''); }} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 9px', borderRadius: 8, fontSize: 12 }} data-testid={`search-result-${index}`}><span>{result.label}</span><span className="tiny">{result.type}</span></Link>) : <div className="tiny" style={{ padding: 10 }}>No matches yet. Add it to your flow first.</div>}</div>}
        </div>
       <div className="top-actions"><Link href="/settings" className="icon-button" aria-label="Settings" data-testid="button-top-settings"><Settings size={16} /></Link><Link href="/profile" className="soft-button" data-testid="button-top-profile"><span className="avatar" style={{ width: 22, height: 22, fontSize: 9 }}>{initials(data.settings.name)}</span>{data.settings.name}</Link><LogoutButton /></div>
      </header>
       <div onClick={() => searchOpen && setSearchOpen(false)}><Switch>
         <Route path="/" component={Dashboard} /><Route path="/dashboard" component={Dashboard} /><Route path="/inbox" component={Inbox} /><Route path="/buildup" component={Buildup} /><Route path="/schedule" component={Schedule} /><Route path="/study" component={Study} /><Route path="/workout" component={Workout} /><Route path="/work" component={Work} /><Route path="/analytics" component={Analytics} /><Route path="/history" component={HistoryPage} /><Route path="/profile" component={Profile} /><Route path="/settings" component={SettingsPage} /><Route component={NotFound} />
      </Switch></div>
    </main>
    <MusicDock />
    <nav className="mobile-nav">{nav.slice(0, 5).map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={location === href ? 'active' : ''} data-testid={`mobile-link-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} /><span>{label === 'Task inbox' ? 'Inbox' : label === 'Focus room' ? 'Focus' : label}</span></Link>)}</nav>
  </div>;
}

function LogoutButton() {
  const { signOut } = useClerk();
  return <button type="button" className="soft-button logout-button" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">Sign out</button>;
}
function MusicDock() {
  const data = useData();

  const [musicOn, setMusicOn] = useState(
    () => localStorage.getItem('focusflow-music-on') === 'true'
  );

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<YouTubeTrack | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');

  const playerRef = useRef<YouTubePlayerApi | null>(null);
  const playerElementRef = useRef<HTMLDivElement>(null);

  // Remember Music ON/OFF
  useEffect(() => {
    localStorage.setItem('focusflow-music-on', String(musicOn));

    if (!musicOn) {
      playerRef.current?.pauseVideo();
      setPlaying(false);
      setSearchOpen(false);
    }
  }, [musicOn]);

  // Keep volume synced with FocusFlow settings
  useEffect(() => {
    playerRef.current?.setVolume(data.settings.volume);
  }, [data.settings.volume]);

  // Load YouTube IFrame API
  useEffect(() => {
    if (!musicOn) return;

    const createPlayer = () => {
      if (!playerElementRef.current || playerRef.current) return;

      if (!window.YT?.Player) return;

      playerRef.current = new window.YT.Player(playerElementRef.current, {
        height: '200',
        width: '320',
        playerVars: {
          controls: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: (event) => {
            event.target.setVolume(data.settings.volume);
          },

          onStateChange: (event) => {
            setPlaying(event.data === 1);
          },

          onError: () => {
            setError(
              "This track isn't available for playback here. Try another result."
            );
            setPlaying(false);
          },
        },
      });
    };

    if (window.YT?.Player) {
      createPlayer();
      return;
    }

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(script);
    }

    const oldCallback = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      oldCallback?.();
      createPlayer();
    };

    return () => {
      // Don't destroy the player during normal React re-renders.
    };
  }, [musicOn]);

  async function searchMusic(event?: React.FormEvent) {
    event?.preventDefault();

    const cleanQuery = query.trim();

    if (!cleanQuery) return;

    setSearching(true);
    setError('');

    try {
      const response = await fetch(
        `${window.location.origin}/api/music/search?q=${encodeURIComponent(cleanQuery)}`
      );

      if (!response.ok) {
        const text = await response.text();
        console.error('Music search failed:', response.status, text);
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

  function playTrack(track: YouTubeTrack, index: number) {
    setCurrentTrack(track);
    setCurrentIndex(index);
    setError('');

    if (!playerRef.current) {
      setError('Music player is still loading. Try again in a moment.');
      return;
    }

    playerRef.current.loadVideoById(track.videoId);
    playerRef.current.setVolume(data.settings.volume);

    setPlaying(true);
    setSearchOpen(false);
  }

  function togglePlayback() {
    if (!playerRef.current || !currentTrack) return;

    if (playing) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  }

  function nextTrack() {
    if (!results.length) return;

    const nextIndex =
      currentIndex >= results.length - 1 ? 0 : currentIndex + 1;

    playTrack(results[nextIndex], nextIndex);
  }

  function previousTrack() {
    if (!results.length) return;

    const previousIndex =
      currentIndex <= 0 ? results.length - 1 : currentIndex - 1;

    playTrack(results[previousIndex], previousIndex);
  }

  function silenceMode() {
    playerRef.current?.pauseVideo();
    setPlaying(false);
    setMusicOn(false);
  }

  return (
    <>
      {/* MUSIC OFF */}
      {!musicOn && (
        <div className="music-dock" data-testid="music-player">
          <Music2 size={17} color="var(--coral)" />

          <div className="music-dock-copy">
            <strong>Music off</strong>
            <span>Distraction-free study</span>
          </div>

          <button
            className="button secondary"
            onClick={() => setMusicOn(true)}
          >
            <Play size={15} />
            Music On
          </button>
        </div>
      )}

      {/* MUSIC ON */}
      {musicOn && (
        <div className="music-dock" data-testid="music-player">

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
            <Music2 size={20} color="var(--coral)" />
          )}

          <div className="music-dock-copy">
            <strong>
              {currentTrack?.title ?? 'Choose some music'}
            </strong>

            <span>
              {currentTrack?.channel ?? 'Search YouTube'}
            </span>
          </div>

          {/* PREVIOUS */}

          <button
            className="icon-button"
            onClick={previousTrack}
            disabled={!currentTrack}
            title="Previous"
          >
            <ChevronLeft size={18} />
          </button>

          {/* PLAY / PAUSE */}

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

          {/* NEXT */}

          <button
            className="icon-button"
            onClick={nextTrack}
            disabled={!currentTrack}
            title="Next"
          >
            <ChevronRight size={18} />
          </button>

          {/* SEARCH */}

          <button
            className="icon-button"
            onClick={() => setSearchOpen(!searchOpen)}
            title="Search music"
          >
            <Search size={18} />
          </button>

          {/* SILENCE */}

          <button
            className="icon-button"
            onClick={silenceMode}
            title="Silence mode"
          >
            <Volume2 size={18} />
          </button>

          {/* HIDDEN/COMPACT YOUTUBE PLAYER AREA */}

          <div
            style={{
              position: 'absolute',
              width: 320,
              height: 200,
              left: -10000,
              top: 0,
            }}
          >
            <div ref={playerElementRef} />
          </div>

          {/* SEARCH PANEL */}

          {searchOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: '75px',
                right: 0,
                width: '360px',
                maxHeight: '480px',
                overflowY: 'auto',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '18px',
                padding: '14px',
                boxShadow: '0 20px 60px rgba(0,0,0,.18)',
                zIndex: 100,
              }}
            >
              <form
                onSubmit={searchMusic}
                style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search songs or artists..."
                  autoFocus
                  style={{
                    flex: 1,
                    minWidth: 0,
                  }}
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
                <p style={{ fontSize: 13 }}>
                  Searching...
                </p>
              )}

              {error && (
                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--coral)',
                  }}
                >
                  {error}
                </p>
              )}

              {!searching &&
                results.map((track, index) => (
                  <button
                    key={track.videoId}
                    onClick={() => playTrack(track, index)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      border: 0,
                      background: 'transparent',
                      padding: '8px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <img
                      src={track.thumbnail}
                      alt=""
                      style={{
                        width: 70,
                        height: 42,
                        objectFit: 'cover',
                        borderRadius: 7,
                      }}
                    />

                    <div
                      style={{
                        minWidth: 0,
                        flex: 1,
                      }}
                    >
                      <strong
                        style={{
                          display: 'block',
                          fontSize: 13,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {track.title}
                      </strong>

                      <span
                        style={{
                          fontSize: 12,
                          opacity: 0.7,
                        }}
                      >
                        {track.channel}
                      </span>
                    </div>

                    <Play size={15} />
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
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
  return <div className={cx('sticky', categoryClass(task.category), task.done && 'done')} draggable onDragStart={(event) => event.dataTransfer.setData('taskId', task.id)} data-testid={`card-task-${task.id}`}>
    <div className="sticky-top"><span className="tag">{task.category}</span><span className={cx('priority', task.priority)} /></div><h3>{task.title}</h3>{task.description && <p>{task.description}</p>}<div className="task-actions"><button onClick={() => data.updateTask(task.id, { done: !task.done, completedAt: !task.done ? new Date().toISOString() : undefined })} aria-label={task.done ? 'Reopen task' : 'Complete task'} data-testid={`button-complete-task-${task.id}`}>{task.done ? <RotateCcw size={13} /> : <Check size={13} />}</button><button onClick={() => onEdit(task)} aria-label="Edit task" data-testid={`button-edit-task-${task.id}`}><Pencil size={13} /></button><button onClick={() => { if (window.confirm('Delete this task?')) data.deleteTask(task.id); }} aria-label="Delete task" data-testid={`button-delete-task-${task.id}`}><Trash2 size={13} /></button><span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink-soft)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock3 size={11} /> {task.estimate}m</span></div>
  </div>;
}

function TaskForm({ initial, onClose }: { initial?: Task; onClose: () => void }) {
  const data = useData(); const [error, setError] = useState(''); const [form, setForm] = useState({ title: initial?.title ?? '', description: initial?.description ?? '', category: initial?.category ?? 'Study' as Category, priority: initial?.priority ?? 'medium' as Priority, estimate: String(initial?.estimate ?? 25), deadline: initial?.deadline ?? '', reminder: initial?.reminder ?? '', projectId: initial?.projectId ?? '' });
  const submit = (event: FormEvent) => { event.preventDefault(); const estimate = Number(form.estimate); if (!form.title.trim()) return setError('Give the task a short title.'); if (!Number.isFinite(estimate) || estimate <= 0 || estimate > 1440) return setError('Estimate must be between 1 and 1,440 minutes.'); if (initial) data.updateTask(initial.id, { ...form, title: form.title.trim(), estimate, category: form.category as Category, priority: form.priority as Priority, projectId: form.projectId || undefined }); else data.addTask({ ...form, title: form.title.trim(), estimate, category: form.category as Category, priority: form.priority as Priority, projectId: form.projectId || undefined }); onClose(); };
  return <Modal title={initial ? 'Shape this task' : 'Capture a task'} subtitle="Keep it clear enough that future-you knows where to begin." onClose={onClose}><form onSubmit={submit}><div className="form-grid"><Field label="Title" full><input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What needs your attention?" data-testid="input-task-title" /></Field><Field label="Area"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })} data-testid="select-task-category">{categories.map((category) => <option key={category}>{category}</option>)}</select></Field><Field label="Priority"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })} data-testid="select-task-priority"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field><Field label="Estimate (minutes)"><input type="number" min="1" max="1440" value={form.estimate} onChange={(e) => setForm({ ...form, estimate: e.target.value })} data-testid="input-task-estimate" /></Field><Field label="Deadline"><input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} data-testid="input-task-deadline" /></Field><Field label="Reminder (optional)"><input type="datetime-local" value={form.reminder} onChange={(e) => setForm({ ...form, reminder: e.target.value })} data-testid="input-task-reminder" /></Field><Field label="Project"><select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} data-testid="select-task-project"><option value="">No project</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field><Field label="Notes" full><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="A little context, if useful." data-testid="textarea-task-description" /></Field></div>{error && <p className="error-text">{error}</p>}<div className="modal-footer"><button type="button" className="soft-button" onClick={onClose} data-testid="button-cancel-task">Cancel</button><button className="primary-button" type="submit" data-testid="button-save-task">{initial ? 'Save changes' : 'Add task'}</button></div></form></Modal>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="modal" role="dialog" aria-modal="true"><div className="modal-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog" data-testid="button-close-dialog"><X size={16} /></button></div>{children}</div></div>; }
function Field({ label, full, children }: { label: string; full?: boolean; children: ReactNode }) { return <div className={cx('field', full && 'full')}><label>{label}</label>{children}</div>; }
function ConflictDialog({ overlaps, onChooseAnother, onReplace, onCancel }: { overlaps: Activity[]; onChooseAnother: () => void; onReplace: () => void; onCancel: () => void }) {
  return <div className="modal-backdrop" style={{ zIndex: 45 }} role="alertdialog" aria-modal="true" aria-labelledby="schedule-conflict-title"><div className="modal conflict-dialog"><div className="modal-header"><div><h2 id="schedule-conflict-title">That time is already spoken for.</h2><p>{overlaps.map((item) => `${item.title} (${item.start}, ${item.duration}m)`).join(' · ')}</p></div><button className="icon-button" onClick={onCancel} aria-label="Close conflict dialog" data-testid="button-close-conflict"><X size={16} /></button></div><p className="muted" style={{ marginBottom: 16 }}>Choose exactly what should happen next.</p><div className="conflict-actions"><button className="primary-button" onClick={onChooseAnother} data-testid="button-conflict-change-time">Choose another time</button><button className="danger-button" onClick={onReplace} data-testid="button-conflict-replace">Replace overlapping activities</button><button className="soft-button" onClick={onCancel} data-testid="button-conflict-cancel">Cancel</button></div></div></div>;
}

function Dashboard() {
  const data = useData(); const [taskModal, setTaskModal] = useState<Task | 'new' | null>(null); const todayTasks = data.tasks.filter((task) => !task.deadline || task.deadline <= dateKey()); const completed = data.tasks.filter((task) => task.done).length; const todayActivities = data.activities.filter((activity) => activity.date === dateKey());
  const minutes = data.sessions.filter((s) => sameDay(s.start, dateKey())).reduce((sum, s) => sum + s.actualSeconds, 0) / 60;
  return <div className="page"><PageHeading eyebrow={new Intl.DateTimeFormat('en', { weekday: 'long' }).format(new Date())} title={`A little room to move${data.settings.name !== 'Your name' ? `, ${data.settings.name.split(' ')[0]}` : ''}.`} description="Your day, at a glance. Keep the next thing close." action={<button className="primary-button" onClick={() => setTaskModal('new')} data-testid="button-add-task"><Plus size={15} /> Add task</button>} />
    <div className="grid grid-4"><div className="card metric"><div className="eyebrow">Open tasks</div><div className="metric-value">{data.tasks.filter((t) => !t.done).length}</div><div className="metric-label">waiting in your flow</div></div><div className="card metric"><div className="eyebrow">Completed</div><div className="metric-value">{completed}</div><div className="metric-label">all-time, by you</div></div><div className="card metric"><div className="eyebrow">Focus today</div><div className="metric-value">{Math.round(minutes)}m</div><div className="metric-label">real minutes recorded</div></div><div className="card metric"><div className="eyebrow">Planned today</div><div className="metric-value">{todayActivities.length}</div><div className="metric-label">scheduled activities</div></div></div>
    <div className="grid grid-3" style={{ marginTop: 18 }}><section className="card" style={{ gridColumn: 'span 2' }}><div className="card-title"><div><div className="eyebrow">Task inbox</div><h2 className="section-title">The things worth moving</h2></div><Link href="/inbox" className="soft-button" data-testid="link-open-inbox">View inbox <ExternalLink size={13} /></Link></div>{data.tasks.length ? <div className="task-board">{data.tasks.slice(0, 6).map((task) => <TaskCard key={task.id} task={task} onEdit={setTaskModal} />)}</div> : <Empty icon={ListChecks} title="Your board is clear" text="Capture one small thing and give it a place to land." action={<button className="primary-button" onClick={() => setTaskModal('new')} data-testid="button-empty-add-task"><Plus size={14} /> Capture a task</button>} />}</section><section className="card"><div className="card-title"><div><div className="eyebrow">This week</div><h2 className="section-title">Keep the thread</h2></div><Link href="/analytics" className="icon-button" aria-label="Open analytics" data-testid="button-open-analytics"><MoreHorizontal size={16} /></Link></div><div className="stat-line"><span className="muted">Completion</span><strong>{data.tasks.length ? Math.round(completed / data.tasks.length * 100) : 0}%</strong></div><div className="progress-track" style={{ margin: '10px 0 22px' }}><div className="progress-bar mint" style={{ width: `${data.tasks.length ? completed / data.tasks.length * 100 : 0}%` }} /></div><div className="grid" style={{ gap: 12 }}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => <div className="stat-line" key={day}><span className="tiny">{day}</span><div className="progress-track" style={{ flex: 1 }}><div className="progress-bar" style={{ width: `${Math.min(100, (data.sessions.filter((s) => new Date(s.start).getDay() === (i + 1) % 7).reduce((sum, s) => sum + s.actualSeconds, 0) / 3600) * 100)}%` }} /></div></div>)}</div></section></div>
    <section className="card" style={{ marginTop: 18 }}><div className="card-title"><div><div className="eyebrow">Next up</div><h2 className="section-title">Today's shape</h2></div><Link href="/schedule" className="soft-button" data-testid="link-open-schedule">Open schedule <CalendarDays size={13} /></Link></div>{todayActivities.length ? <div className="grid grid-2">{todayActivities.slice(0, 4).map((activity) => <div className="schedule-item" key={activity.id}><div><p>{activity.title}</p><span>{activity.start} · {activity.duration} minutes</span></div><span className="tag">{activity.category}</span></div>)}</div> : <Empty icon={CalendarDays} title="Nothing planned today" text="A loose plan can make the next step feel lighter." action={<Link href="/schedule" className="primary-button" data-testid="button-plan-today"><Plus size={14} /> Plan time</Link>} />}</section>
    {taskModal && <TaskForm initial={taskModal === 'new' ? undefined : taskModal} onClose={() => setTaskModal(null)} />}
  </div>;
}

function Inbox() {
  const data = useData(); const [modal, setModal] = useState<Task | 'new' | null>(null); const [filter, setFilter] = useState('All'); const tasks = data.tasks.filter((t) => filter === 'All' || t.category === filter);
  return <div className="page"><PageHeading eyebrow="Task inbox" title="Everything has a place." description="Drag a sticky to Schedule, or work straight from here." action={<button className="primary-button" onClick={() => setModal('new')} data-testid="button-inbox-add"><Plus size={15} /> New task</button>} /><div className="date-nav" style={{ marginBottom: 19 }}>{['All', ...categories].map((item) => <button key={item} className={cx(item === filter ? 'primary-button' : 'soft-button')} onClick={() => setFilter(item)} data-testid={`button-filter-${item.toLowerCase()}`}>{item}</button>)}</div>{tasks.length ? <div className="task-board">{tasks.map((task) => <TaskCard key={task.id} task={task} onEdit={setModal} />)}</div> : <Empty icon={ListChecks} title={filter === 'All' ? 'Start with one clear thing' : `No ${filter.toLowerCase()} tasks yet`} text="Tasks you add here stay with you across the whole app." action={<button className="primary-button" onClick={() => setModal('new')} data-testid="button-inbox-empty-add"><Plus size={14} /> Add a task</button>} />}{modal && <TaskForm initial={modal === 'new' ? undefined : modal} onClose={() => setModal(null)} />}</div>;
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
  const hours = Array.from({ length: 15 }, (_, index) => index + 7);
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
      <section className="buildup-chart-wrap"><div className="buildup-chart-header"><div><div className="eyebrow">Time chart</div><h2 className="section-title">{activities.length} blocks planned</h2></div><span className="tag">{activities.reduce((sum, item) => sum + item.duration, 0)}m planned</span></div><div className="buildup-timeline">{hours.map((hour) => { const start = `${String(hour).padStart(2, '0')}:00`; const items = activities.filter((activity) => activity.start.slice(0, 2) === String(hour).padStart(2, '0')); return <div className="buildup-time-row" key={hour}><div className="time-label">{start}</div><div className={cx('buildup-time-slot', dragOverStart === start && 'drop-target')} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverStart(start); }} onDragEnter={() => setDragOverStart(start)} onDragLeave={() => setDragOverStart(null)} onDrop={(event) => handleDrop(event, start)}>{items.map((item) => <div className={cx('buildup-planned-block', categoryClass(item.category))} draggable onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('activityId', item.id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragOverStart(null)} key={item.id} data-testid={`buildup-activity-${item.id}`}><GripVertical size={14} /><div><strong>{item.title}</strong><span>{item.duration}m · {item.category}</span></div><button className="icon-button" onClick={(event) => { event.stopPropagation(); data.deleteActivity(item.id); }} aria-label={`Remove ${item.title}`}><Trash2 size={12} /></button></div>)}</div></div>; })}</div></section>
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
  const hours = Array.from({ length: 14 }, (_, i) => i + 7);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentActivity = date === dateKey() ? activities.find((item) => { const start = clockMinutes(item.start); return currentMinutes >= start && currentMinutes < start + item.duration; }) : undefined;
  const stageDrop = (event: DragEvent, start: string) => { event.preventDefault(); const taskId = event.dataTransfer.getData('taskId') || draggingTaskId; const task = data.tasks.find((item) => item.id === taskId); if (!task) return; const overlaps = findOverlaps(data.activities, date, start, task.estimate); if (overlaps.length) setPendingDrop({ task, start, overlaps }); else { data.addActivity({ title: task.title, taskId: task.id, category: task.category, date, start, duration: task.estimate }); setDropMessage(`Placed "${task.title}" at ${start}.`); window.setTimeout(() => setDropMessage(''), 2500); } setDragOverStart(null); setDraggingTaskId(null); };
  const replaceDrop = () => { if (!pendingDrop) return; pendingDrop.overlaps.forEach((item) => data.deleteActivity(item.id)); data.addActivity({ title: pendingDrop.task.title, taskId: pendingDrop.task.id, category: pendingDrop.task.category, date, start: pendingDrop.start, duration: pendingDrop.task.estimate }); setDropMessage(`Placed "${pendingDrop.task.title}" at ${pendingDrop.start}.`); setPendingDrop(null); window.setTimeout(() => setDropMessage(''), 2500); };
  const shiftDate = (amount: number) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + amount); setDate(d.toISOString().slice(0, 10)); };
  return <div className="page"><PageHeading eyebrow="Schedule" title="Give the day a shape." description="A timeline that leaves room for real life." action={<button className="primary-button" onClick={() => setModal('new')} data-testid="button-add-activity"><Plus size={15} /> Add activity</button>} />{currentActivity && <div className="tag coral" style={{ marginBottom: 16, width: 'fit-content' }}>Now: {currentActivity.title}</div>}<div className="date-nav" style={{ marginBottom: 19 }}><button className="icon-button" onClick={() => shiftDate(-1)} aria-label="Previous day" data-testid="button-previous-day"><ChevronLeft size={16} /></button><button className="date-pill" onClick={() => setDate(dateKey())} data-testid="button-schedule-date"><CalendarDays size={14} />{dateLabel(date)}</button><button className="icon-button" onClick={() => shiftDate(1)} aria-label="Next day" data-testid="button-next-day"><ChevronRight size={16} /></button>{date !== dateKey() && <button className="soft-button" onClick={() => setDate(dateKey())} data-testid="button-today">Today</button>}</div>{dropMessage && <div className="toast">{dropMessage}</div>}<div className="grid grid-3"><section className="timeline" style={{ gridColumn: 'span 2' }}>{hours.map((hour) => { const start = `${String(hour).padStart(2, '0')}:00`; const item = activities.find((activity) => activity.start.slice(0, 2) === String(hour).padStart(2, '0')); const preview = draggingTaskId && dragOverStart === start ? data.tasks.find((task) => task.id === draggingTaskId) : undefined; return <div className="time-row" key={hour}><div className="time-label">{start}</div><div className={cx('time-slot', dragOverStart === start && 'drop-target')} onDragOver={(event) => { event.preventDefault(); const taskId = event.dataTransfer.getData('taskId'); if (taskId) setDraggingTaskId(taskId); setDragOverStart(start); }} onDragEnter={() => setDragOverStart(start)} onDragLeave={() => setDragOverStart(null)} onDrop={(event) => stageDrop(event, start)}>{item && <div className={cx('schedule-item', item.category === 'Study' ? '' : item.category === 'Work' ? 'sand' : item.category === 'Coding' ? 'lavender' : 'coral', currentActivity?.id === item.id && 'current')}><div><p>{item.title}</p><span>{item.duration} minutes · {item.category}</span></div><span style={{ display: 'flex', gap: 4 }}><button className="icon-button" style={{ width: 25, height: 25, minHeight: 25, border: 0, background: 'transparent' }} onClick={() => setModal(item)} aria-label="Edit activity" data-testid={`button-edit-activity-${item.id}`}><Pencil size={12} /></button><button className="icon-button" style={{ width: 25, height: 25, minHeight: 25, border: 0, background: 'transparent' }} onClick={() => data.deleteActivity(item.id)} aria-label="Delete activity" data-testid={`button-delete-activity-${item.id}`}><Trash2 size={12} /></button></span></div>}{preview && <div className="drop-preview"><GripVertical size={13} />Preview: {preview.title} · {preview.estimate}m</div>}</div></div>; })}</section><aside className="grid" style={{ alignContent: 'start' }}><div className="card"><div className="card-title"><div><div className="eyebrow">Day summary</div><h2 className="section-title">{activities.length} activities</h2></div><Clock3 size={18} color="var(--coral)" /></div><div className="stat-line"><span className="muted">Planned time</span><strong>{activities.reduce((sum, item) => sum + item.duration, 0)}m</strong></div><div className="stat-line" style={{ marginTop: 13 }}><span className="muted">Completed tasks</span><strong>{data.tasks.filter((task) => task.done && activities.some((item) => item.taskId === task.id)).length}</strong></div></div><div className="card"><div className="card-title"><div><div className="eyebrow">Drag to place</div><h2 className="section-title">Loose tasks</h2></div><GripVertical size={17} color="var(--ink-soft)" /></div>{looseTasks.map((task) => <div key={task.id} draggable onDragStart={(event) => { event.dataTransfer.setData('taskId', task.id); setDraggingTaskId(task.id); }} onDragEnd={() => { setDraggingTaskId(null); setDragOverStart(null); }} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: 12 }} data-testid={`draggable-task-${task.id}`}><GripVertical size={13} color="var(--ink-soft)" />{task.title}<span className="tiny" style={{ marginLeft: 'auto' }}>{task.estimate}m</span></div>)}{!looseTasks.length && <p className="tiny">Everything is placed or complete.</p>}</div></aside></div>{modal && <ActivityForm initial={modal === 'new' ? undefined : modal} date={date} onClose={() => setModal(null)} />}{pendingDrop && <ConflictDialog overlaps={pendingDrop.overlaps} onChooseAnother={() => setPendingDrop(null)} onReplace={replaceDrop} onCancel={() => setPendingDrop(null)} />}</div>;
}

function ActivityForm({ initial, date, onClose }: { initial?: Activity; date: string; onClose: () => void }) {
  const data = useData(); const [error, setError] = useState(''); const [conflicts, setConflicts] = useState<Activity[]>([]); const [form, setForm] = useState({ title: initial?.title ?? '', category: initial?.category ?? 'Study' as Category, start: initial?.start ?? '09:00', duration: String(initial?.duration ?? 25), taskId: initial?.taskId ?? '' });
  const payload = (duration: number) => ({ title: form.title.trim(), category: form.category as Category, start: form.start, duration, date, taskId: form.taskId || undefined });
  const commit = (duration: number, replace: boolean) => { if (replace) conflicts.forEach((item) => data.deleteActivity(item.id)); if (initial) data.updateActivity(initial.id, payload(duration)); else data.addActivity(payload(duration)); setConflicts([]); onClose(); };
  const submit = (event: FormEvent) => { event.preventDefault(); const duration = Number(form.duration); if (!form.title.trim()) return setError('Name the activity first.'); if (!Number.isFinite(duration) || duration <= 0 || duration > 1440) return setError('Duration must be between 1 and 1,440 minutes.'); const found = findOverlaps(data.activities, date, form.start, duration, initial?.id); if (found.length) return setConflicts(found); commit(duration, false); };
  return <Modal title={initial ? 'Adjust the plan' : 'Plan a window'} subtitle="Choose a time that feels possible, not aspirational." onClose={onClose}><form onSubmit={submit}><div className="form-grid"><Field label="Activity" full><input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="input-activity-title" /></Field><Field label="Date"><input type="date" value={date} readOnly data-testid="input-activity-date" /></Field><Field label="Category"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })} data-testid="select-activity-category">{categories.map((category) => <option key={category}>{category}</option>)}</select></Field><Field label="Start"><input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} data-testid="input-activity-start" /></Field><Field label="Duration (minutes)"><input type="number" min="1" max="1440" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} data-testid="input-activity-duration" /></Field><Field label="Linked task" full><select value={form.taskId} onChange={(e) => setForm({ ...form, taskId: e.target.value })} data-testid="select-activity-task"><option value="">No linked task</option>{data.tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></Field></div>{error && <p className="error-text">{error}</p>}<div className="modal-footer"><button type="button" className="soft-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" data-testid="button-save-activity">Save activity</button></div></form>{conflicts.length > 0 && <ConflictDialog overlaps={conflicts} onChooseAnother={() => setConflicts([])} onReplace={() => commit(Number(form.duration), true)} onCancel={() => setConflicts([])} />}</Modal>;
}

function Study() {
  const data = useData(); const [, setTick] = useState(0); const [note, setNote] = useState(''); const [selectedTask, setSelectedTask] = useState(''); const [editingNote, setEditingNote] = useState<string | null>(null); const [selectedMode, setSelectedMode] = useState<'focus' | 'stopwatch' | 'break'>(data.timer?.mode ?? 'focus');
  useEffect(() => { const timer = window.setInterval(() => setTick((value) => value + 1), 1000); return () => window.clearInterval(timer); }, []);
  const seconds = data.timerSeconds(); const running = Boolean(data.timer?.startedAt); const focusTask = data.tasks.find((task) => task.id === data.timer?.taskId); const activeMode = data.timer?.mode ?? selectedMode; const initialSeconds = activeMode === 'stopwatch' ? 0 : activeMode === 'break' ? data.settings.breakMinutes * 60 : data.settings.pomodoro * 60;
  const saveNote = () => { if (!note.trim()) return; if (editingNote) data.updateNote(editingNote, note.trim()); else data.addNote(note.trim()); setNote(''); setEditingNote(null); };
  return <div className="page"><PageHeading eyebrow="Focus room" title="Make some quiet progress." description="One window. One task. No performance required." /><div className="grid grid-2"><section className="focus-card"><div className="eyebrow">Current session</div><div className="focus-task">{focusTask?.title ?? (activeMode === 'break' ? 'A small reset' : activeMode === 'stopwatch' ? 'Open-ended focus' : 'Choose a task to begin')}</div><div className="focus-copy">{activeMode === 'break' ? 'Step away. Your focus will be here when you return.' : activeMode === 'stopwatch' ? 'Count up as long as the work is useful.' : 'The clock only counts what you actually spend.'}</div><div className="timer">{prettyTime(data.timer ? seconds : initialSeconds)}</div><div className="timer-actions">{running ? <button className="soft-button" onClick={() => data.pauseTimer()} data-testid="button-pause-timer"><Pause size={14} /> Pause</button> : data.timer ? <button className="primary-button" onClick={() => data.startTimer(data.timer?.taskId, data.timer?.mode)} data-testid="button-resume-timer"><Play size={14} /> Resume</button> : <button className="primary-button" onClick={() => data.startTimer(selectedMode === 'break' ? undefined : selectedTask || undefined, selectedMode)} data-testid="button-start-timer"><Play size={14} /> Start {selectedMode === 'stopwatch' ? 'stopwatch' : selectedMode === 'break' ? 'break' : 'focus'}</button>}{data.timer && <><button className="soft-button" onClick={() => data.finishTimer()} data-testid="button-finish-timer"><Check size={14} /> Finish</button><button className="soft-button" onClick={() => data.resetTimer()} data-testid="button-reset-timer"><RotateCcw size={14} /></button></>}</div></section><section className="grid" style={{ alignContent: 'start' }}><div className="card"><div className="card-title"><div><div className="eyebrow">Timer mode</div><h2 className="section-title">Choose your pace</h2></div><Clock3 size={18} color="var(--coral)" /></div><div className="date-nav" style={{ marginBottom: 14 }}><button className={cx(selectedMode === 'focus' ? 'primary-button' : 'soft-button')} disabled={Boolean(data.timer)} onClick={() => setSelectedMode('focus')} data-testid="button-mode-pomodoro">Pomodoro</button><button className={cx(selectedMode === 'stopwatch' ? 'primary-button' : 'soft-button')} disabled={Boolean(data.timer)} onClick={() => setSelectedMode('stopwatch')} data-testid="button-mode-stopwatch">Stopwatch</button><button className={cx(selectedMode === 'break' ? 'primary-button' : 'soft-button')} disabled={Boolean(data.timer)} onClick={() => setSelectedMode('break')} data-testid="button-mode-break">Break</button></div><select value={selectedTask} disabled={Boolean(data.timer) || selectedMode === 'break'} onChange={(e) => setSelectedTask(e.target.value)} className="field input" style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: 10, background: 'var(--card)', fontSize: 12 }} data-testid="select-focus-task"><option value="">Open focus, no task attached</option>{data.tasks.filter((task) => !task.done).map((task) => <option key={task.id} value={task.id}>{task.title} · {task.estimate}m</option>)}</select><p className="tiny" style={{ marginTop: 12 }}>{selectedMode === 'stopwatch' ? 'Stopwatch has no cap.' : selectedMode === 'break' ? `Breaks are ${data.settings.breakMinutes} minutes.` : `Pomodoro is ${data.settings.pomodoro} minutes.`} Adjust defaults in Settings.</p></div><div className="card"><div className="card-title"><div><div className="eyebrow">Study environment</div><h2 className="section-title">{data.settings.environment}</h2></div><Music2 size={18} color="var(--coral)" /></div><EnvironmentPicker /></div></section></div><section className="card" style={{ marginTop: 18 }}><div className="card-title"><div><div className="eyebrow">Quick notes</div><h2 className="section-title">Leave a breadcrumb</h2></div><span className="tiny">{data.notes.filter((n) => n.date === dateKey()).length} today</span></div><div style={{ display: 'flex', gap: 9, marginBottom: 17 }}><input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveNote()} placeholder="A thought worth keeping..." style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 9, padding: '10px 11px', background: 'var(--card)', fontSize: 12 }} data-testid="input-study-note" /><button className="primary-button" onClick={saveNote} data-testid="button-save-note">{editingNote ? 'Update' : 'Add note'}</button></div><div className="notes-list">{data.notes.slice(0, 6).map((item) => <div className="note-row" key={item.id}><p>{item.text}<br /><span className="tiny">{formatDate(item.date)}</span></p><span style={{ display: 'flex', gap: 5 }}><button className="icon-button" onClick={() => { setEditingNote(item.id); setNote(item.text); }} aria-label="Edit note" data-testid={`button-edit-note-${item.id}`}><Pencil size={13} /></button><button className="icon-button" onClick={() => data.deleteNote(item.id)} aria-label="Delete note" data-testid={`button-delete-note-${item.id}`}><Trash2 size={13} /></button></span></div>)}</div>{!data.notes.length && <p className="tiny">Notes made here stay private in this browser.</p>}</section></div>;
}
function EnvironmentPicker() { const data = useData(); const environments = [['Rain on glass', 'Soft and steady', '#9dbbc5'], ['Library hush', 'Low and warm', '#cbb58b'], ['Forest morning', 'Bright and still', '#9cb99f'], ['Night train', 'Moving focus', '#7c84aa'], ['Coffee shop', 'Gentle hum', '#d79a77'], ['Open window', 'Air and space', '#b1d4c7'], ['Deep work', 'No distractions', '#d47b69']]; return <div className="environment-grid">{environments.map(([name, description, color]) => <button className={cx('env-option', data.settings.environment === name && 'active')} key={name} onClick={() => data.updateSettings({ environment: name })} data-testid={`button-environment-${name.toLowerCase().replaceAll(' ', '-')}`}><div className="env-dot" style={{ background: color }} /><strong>{name}</strong><span>{description}</span></button>)}</div>; }

function Workout() {
  const data = useData(); const [show, setShow] = useState(false); const [form, setForm] = useState({ name: '', sets: '3', reps: '8', weight: '0' }); const todayExercises = data.exercises.filter((item) => item.date === dateKey()); const water = data.water[dateKey()] ?? 0;
  const add = (e: FormEvent) => { e.preventDefault(); const sets = Number(form.sets); const reps = Number(form.reps); const weight = Number(form.weight); if (!form.name.trim() || sets <= 0 || reps <= 0 || weight < 0) return; data.addExercise({ name: form.name.trim(), sets, reps, weight, completed: false, date: dateKey() }); setForm({ name: '', sets: '3', reps: '8', weight: '0' }); setShow(false); };
  return <div className="page"><PageHeading eyebrow="Body break" title="Move, then keep moving." description="Small physical wins count as part of the work." action={<button className="primary-button" onClick={() => setShow(true)} data-testid="button-add-exercise"><Plus size={15} /> Add exercise</button>} /><div className="grid grid-3"><section className="card"><div className="card-title"><div><div className="eyebrow">Hydration</div><h2 className="section-title">{water} / {data.settings.waterGoal} servings</h2></div><Droplets size={19} color="var(--coral)" /></div><div className="progress-track" style={{ margin: '12px 0 16px' }}><div className="progress-bar mint" style={{ width: `${Math.min(100, water / data.settings.waterGoal * 100)}%` }} /></div><div style={{ display: 'flex', gap: 8 }}><button className="soft-button" onClick={() => data.setWater(dateKey(), water - 1)} disabled={water <= 0} data-testid="button-remove-water">−</button><button className="primary-button" onClick={() => data.setWater(dateKey(), water + 1)} data-testid="button-add-water"><Plus size={14} /> Water</button></div></section><section className="card" style={{ gridColumn: 'span 2' }}><div className="card-title"><div><div className="eyebrow">Today's set</div><h2 className="section-title">{todayExercises.length ? `${todayExercises.filter((e) => e.completed).length} of ${todayExercises.length} checked` : 'Your training log'}</h2></div><span className="tag sky">No pressure</span></div>{todayExercises.length ? <div className="grid grid-2">{todayExercises.map((exercise) => <ExerciseRow key={exercise.id} exercise={exercise} />)}</div> : <Empty icon={Zap} title="Nothing logged yet" text="Add an exercise when you know what your body needs." action={<button className="primary-button" onClick={() => setShow(true)} data-testid="button-empty-add-exercise"><Plus size={14} /> Log exercise</button>} />}</section></div>{show && <Modal title="Log an exercise" subtitle="Keep the numbers honest and useful." onClose={() => setShow(false)}><form onSubmit={add}><div className="form-grid"><Field label="Exercise" full><input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Goblet squat" data-testid="input-exercise-name" /></Field><Field label="Sets"><input type="number" min="1" value={form.sets} onChange={(e) => setForm({ ...form, sets: e.target.value })} data-testid="input-exercise-sets" /></Field><Field label="Reps"><input type="number" min="1" value={form.reps} onChange={(e) => setForm({ ...form, reps: e.target.value })} data-testid="input-exercise-reps" /></Field><Field label="Weight (kg)"><input type="number" min="0" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} data-testid="input-exercise-weight" /></Field></div><div className="modal-footer"><button type="button" className="soft-button" onClick={() => setShow(false)}>Cancel</button><button className="primary-button" type="submit" data-testid="button-save-exercise">Save exercise</button></div></form></Modal>}</div>;
}
function ExerciseRow({ exercise }: { exercise: Exercise }) { const data = useData(); return <div className={cx('schedule-item', exercise.completed && 'done')} style={{ borderLeftColor: exercise.completed ? 'var(--mint-ink)' : 'var(--coral)' }}><div><p style={{ textDecoration: exercise.completed ? 'line-through' : 'none' }}>{exercise.name}</p><span>{exercise.sets} sets × {exercise.reps} reps{exercise.weight ? ` · ${exercise.weight} kg` : ''}</span></div><div style={{ display: 'flex', gap: 4 }}><button className="icon-button" style={{ width: 27, minHeight: 27, height: 27 }} onClick={() => data.updateExercise(exercise.id, { completed: !exercise.completed })} aria-label="Check exercise" data-testid={`button-check-exercise-${exercise.id}`}><Check size={13} /></button><button className="icon-button" style={{ width: 27, minHeight: 27, height: 27 }} onClick={() => data.deleteExercise(exercise.id)} aria-label="Delete exercise" data-testid={`button-delete-exercise-${exercise.id}`}><Trash2 size={13} /></button></div></div>; }

function Work() {
  const data = useData(); const [modal, setModal] = useState<Project | 'new' | null>(null); const [status, setStatus] = useState<ProjectStatus | 'all'>('all'); const projects = data.projects.filter((p) => status === 'all' || p.status === status);
  return <div className="page"><PageHeading eyebrow="Work projects" title="Make the bigger things legible." description="Projects hold the context that tasks cannot." action={<button className="primary-button" onClick={() => setModal('new')} data-testid="button-add-project"><Plus size={15} /> New project</button>} /><div className="date-nav" style={{ marginBottom: 19 }}>{(['all', 'planning', 'active', 'paused', 'done'] as const).map((item) => <button className={cx(status === item ? 'primary-button' : 'soft-button')} key={item} onClick={() => setStatus(item)} data-testid={`button-project-filter-${item}`}>{item === 'all' ? 'All projects' : item[0].toUpperCase() + item.slice(1)}</button>)}</div>{projects.length ? <div className="grid grid-3">{projects.map((project) => <ProjectCard key={project.id} project={project} onEdit={setModal} />)}</div> : <Empty icon={FolderKanban} title="No projects in view" text="Start with the outcome you want to make visible." action={<button className="primary-button" onClick={() => setModal('new')} data-testid="button-empty-add-project"><Plus size={14} /> Create project</button>} />}{modal && <ProjectForm initial={modal === 'new' ? undefined : modal} onClose={() => setModal(null)} />}</div>;
}
function ProjectCard({ project, onEdit }: { project: Project; onEdit: (project: Project) => void }) { const data = useData(); const linked = data.tasks.filter((task) => task.projectId === project.id); const done = linked.filter((task) => task.done).length; return <div className="card"><div className="card-title"><span className={cx('tag', project.priority === 'high' ? 'coral' : project.priority === 'medium' ? 'sand' : '')}>{project.priority}</span><button className="icon-button" onClick={() => onEdit(project)} aria-label="Edit project" data-testid={`button-edit-project-${project.id}`}><Pencil size={13} /></button></div><h2 className="section-title">{project.name}</h2><p className="tiny" style={{ minHeight: 30, margin: '9px 0 17px' }}>{project.description || 'No description yet.'}</p><div className="stat-line"><span className="muted">{done} of {linked.length} tasks</span><span className="tag">{project.status}</span></div><div className="progress-track" style={{ margin: '10px 0 16px' }}><div className="progress-bar mint" style={{ width: `${linked.length ? done / linked.length * 100 : 0}%` }} /></div><div className="stat-line"><span className="tiny">{project.deadline ? `Due ${formatDate(project.deadline)}` : 'No deadline'}</span><button className="danger-button" onClick={() => { if (window.confirm('Delete this project? Linked tasks will stay, but lose their project link.')) data.deleteProject(project.id); }} data-testid={`button-delete-project-${project.id}`}><Trash2 size={12} /></button></div></div>; }
function ProjectForm({ initial, onClose }: { initial?: Project; onClose: () => void }) { const data = useData(); const [form, setForm] = useState({ name: initial?.name ?? '', description: initial?.description ?? '', deadline: initial?.deadline ?? '', priority: initial?.priority ?? 'medium' as Priority, status: initial?.status ?? 'planning' as ProjectStatus }); const submit = (e: FormEvent) => { e.preventDefault(); if (!form.name.trim()) return; if (initial) data.updateProject(initial.id, { ...form, name: form.name.trim() }); else data.addProject({ ...form, name: form.name.trim() }); onClose(); }; return <Modal title={initial ? 'Edit project' : 'New project'} subtitle="Give the work a home and a next chapter." onClose={onClose}><form onSubmit={submit}><div className="form-grid"><Field label="Project name" full><input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="What are you making?" data-testid="input-project-name" /></Field><Field label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })} data-testid="select-project-status"><option value="planning">Planning</option><option value="active">Active</option><option value="paused">Paused</option><option value="done">Done</option></select></Field><Field label="Priority"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })} data-testid="select-project-priority"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field><Field label="Deadline"><input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} data-testid="input-project-deadline" /></Field><Field label="Description" full><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="textarea-project-description" /></Field></div><div className="modal-footer"><button type="button" className="soft-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" data-testid="button-save-project">Save project</button></div></form></Modal>; }

function Analytics() {
  const data = useData(); const [range, setRange] = useState(7); const end = new Date(`${dateKey()}T12:00:00`);
  const days = Array.from({ length: range }, (_, index) => { const d = new Date(end); d.setDate(end.getDate() - (range - index - 1)); return d.toISOString().slice(0, 10); });
  const sessions = data.sessions.filter((s) => days.includes(s.start.slice(0, 10))); const completed = data.tasks.filter((t) => t.done && t.completedAt && days.includes(t.completedAt.slice(0, 10)));
  const trackedTasks = data.tasks.filter((task) => (task.completedAt && days.includes(task.completedAt.slice(0, 10))) || (task.deadline && days.includes(task.deadline)));
  const completionRate = trackedTasks.length ? Math.round(trackedTasks.filter((task) => task.done).length / trackedTasks.length * 100) : 0;
  const focusMax = Math.max(1, ...days.map((day) => data.sessions.filter((s) => s.start.slice(0, 10) === day).reduce((sum, s) => sum + s.actualSeconds, 0)));
  const completedMax = Math.max(1, ...days.map((day) => data.tasks.filter((task) => task.completedAt?.slice(0, 10) === day).length));
  const categoryCounts = categories.map((category) => ({ category, count: data.tasks.filter((task) => task.category === category).length })).filter((item) => item.count > 0);
  return <div className="page"><PageHeading eyebrow="Analytics" title="Progress you can trust." description="Only time and completions you recorded appear here." /><div className="date-nav" style={{ marginBottom: 19 }}>{[1, 7, 30].map((item) => <button className={cx(range === item ? 'primary-button' : 'soft-button')} key={item} onClick={() => setRange(item)} data-testid={`button-analytics-${item}`}>{item === 1 ? 'Today' : `${item} days`}</button>)}</div><div className="grid grid-4"><div className="card metric"><div className="eyebrow">Focus minutes</div><div className="metric-value">{Math.round(sessions.reduce((sum, s) => sum + s.actualSeconds, 0) / 60)}</div><div className="metric-label">across {sessions.length} sessions</div></div><div className="card metric"><div className="eyebrow">Tasks finished</div><div className="metric-value">{completed.length}</div><div className="metric-label">in this window</div></div><div className="card metric"><div className="eyebrow">Completion rate</div><div className="metric-value">{completionRate}%</div><div className="metric-label">{trackedTasks.length ? `${trackedTasks.length} deadline/completion records` : 'No dated tasks yet'}</div></div><div className="card metric"><div className="eyebrow">Active days</div><div className="metric-value">{new Set(sessions.map((s) => s.start.slice(0, 10))).size}</div><div className="metric-label">with recorded focus</div></div></div><div className="grid grid-2" style={{ marginTop: 18 }}><section className="card"><div className="card-title"><div><div className="eyebrow">Daily focus</div><h2 className="section-title">Show up, then count it</h2></div></div><div className="chart-wrap">{days.map((day) => { const value = data.sessions.filter((s) => s.start.slice(0, 10) === day).reduce((sum, s) => sum + s.actualSeconds, 0); return <div className="bar-col" key={day}><div className="bar" style={{ height: `${Math.max(value ? 3 : 0, value / focusMax * 100)}%` }} title={`${Math.round(value / 60)} minutes`} /><span>{new Intl.DateTimeFormat('en', { weekday: 'short' }).format(new Date(`${day}T12:00:00`)).slice(0, 2)}</span></div>; })}</div>{!sessions.length && <p className="tiny" style={{ marginTop: 12 }}>No focus sessions in this window yet.</p>}</section><section className="card"><div className="card-title"><div><div className="eyebrow">Focus by area</div><h2 className="section-title">Where energy went</h2></div></div>{categories.map((category) => { const total = data.sessions.filter((s) => s.category === category && days.includes(s.start.slice(0, 10))).reduce((sum, s) => sum + s.actualSeconds, 0); return <div className="stat-line" style={{ marginBottom: 15 }} key={category}><span className="muted">{category}</span><strong>{Math.round(total / 60)}m</strong></div>; })}</section></div><div className="grid grid-2" style={{ marginTop: 18 }}><section className="card"><div className="card-title"><div><div className="eyebrow">Productivity trend</div><h2 className="section-title">Completions by day</h2></div></div><div className="chart-wrap">{days.map((day) => { const value = data.tasks.filter((task) => task.completedAt?.slice(0, 10) === day).length; return <div className="bar-col" key={day}><div className="bar alt" style={{ height: `${Math.max(value ? 3 : 0, value / completedMax * 100)}%` }} title={`${value} tasks completed`} /><span>{new Intl.DateTimeFormat('en', { weekday: 'short' }).format(new Date(`${day}T12:00:00`)).slice(0, 2)}</span></div>; })}</div>{!completed.length && <p className="tiny" style={{ marginTop: 12 }}>Complete a task to build this trend.</p>}</section><section className="card"><div className="card-title"><div><div className="eyebrow">Task distribution</div><h2 className="section-title">Your work by area</h2></div></div>{categoryCounts.length ? categoryCounts.map(({ category, count }) => <div className="stat-line" style={{ marginBottom: 13 }} key={category}><span className="muted">{category}</span><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="progress-track" style={{ width: 100 }}><div className="progress-bar mint" style={{ width: `${count / Math.max(1, data.tasks.length) * 100}%` }} /></div><strong>{count}</strong></span></div>) : <Empty title="No task distribution yet" text="Capture a task to see where your attention is going." />}</section></div></div>;
}

function HistoryPage() {
  const data = useData(); const [selected, setSelected] = useState(dateKey());
  const days = Array.from(new Set([...data.tasks.map((t) => t.completedAt?.slice(0, 10)), ...data.tasks.map((t) => t.deadline), ...data.activities.map((a) => a.date), ...data.sessions.map((s) => s.start.slice(0, 10)), ...data.exercises.map((e) => e.date)].filter(Boolean) as string[])).sort().reverse();
  const selectedTasks = data.tasks.filter((task) => task.deadline === selected || task.completedAt?.slice(0, 10) === selected || data.activities.some((activity) => activity.date === selected && activity.taskId === task.id));
  const chosenSessions = data.sessions.filter((s) => s.start.slice(0, 10) === selected); const chosenExercises = data.exercises.filter((e) => e.date === selected); const completedCount = selectedTasks.filter((task) => task.done).length; const completionPercentage = selectedTasks.length ? Math.round(completedCount / selectedTasks.length * 100) : 0;
  return <div className="page"><PageHeading eyebrow="History" title="Look back gently." description="A record of what really happened, not what was planned." />{days.length ? <div className="grid grid-3"><div className="history-list">{days.map((day) => { const dayTasks = data.tasks.filter((task) => task.deadline === day || task.completedAt?.slice(0, 10) === day || data.activities.some((activity) => activity.date === day && activity.taskId === task.id)); return <button className="history-day" key={day} onClick={() => setSelected(day)} style={{ textAlign: 'left', borderColor: day === selected ? 'var(--coral)' : 'var(--line)' }} data-testid={`button-history-${day}`}><span><strong>{dateLabel(day).split(',')[0]}</strong><p>{formatDate(day)} · {dayTasks.filter((task) => task.done).length}/{dayTasks.length} tasks</p></span><span className="tag">{Math.round(data.sessions.filter((s) => s.start.slice(0, 10) === day).reduce((sum, s) => sum + s.actualSeconds, 0) / 60)}m</span></button>; })}</div><section className="card" style={{ gridColumn: 'span 2' }}><div className="eyebrow">{dateLabel(selected)}</div><h2 className="section-title" style={{ margin: '7px 0 8px' }}>The shape of this day</h2><div className="stat-line" style={{ marginBottom: 17 }}><span className="muted">Task completion</span><strong>{completionPercentage}% · {completedCount}/{selectedTasks.length || 0}</strong></div><div className="progress-track" style={{ marginBottom: 20 }}><div className="progress-bar mint" style={{ width: `${completionPercentage}%` }} /></div><div className="history-detail-grid"><div><div className="eyebrow">Tasks</div><div className="grid" style={{ gap: 9, marginTop: 10 }}>{selectedTasks.map((task) => <div className={cx('schedule-item', task.done ? '' : 'coral')} key={task.id}><div><p style={{ textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</p><span>{task.category} · {task.done ? 'completed' : 'incomplete'}</span></div>{task.done ? <Check size={16} color="var(--mint-ink)" /> : <Circle size={16} color="var(--coral)" />}</div>)}{!selectedTasks.length && <p className="tiny">No tasks were due, scheduled, or completed on this day.</p>}</div></div><div><div className="eyebrow">Focus by category</div><div className="grid" style={{ gap: 9, marginTop: 10 }}>{categories.map((category) => { const total = chosenSessions.filter((session) => session.category === category).reduce((sum, session) => sum + session.actualSeconds, 0); return <div className="stat-line" key={category}><span className="muted">{category}</span><strong>{Math.round(total / 60)}m</strong></div>; })}</div><div className="eyebrow" style={{ marginTop: 22 }}>Workout</div>{chosenExercises.length ? <p className="tiny" style={{ marginTop: 8 }}>{chosenExercises.filter((exercise) => exercise.completed).length} of {chosenExercises.length} exercises completed · {chosenExercises.reduce((sum, exercise) => sum + exercise.sets * exercise.reps, 0)} total reps</p> : <p className="tiny" style={{ marginTop: 8 }}>No workout logged.</p>}</div></div>{!selectedTasks.length && !chosenSessions.length && !chosenExercises.length && <Empty title="A quiet day" text="No activity was recorded here." />}</section></div> : <Empty icon={History} title="Your history starts here" text="Complete a task, plan a day, log a workout, or finish a focus session, and it will appear." action={<Link href="/study" className="primary-button" data-testid="button-history-focus"><Play size={14} /> Start focus</Link>} />}</div>;
}

function Profile() { const data = useData(); const [name, setName] = useState(data.settings.name); const [saved, setSaved] = useState(false); const save = (e: FormEvent) => { e.preventDefault(); if (!name.trim()) return; data.updateSettings({ name: name.trim(), avatar: initials(name) }); setSaved(true); window.setTimeout(() => setSaved(false), 1800); }; return <div className="page"><PageHeading eyebrow="Profile" title="Make it yours." description="A small identity for a very personal practice." /><div className="grid grid-2"><section className="card"><div className="card-title"><div><div className="eyebrow">Your details</div><h2 className="section-title">How should FocusFlow greet you?</h2></div><span className="avatar" style={{ width: 50, height: 50, fontSize: 16 }}>{initials(name)}</span></div><form onSubmit={save}><Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-profile-name" /></Field><div className="modal-footer" style={{ marginTop: 18 }}><button className="primary-button" type="submit" data-testid="button-save-profile">Save profile</button></div>{saved && <p className="tiny" style={{ color: 'var(--mint-ink)' }}>Saved locally.</p>}</form></section><section className="card"><div className="eyebrow">Your footprint</div><h2 className="section-title" style={{ margin: '7px 0 18px' }}>Built from your days</h2><div className="stat-line" style={{ marginBottom: 15 }}><span className="muted">Tasks captured</span><strong>{data.tasks.length}</strong></div><div className="stat-line" style={{ marginBottom: 15 }}><span className="muted">Focus sessions</span><strong>{data.sessions.length}</strong></div><div className="stat-line"><span className="muted">Projects</span><strong>{data.projects.length}</strong></div></section></div></div>; }

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
  return <div className="card music-library"><div className="card-title"><div><div className="eyebrow">Add music</div><h2 className="section-title">Your own soundtrack</h2></div><Music2 size={18} color="var(--coral)" /></div><p className="tiny" style={{ marginBottom: 15 }}>Add small audio files from this device. They stay in your private browser library.</p><label className="soft-button music-upload-button"><Upload size={14} /> Choose audio file<input type="file" accept="audio/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) addFile(file); event.currentTarget.value = ''; }} data-testid="input-add-music" /></label>{error && <p className="error-text">{error}</p>}{data.musicTracks.length ? <div className="music-library-list">{data.musicTracks.map((track) => <div className="music-library-row" key={track.id}><Music2 size={14} color="var(--coral)" /><span>{track.name}</span><button className="icon-button" onClick={() => data.deleteMusicTrack(track.id)} aria-label={`Remove ${track.name}`} data-testid={`button-remove-music-${track.id}`}><Trash2 size={13} /></button></div>)}</div> : <p className="tiny music-library-empty">No device tracks added yet.</p>}</div>;
}

function SettingsPage() {
  const data = useData();
  const [confirm, setConfirm] = useState(false);
  const update = (patch: Parameters<typeof data.updateSettings>[0]) => data.updateSettings(patch);
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ tasks: data.tasks, activities: data.activities, sessions: data.sessions, notes: data.notes, exercises: data.exercises, projects: data.projects, water: data.water, musicTracks: data.musicTracks, settings: data.settings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `focusflow-${dateKey()}.json`; a.click(); URL.revokeObjectURL(url);
  };
  return <div className="page"><PageHeading eyebrow="Settings" title="Set the conditions." description="Preferences and music stay private in this browser." /><div className="grid grid-2"><section className="card"><div className="eyebrow">Preferences</div><div className="settings-group"><div className="setting-row"><div><strong>Theme</strong><p>Choose the atmosphere for your planning space.</p></div><div className="setting-control"><button className="soft-button" onClick={() => update({ theme: data.settings.theme === 'light' ? 'dark' : 'light' })} data-testid="button-toggle-theme">{data.settings.theme === 'light' ? <Sun size={14} /> : <Moon size={14} />}{data.settings.theme === 'light' ? 'Light' : 'Dark'}</button></div></div><div className="setting-row"><div><strong>Focus minutes</strong><p>Length of a new focus session.</p></div><div className="setting-control"><input type="number" min="1" max="180" value={data.settings.pomodoro} onChange={(e) => update({ pomodoro: Math.max(1, Number(e.target.value)) })} style={{ width: 70, padding: 8, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)' }} data-testid="input-pomodoro" /></div></div><div className="setting-row"><div><strong>Break minutes</strong><p>Reset time between sessions.</p></div><div className="setting-control"><input type="number" min="1" max="60" value={data.settings.breakMinutes} onChange={(e) => update({ breakMinutes: Math.max(1, Number(e.target.value)) })} style={{ width: 70, padding: 8, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)' }} data-testid="input-break-minutes" /></div></div><div className="setting-row"><div><strong>Daily water goal</strong><p>Servings you want to make space for.</p></div><div className="setting-control"><input type="number" min="1" max="30" value={data.settings.waterGoal} onChange={(e) => update({ waterGoal: Math.max(1, Number(e.target.value)) })} style={{ width: 70, padding: 8, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)' }} data-testid="input-water-goal" /></div></div><div className="setting-row"><div><strong>Notifications</strong><p>Ask for permission only when you opt in.</p></div><button className={cx('toggle', data.settings.notifications && 'on')} onClick={async () => { if (!data.settings.notifications && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); update({ notifications: !data.settings.notifications }); }} aria-label="Toggle notifications" data-testid="button-toggle-notifications"><span /></button></div><div className="setting-row"><div><strong>Music volume</strong><p>The player stays quiet until a source is available.</p></div><div className="setting-control" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Volume2 size={14} color="var(--ink-soft)" /><input type="range" min="0" max="100" value={data.settings.volume} onChange={(e) => update({ volume: Number(e.target.value) })} data-testid="input-volume" /></div></div></div></section><section className="grid" style={{ alignContent: 'start' }}><MusicLibrary /><div className="card"><div className="eyebrow">Your data</div><h2 className="section-title" style={{ margin: '7px 0 8px' }}>Portable by default</h2><p className="tiny" style={{ marginBottom: 17 }}>Export a readable JSON copy any time. Nothing leaves this browser unless you move it yourself.</p><button className="soft-button" onClick={exportData} data-testid="button-export-data">Export my data</button></div><div className="card"><div className="eyebrow">Start over</div><h2 className="section-title" style={{ margin: '7px 0 8px' }}>Reset local data</h2><p className="tiny" style={{ marginBottom: 17 }}>This permanently removes your tasks, sessions, projects, and preferences from this browser.</p>{confirm ? <div style={{ display: 'flex', gap: 8 }}><button className="danger-button" onClick={() => data.resetAll()} data-testid="button-confirm-reset">Yes, reset everything</button><button className="soft-button" onClick={() => setConfirm(false)} data-testid="button-cancel-reset">Cancel</button></div> : <button className="danger-button" onClick={() => setConfirm(true)} data-testid="button-reset-data">Reset local data</button>}</div></section></div></div>;
}

function NotFound() { return <div className="page"><Empty icon={Search} title="This page wandered off" text="Use the navigation to find your way back into the flow." action={<Link href="/" className="primary-button" data-testid="link-not-found-home">Back to today</Link>} /></div>; }

export default App;