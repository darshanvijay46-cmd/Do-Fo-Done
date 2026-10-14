import { useEffect, useId, useMemo, useRef, useState, type PointerEvent, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import { FilePlus2, FolderOpen, MoveUpRight, Pencil, Pin, Plus, Save, Trash2, X } from 'lucide-react';
import { useData, type StickyNote } from '@/lib/store';

type DragItem = { kind: 'note' | 'folder'; id: string; x: number; y: number; offsetX: number; offsetY: number };
const NOTE_WIDTH = 224;
const NOTE_HEIGHT = 174;
const FOLDER_WIDTH = 206;
const FOLDER_HEIGHT = 118;
const normalizedTitle = (title: string) => title.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function StickyWorkspace({ fullscreen = false, onClose }: { fullscreen?: boolean; onClose?: () => void }) {
  const data = useData();
  const titleSuggestionsId = useId();
  const boardRef = useRef<HTMLDivElement>(null);
  const refs = useRef(new Map<string, HTMLElement>());
  const dragRef = useRef<DragItem | null>(null);
  const movedRef = useRef(false);
  const [boardSize, setBoardSize] = useState({ width: 900, height: 520 });
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const submitLock = useRef(false);

  const visibleNotes = useMemo(() => data.stickyNotes.filter((note) => !note.folderId), [data.stickyNotes]);
  const openFolder = data.stickyFolders.find((folder) => folder.id === openFolderId);
  const folderNotes = data.stickyNotes.filter((note) => note.folderId === openFolderId);
  const titleSuggestions = useMemo(() => [...new Set([...data.stickyFolders.map((folder) => folder.title), ...data.stickyNotes.map((note) => note.title)].map((item) => item.trim()).filter(Boolean))], [data.stickyFolders, data.stickyNotes]);

  useEffect(() => {
    const node = boardRef.current;
    if (!node) return;
    const updateSize = () => setBoardSize({ width: node.clientWidth, height: node.clientHeight });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const toPixels = (x: number, y: number, kind: DragItem['kind']) => {
    const width = kind === 'note' ? NOTE_WIDTH : FOLDER_WIDTH;
    const height = kind === 'note' ? NOTE_HEIGHT : FOLDER_HEIGHT;
    return { x: x * Math.max(0, boardSize.width - width), y: y * Math.max(0, boardSize.height - height) };
  };
  const toNormalized = (x: number, y: number, kind: DragItem['kind']) => {
    const width = kind === 'note' ? NOTE_WIDTH : FOLDER_WIDTH;
    const height = kind === 'note' ? NOTE_HEIGHT : FOLDER_HEIGHT;
    return {
      x: clamp(x / Math.max(1, boardSize.width - width), 0, 1),
      y: clamp(y / Math.max(1, boardSize.height - height), 0, 1),
    };
  };

  const beginDrag = (event: PointerEvent<HTMLDivElement>, kind: DragItem['kind'], id: string) => {
    if ((event.target as HTMLElement).closest('button, input, textarea')) return;
    const board = boardRef.current;
    const card = event.currentTarget.closest('.sticky-card') as HTMLElement | null;
    if (!board || !card) return;
    const boardRect = board.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const item = { kind, id, x: cardRect.left - boardRect.left, y: cardRect.top - boardRect.top, offsetX: event.clientX - cardRect.left, offsetY: event.clientY - cardRect.top };
    dragRef.current = item;
    movedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(item);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const item = dragRef.current;
    const board = boardRef.current;
    if (!item || !board) return;
    const rect = board.getBoundingClientRect();
    const width = item.kind === 'note' ? NOTE_WIDTH : FOLDER_WIDTH;
    const height = item.kind === 'note' ? NOTE_HEIGHT : FOLDER_HEIGHT;
    const next = {
      ...item,
      x: clamp(event.clientX - rect.left - item.offsetX, 0, Math.max(0, board.clientWidth - width)),
      y: clamp(event.clientY - rect.top - item.offsetY, 0, Math.max(0, board.clientHeight - height)),
    };
    movedRef.current = true;
    dragRef.current = next;
    setDragging(next);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const item = dragRef.current;
    const board = boardRef.current;
    if (!item || !board) return;
    const rect = board.getBoundingClientRect();
    const width = item.kind === 'note' ? NOTE_WIDTH : FOLDER_WIDTH;
    const height = item.kind === 'note' ? NOTE_HEIGHT : FOLDER_HEIGHT;
    const x = clamp(event.clientX - rect.left - item.offsetX, 0, Math.max(0, board.clientWidth - width));
    const y = clamp(event.clientY - rect.top - item.offsetY, 0, Math.max(0, board.clientHeight - height));
    const source = { left: x, top: y, right: x + width, bottom: y + height };
    const overlaps = (candidate: DOMRect | undefined) => Boolean(candidate && source.left < candidate.right - rect.left && source.right > candidate.left - rect.left && source.top < candidate.bottom - rect.top && source.bottom > candidate.top - rect.top);
    let grouped = false;

    if (item.kind === 'note') {
      const note = data.stickyNotes.find((entry) => entry.id === item.id);
      for (const folder of data.stickyFolders) {
        if (overlaps(refs.current.get(`folder:${folder.id}`)?.getBoundingClientRect())) {
          if (note && normalizedTitle(note.title) === normalizedTitle(folder.title)) {
            data.addStickyNoteToFolder(note.id, folder.id);
            grouped = true;
            break;
          }
        }
      }
      if (!grouped) {
        for (const other of visibleNotes) {
          if (other.id === item.id || !overlaps(refs.current.get(`note:${other.id}`)?.getBoundingClientRect())) continue;
          if (note && normalizedTitle(note.title) === normalizedTitle(other.title)) {
            data.groupStickyNotes(note.id, other.id, other.x, other.y);
            grouped = true;
            break;
          }
        }
      }
    } else {
      for (const other of data.stickyFolders) {
        if (other.id === item.id || !overlaps(refs.current.get(`folder:${other.id}`)?.getBoundingClientRect())) continue;
        if (normalizedTitle(other.title) === normalizedTitle(data.stickyFolders.find((folder) => folder.id === item.id)?.title ?? '')) {
          data.mergeStickyFolders(item.id, other.id);
          grouped = true;
          break;
        }
      }
    }

    if (!grouped) {
      const position = toNormalized(x, y, item.kind);
      if (item.kind === 'note') data.moveStickyNote(item.id, position.x, position.y);
      else data.moveStickyFolder(item.id, position.x, position.y);
    }
    dragRef.current = null;
    setDragging(null);
    window.setTimeout(() => { movedRef.current = false; }, 0);
  };

  const submitNote = (event: FormEvent) => {
    event.preventDefault();
    if (submitLock.current) return;
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (!cleanTitle || !cleanContent) {
      setError('Add both a title and note text.');
      return;
    }
    submitLock.current = true;
    if (editingId) data.updateStickyNote(editingId, { title: cleanTitle, content: cleanContent });
    else {
      const count = visibleNotes.length + data.stickyFolders.length;
      const position = { x: (count % 3) * 0.27 + 0.04, y: Math.floor(count / 3) * 0.36 + 0.05 };
      data.addStickyNote(cleanTitle, cleanContent, Math.min(position.x, 0.72), Math.min(position.y, 0.76));
    }
    setTitle('');
    setContent('');
    setError('');
    setEditingId(null);
    setComposerOpen(false);
  };

  const edit = (note: StickyNote) => {
    submitLock.current = false;
    setOpenFolderId(null);
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setError('');
    setComposerOpen(true);
  };

  const onItemKeyDown = (event: KeyboardEvent<HTMLElement>, kind: DragItem['kind'], id: string, x: number, y: number) => {
    if (event.target !== event.currentTarget) return;
    if (kind === 'folder' && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      setOpenFolderId(id);
      return;
    }
    const delta = event.shiftKey ? 40 : 16;
    const movement = event.key === 'ArrowLeft' ? [-delta, 0] : event.key === 'ArrowRight' ? [delta, 0] : event.key === 'ArrowUp' ? [0, -delta] : event.key === 'ArrowDown' ? [0, delta] : null;
    if (!movement) return;
    event.preventDefault();
    const pixel = toPixels(x, y, kind);
    const next = toNormalized(pixel.x + movement[0], pixel.y + movement[1], kind);
    if (kind === 'note') data.moveStickyNote(id, next.x, next.y);
    else data.moveStickyFolder(id, next.x, next.y);
  };

  const draggedStyle = (kind: DragItem['kind'], id: string, x: number, y: number): CSSProperties => {
    const position = dragging?.kind === kind && dragging.id === id ? { x: dragging.x, y: dragging.y } : toPixels(x, y, kind);
    return { left: position.x, top: position.y };
  };

  return <section className={`sticky-workspace-section${fullscreen ? ' sticky-fullscreen-panel' : ''}`}>
    <div className="sticky-board-heading"><div><div className="eyebrow">Study workspace</div><h2 className="section-title">Sticky notes</h2><p>Move notes together to file matching titles into folders.</p></div><div className="sticky-board-actions">{fullscreen && <button className="soft-button" onClick={() => onClose?.()}><X size={14} /> Close</button>}<button className="primary-button" onClick={() => { submitLock.current = false; setEditingId(null); setTitle(''); setContent(''); setComposerOpen(true); }}><Plus size={14} /> New sticky note</button></div></div>
    <div className="sticky-board" ref={boardRef} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <div className="sticky-board-hint">Drag a note over another with the same title to make a folder</div>
      {visibleNotes.map((note, index) => {
        const colorClass = `paper-${index % 4}`;
        return <article key={note.id} ref={(node) => { if (node) refs.current.set(`note:${note.id}`, node); else refs.current.delete(`note:${note.id}`); }} className={`sticky-card sticky-note ${colorClass} ${dragging?.id === note.id ? 'dragging' : ''}`} style={draggedStyle('note', note.id, note.x, note.y)} tabIndex={0} aria-label={`Sticky note ${note.title}. Use arrow keys to move.`} onKeyDown={(event) => onItemKeyDown(event, 'note', note.id, note.x, note.y)}>
          <div className="sticky-note-header" onPointerDown={(event) => beginDrag(event, 'note', note.id)}><span className="sticky-pin" aria-hidden="true"><Pin size={12} /></span><strong>{note.title}</strong><div className="sticky-actions"><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => edit(note)} aria-label={`Edit ${note.title}`}><Pencil size={13} /></button><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => data.deleteStickyNote(note.id)} aria-label={`Delete ${note.title}`}><Trash2 size={13} /></button></div></div>
          <p>{note.content}</p>
        </article>;
      })}
      {data.stickyFolders.map((folder) => <article key={folder.id} ref={(node) => { if (node) refs.current.set(`folder:${folder.id}`, node); else refs.current.delete(`folder:${folder.id}`); }} className={`sticky-card sticky-folder ${dragging?.id === folder.id ? 'dragging' : ''}`} style={draggedStyle('folder', folder.id, folder.x, folder.y)} tabIndex={0} role="button" aria-label={`${folder.title} folder, ${data.stickyNotes.filter((note) => note.folderId === folder.id).length} notes. Press Enter to open or use arrow keys to move.`} onKeyDown={(event) => onItemKeyDown(event, 'folder', folder.id, folder.x, folder.y)} onClick={() => { if (!movedRef.current) setOpenFolderId(folder.id); else movedRef.current = false; }}>
        <div className="sticky-folder-back" aria-hidden="true" /><div className="sticky-note-header" onPointerDown={(event) => beginDrag(event, 'folder', folder.id)}><span className="sticky-pin"><Pin size={12} /></span><strong>{folder.title}</strong></div><button className="sticky-folder-open" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setOpenFolderId(folder.id); }}> <FolderOpen size={14} /> {data.stickyNotes.filter((note) => note.folderId === folder.id).length} notes · Open folder</button>
      </article>)}
      {!visibleNotes.length && !data.stickyFolders.length && <div className="sticky-board-empty"><FilePlus2 size={25} /><strong>Your board is ready</strong><span>Create a sticky note to collect ideas while you study.</span></div>}
      <button type="button" className="sticky-composer-launch" onClick={() => { submitLock.current = false; setEditingId(null); setTitle(''); setContent(''); setComposerOpen(true); }}><Plus size={16} /> Add a note</button>
      {composerOpen && <form className="sticky-composer" onSubmit={submitNote}><div className="sticky-composer-head"><strong>{editingId ? 'Edit sticky note' : 'New sticky note'}</strong><button type="button" onClick={() => setComposerOpen(false)} aria-label="Close note composer"><X size={15} /></button></div><label>Title<input autoFocus list={titleSuggestionsId} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={60} autoComplete="off" /><datalist id={titleSuggestionsId}>{titleSuggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist></label><label>Note<textarea value={content} onChange={(event) => setContent(event.target.value)} rows={5} maxLength={600} /></label>{error && <p className="sticky-error" role="alert">{error}</p>}<button className="primary-button" type="submit"><Save size={14} /> {editingId ? 'Save changes' : 'Create sticky note'}</button></form>}
      {openFolder && <div className="sticky-folder-overlay" role="dialog" aria-modal="true" aria-label={`${openFolder.title} folder`}><div className="sticky-folder-dialog"><header><div><div className="eyebrow">{folderNotes.length} notes</div><h3>{openFolder.title}</h3></div><button className="icon-button" onClick={() => setOpenFolderId(null)} aria-label="Close folder"><X size={16} /></button></header><div className="sticky-folder-notes">{folderNotes.map((note) => <article className="sticky-folder-note" key={note.id}><div className="sticky-folder-note-title"><Pin size={12} /><strong>{note.title}</strong></div><p>{note.content}</p><div className="sticky-folder-note-actions"><button className="soft-button" onClick={() => edit(note)}><Pencil size={13} /> Edit</button><button className="soft-button" onClick={() => { const position = toNormalized(openFolder.x * Math.max(0, boardSize.width - FOLDER_WIDTH) + FOLDER_WIDTH + 12, openFolder.y * Math.max(0, boardSize.height - FOLDER_HEIGHT) + 10, 'note'); data.extractStickyNote(note.id, position.x, position.y); }}><MoveUpRight size={13} /> Move out</button><button className="icon-button" onClick={() => data.deleteStickyNote(note.id)} aria-label={`Delete ${note.title}`}><Trash2 size={13} /></button></div></article>)}</div></div></div>}
    </div>
  </section>;
}
