"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pin,
  Plus,
  Trash2,
  Check,
  FileText,
  Bold,
  List,
  Italic,
  Download,
} from "lucide-react";
import { workspaceApi as api } from "./api";
import type { NoteView } from "@/lib/workspace/schema";
type Listing = { notes: NoteView[]; hasMore: boolean };
export function NotesWorkspace() {
  const params = useSearchParams();
  const router = useRouter();
  const [notes, setNotes] = useState<NoteView[]>([]),
    [current, setCurrent] = useState<NoteView | null>(null),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("updatedAt"),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [collectionError, setCollectionError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [tasks, setTasks] = useState<{ _id: string; title: string }[]>([]),
    [taskQuery, setTaskQuery] = useState("");
  const noteRef = useRef(current);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    noteRef.current = current;
    dirtyRef.current = dirty;
  }, [current, dirty]);
  const saving = useRef(false),
    editor = useRef<HTMLTextAreaElement>(null),
    confirm = useRef<HTMLDialogElement>(null);
  const sequence = useRef(0),
    readSequence = useRef(0);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await api<Listing>(
        { action: "notes", query, sort, page },
        signal,
      );
      setNotes(result.notes);
      setMore(result.hasMore);
      setCollectionError("");
    },
    [query, sort, page],
  );
  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      load(controller.signal)
        .catch((e) => {
          if (!controller.signal.aborted) setCollectionError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [load]);
  useEffect(() => {
    const id = params.get("note");
    if (!id) return;
    const read = ++readSequence.current;
    api<NoteView>({ action: "note_read", id })
      .then((n) => {
        if (!dirtyRef.current && read === readSequence.current) {
          setCurrent(n);
          setStatus("Saved");
        }
      })
      .catch((e) => setError(e.message));
  }, [params]);
  useEffect(() => {
    const c = new AbortController();
    const t = setTimeout(() => {
      api<{ tasks: { _id: string; title: string }[] }>(
        { action: "task_choices", query: taskQuery },
        c.signal,
      )
        .then((r) => setTasks(r.tasks))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [taskQuery]);
  const save = useCallback(async () => {
    if (saving.current || !dirtyRef.current || !noteRef.current) return false;
    const snapshot = noteRef.current;
    const revision = sequence.current;
    saving.current = true;
    setBusy(true);
    setStatus("Saving…");
    setError("");
    try {
      const n = await api<NoteView>({
        action: "note_save",
        id: snapshot.id,
        version: snapshot.version,
        input: {
          title: snapshot.title,
          content: snapshot.content,
          pinned: snapshot.pinned,
          linkedTaskId: snapshot.linkedTaskId,
        },
      });
      if (noteRef.current?.id === n.id) {
        if (sequence.current === revision) {
          setCurrent(n);
          setDirty(false);
          dirtyRef.current = false;
          setStatus("Saved");
        } else {
          setCurrent((c) =>
            c ? { ...c, version: n.version, updatedAt: n.updatedAt } : c,
          );
          setStatus("Unsaved changes");
        }
      }
      await load().catch(() =>
        setCollectionError(
          "The note was saved, but the collection could not refresh. Reload the collection when you reconnect.",
        ),
      );
      return sequence.current === revision;
    } catch (e) {
      setStatus("Not saved");
      setError((e as Error).message);
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }, [load]);
  useEffect(() => {
    const navigate = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        !a ||
        !dirtyRef.current ||
        a.origin !== location.origin ||
        a.target === "_blank" ||
        e.ctrlKey ||
        e.metaKey
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      void save().then((ok) => {
        if (ok) router.push(a.pathname + a.search + a.hash);
      });
    };
    const command = (e: Event) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      void save().then((ok) => {
        if (ok) router.push((e as CustomEvent<string>).detail);
      });
    };
    document.addEventListener("click", navigate, true);
    window.addEventListener("actionflow:navigate", command);
    return () => {
      document.removeEventListener("click", navigate, true);
      window.removeEventListener("actionflow:navigate", command);
    };
  }, [router, save]);
  useEffect(() => {
    if (!dirty || error || busy) return;
    const timer = setTimeout(() => void save(), 850);
    return () => clearTimeout(timer);
  }, [current, dirty, error, busy, save]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, []);
  async function choose(n: NoteView | null) {
    if (saving.current) return;
    if (dirtyRef.current && !(await save())) return;
    setError("");
    if (n) {
      try {
        const read = ++readSequence.current;
        const next = await api<NoteView>({ action: "note_read", id: n.id });
        if (read === readSequence.current) {
          setCurrent(next);
          setStatus("Saved");
        }
      } catch (e) {
        setError((e as Error).message);
      }
    } else {
      setCurrent(null);
      setStatus("");
    }
  }
  async function create() {
    if (saving.current || (dirtyRef.current && !(await save()))) return;
    const n: NoteView = {
      id: crypto.randomUUID(),
      title: "Untitled note",
      content: "",
      pinned: false,
      linkedTaskId: null,
      version: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    ++readSequence.current;
    setCurrent(n);
    setDirty(true);
    dirtyRef.current = true;
    sequence.current++;
    setError("");
    setStatus("Unsaved changes");
  }
  function edit(values: Partial<NoteView>) {
    sequence.current++;
    setCurrent((c) => (c ? { ...c, ...values } : c));
    setDirty(true);
    dirtyRef.current = true;
    setStatus("Unsaved changes");
  }
  function format(before: string, after = "") {
    const el = editor.current;
    if (!el || !current) return;
    const a = el.selectionStart,
      b = el.selectionEnd;
    edit({
      content:
        current.content.slice(0, a) +
        before +
        current.content.slice(a, b) +
        after +
        current.content.slice(b),
    });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + before.length, b + before.length);
    });
  }
  return (
    <section className="wf-workspace">
      <header className="wf-heading">
        <div>
          <span className="wf-kicker">A place for your thoughts</span>
          <h1>Notes</h1>
          <p>Keep the details. Make room for the idea.</p>
        </div>
        <button
          className="button primary"
          onClick={() => void create()}
          disabled={busy}
        >
          <Plus size={17} />
          New note
        </button>
      </header>
      {(collectionError || (!current && error)) && (
        <div className="wf-error" role="alert">
          <p>{collectionError || error}</p>
          <button
            onClick={() => {
              setError("");
              void load().catch((e) => setCollectionError(e.message));
            }}
          >
            Retry collection
          </button>
        </div>
      )}
      <div className={"wf-notes " + (current ? "is-editing" : "")}>
        <aside className="wf-collection">
          <label className="wf-search-label">
            Find a note
            <input
              type="search"
              placeholder="Search title or content"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <select
            aria-label="Sort notes"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(0);
            }}
          >
            <option value="updatedAt">Recently edited</option>
            <option value="createdAt">Recently created</option>
          </select>
          <div aria-busy={loading}>
            {loading ? (
              <p className="wf-muted">Loading your notes…</p>
            ) : notes.length === 0 ? (
              <div className="wf-empty">
                <FileText />
                <h2>
                  {query ? "No matching notes" : "Your next idea starts here"}
                </h2>
                <p>
                  {query
                    ? "Try another phrase."
                    : "Write a thought, a meeting recap, or a plan."}
                </p>
              </div>
            ) : (
              notes.map((n) => (
                <button
                  key={n.id}
                  className={
                    "wf-note-item " + (current?.id === n.id ? "selected" : "")
                  }
                  onClick={() => void choose(n)}
                >
                  <span>
                    {n.pinned && <Pin size={13} />}
                    <strong>{n.title}</strong>
                  </span>
                  <small>
                    {new Date(n.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </small>
                </button>
              ))
            )}
          </div>
          <div className="wf-pagination">
            <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>{page + 1}</span>
            <button disabled={!more} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </aside>
        <div className="wf-editor">
          {current ? (
            <>
              <div className="wf-editor-bar">
                <button
                  className="wf-icon-button wf-note-back"
                  onClick={() => void choose(null)}
                  aria-label="Back to notes"
                >
                  <ArrowLeft size={20} />
                </button>
                <span role="status" className="wf-save-status">
                  {status === "Saved" && <Check size={14} />} {status}
                </span>
                <button
                  className={
                    "wf-icon-button " + (current.pinned ? "selected" : "")
                  }
                  aria-label={current.pinned ? "Unpin note" : "Pin note"}
                  aria-pressed={current.pinned}
                  onClick={() => edit({ pinned: !current.pinned })}
                >
                  <Pin size={17} />
                </button>
                <button
                  className="wf-icon-button"
                  aria-label="Delete note"
                  disabled={busy}
                  onClick={() => confirm.current?.showModal()}
                >
                  <Trash2 size={17} />
                </button>
              </div>
              {error && (
                <div className="wf-error" role="alert">
                  <p>{error}</p>
                  {current.version > 0 && (
                    <button
                      onClick={() => {
                        setCurrent(null);
                        setDirty(false);
                        dirtyRef.current = false;
                        setError("");
                        setStatus("");
                        void load().catch((e) => setError(e.message));
                      }}
                    >
                      Close editor (discard local edits)
                    </button>
                  )}
                  {current.version === 0 && (
                    <button
                      onClick={() => {
                        setCurrent(null);
                        setDirty(false);
                        dirtyRef.current = false;
                        setError("");
                        setStatus("");
                      }}
                    >
                      Discard this unsaved draft
                    </button>
                  )}
                  <button onClick={() => void save()} disabled={busy}>
                    Retry save
                  </button>{" "}
                  <button
                    disabled={current.version === 0 || busy}
                    onClick={() => {
                      if (current.version === 0) return;
                      api<NoteView>({ action: "note_read", id: current.id })
                        .then((n) => {
                          setCurrent(n);
                          setDirty(false);
                          dirtyRef.current = false;
                          setError("");
                          setStatus("Saved");
                        })
                        .catch((e) => setError(e.message));
                    }}
                  >
                    Reload saved version (discard local edits)
                  </button>
                  <button
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(
                        new Blob([current.title + "\n\n" + current.content], {
                          type: "text/plain",
                        }),
                      );
                      a.download = "actionflow-note.txt";
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }}
                  >
                    <Download size={14} />
                    Export local draft
                  </button>
                </div>
              )}
              <input
                className="wf-note-title"
                aria-label="Note title"
                maxLength={160}
                value={current.title}
                placeholder="Give this thought a title"
                onChange={(e) => edit({ title: e.target.value })}
              />
              <div className="wf-writing-tools">
                <button
                  aria-label="Bold selected text"
                  onClick={() => format("**", "**")}
                >
                  <Bold size={15} />
                </button>
                <button
                  aria-label="Italic selected text"
                  onClick={() => format("*", "*")}
                >
                  <Italic size={15} />
                </button>
                <button
                  aria-label="Add list item"
                  onClick={() => format("\n- ")}
                >
                  <List size={16} />
                </button>
                <span>Plain text · Markdown supported</span>
              </div>
              <textarea
                ref={editor}
                className="wf-note-content"
                aria-label="Note content"
                placeholder="Start writing. Nothing needs to be perfect yet…"
                maxLength={30000}
                value={current.content}
                onChange={(e) => edit({ content: e.target.value })}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                    e.preventDefault();
                    void save();
                  }
                  if ((e.metaKey || e.ctrlKey) && e.key === "b") {
                    e.preventDefault();
                    format("**", "**");
                  }
                }}
              />
              <div className="wf-note-footer">
                <span>
                  {current.content.length.toLocaleString()} / 30,000 characters
                </span>
                <details>
                  <summary>
                    Link to a task{current.linkedTaskId ? " · linked" : ""}
                  </summary>
                  <input
                    aria-label="Find a linked task"
                    placeholder="Find a task"
                    value={taskQuery}
                    onChange={(e) => setTaskQuery(e.target.value)}
                  />
                  <select
                    aria-label="Linked task"
                    value={current.linkedTaskId ?? ""}
                    onChange={(e) =>
                      edit({ linkedTaskId: e.target.value || null })
                    }
                  >
                    <option value="">No linked task</option>
                    {current.linkedTaskId &&
                      !tasks.some((t) => t._id === current.linkedTaskId) && (
                        <option value={current.linkedTaskId}>
                          Current linked task
                        </option>
                      )}
                    {tasks.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </details>
              </div>
            </>
          ) : (
            <div className="wf-editor-empty">
              <FileText size={38} />
              <h2>A quieter place to think.</h2>
              <p>Choose a note, or begin a fresh page.</p>
              <button
                className="button secondary"
                onClick={() => void create()}
              >
                Write a note
              </button>
              {error && <p role="alert">{error}</p>}
            </div>
          )}
        </div>
      </div>
      <dialog ref={confirm} className="wf-dialog">
        <h2>Delete this note?</h2>
        <p>This permanently removes the saved note and local edits.</p>
        <div className="wf-actions">
          <button
            className="button secondary"
            onClick={() => confirm.current?.close()}
          >
            Keep note
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              if (!current) return;
              setBusy(true);
              try {
                if (current.version > 0)
                  await api({
                    action: "note_delete",
                    id: current.id,
                    version: current.version,
                  });
                setCurrent(null);
                setDirty(false);
                dirtyRef.current = false;
                setError("");
                confirm.current?.close();
                await load();
              } catch (e) {
                setError((e as Error).message);
                confirm.current?.close();
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete note
          </button>
        </div>
      </dialog>
    </section>
  );
}
