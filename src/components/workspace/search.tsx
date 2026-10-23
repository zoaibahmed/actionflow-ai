"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  ArrowUpRight,
  FileText,
  ListTodo,
  CalendarDays,
  Bell,
} from "lucide-react";
import type { SearchResult } from "@/lib/workspace/queries";
import { workspaceApi as api } from "./api";
function Highlight({ text, query }: { text: string; query: string }) {
  const i = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  return i < 0 ? (
    <>{text}</>
  ) : (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}
export function WorkspaceSearch() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<SearchResult[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [index, setIndex] = useState(0),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  function show() {
    dialog.current?.showModal();
    setOpen(true);
    requestAnimationFrame(() => input.current?.focus());
  }
  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus();
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialog.current?.open) {
          dialog.current.close();
          setOpen(false);
        } else {
          dialog.current?.showModal();
          setOpen(true);
          requestAnimationFrame(() => input.current?.focus());
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    const t = setTimeout(() => {
      setResults([]);
      setMore(false);
      setIndex(0);
      setError("");
      if (query.trim().length < 2) {
        setLoading(false);
        return;
      }
      setLoading(true);
      api<{ results: SearchResult[]; hasMore: boolean }>(
        { action: "search", query, page },
        c.signal,
      )
        .then((d) => {
          setResults(d.results);
          setMore(d.hasMore);
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [query, page, open, retry]);
  useEffect(() => {
    document
      .getElementById("wf-search-result-" + index)
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);
  function go(result: SearchResult) {
    if (loading) return;
    close();
    if (
      window.dispatchEvent(
        new CustomEvent("actionflow:navigate", {
          cancelable: true,
          detail: result.href,
        }),
      )
    )
      router.push(result.href);
  }
  return (
    <>
      <button
        ref={trigger}
        className="wf-search-trigger"
        onClick={show}
        aria-label="Search workspace"
      >
        <Search size={17} />
        <span>Search workspace</span>
        <kbd>⌘ / Ctrl K</kbd>
      </button>
      <dialog
        ref={dialog}
        className="wf-search-dialog"
        aria-labelledby="wf-search-title"
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
      >
        <div className="wf-search-shell">
          <h2 id="wf-search-title" className="sr-only">
            Search your workspace
          </h2>
          <div className="wf-command-input">
            <Search size={21} />
            <input
              ref={input}
              role="combobox"
              aria-expanded={open}
              aria-controls="wf-search-results"
              aria-activedescendant={
                results.length ? "wf-search-result-" + index : undefined
              }
              aria-autocomplete="list"
              aria-label="Search tasks, notes, reminders and plans"
              placeholder="Find something in your workspace…"
              value={query}
              maxLength={100}
              onChange={(e) => {
                setResults([]);
                setMore(false);
                setLoading(e.target.value.trim().length >= 2);
                setQuery(e.target.value);
                setPage(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setIndex((i) =>
                    Math.min(results.length - 1, Math.max(0, i + 1)),
                  );
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setIndex((i) => Math.max(0, i - 1));
                }
                if (e.key === "Enter" && results[index]) {
                  e.preventDefault();
                  go(results[index]);
                }
              }}
            />
            <button
              className="wf-icon-button"
              aria-label="Close search"
              onClick={close}
            >
              <X size={20} />
            </button>
          </div>
          <div
            className="wf-command-results"
            id="wf-search-results"
            role="listbox"
            aria-label="Search results"
            aria-busy={loading}
          >
            {error ? (
              <div className="wf-error" role="alert">
                {error}
                <button onClick={() => setRetry((r) => r + 1)}>Retry</button>
              </div>
            ) : loading ? (
              <p className="wf-search-message" role="status">
                Searching your workspace…
              </p>
            ) : query.trim().length < 2 ? (
              <div className="wf-search-message">
                <strong>One search. Your whole workspace.</strong>
                <p>
                  Find tasks, personal notes, reminders and saved Dayflow plans.
                  Enter at least two characters.
                </p>
              </div>
            ) : !results.length ? (
              <p className="wf-search-message" role="status">
                No results. Try a shorter title or another phrase.
              </p>
            ) : (
              results.map((r, i) => {
                const Glyph =
                  r.kind === "Notes"
                    ? FileText
                    : r.kind === "Tasks"
                      ? ListTodo
                      : r.kind === "Reminders"
                        ? Bell
                        : CalendarDays;
                return (
                  <div key={r.kind + r.id}>
                    {(i === 0 || results[i - 1].kind !== r.kind) && (
                      <div className="wf-result-group" role="presentation">
                        {r.kind}
                      </div>
                    )}
                    <button
                      id={"wf-search-result-" + i}
                      role="option"
                      aria-selected={index === i}
                      className={
                        "wf-search-result " + (i === index ? "selected" : "")
                      }
                      onPointerMove={() => setIndex(i)}
                      onClick={() => go(r)}
                    >
                      <Glyph size={18} />
                      <span>
                        <strong>
                          <Highlight text={r.title} query={query.trim()} />
                        </strong>
                        <small>{r.context}</small>
                      </span>
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <div className="wf-command-footer">
            <span>↑ ↓ navigate · Enter open · Esc close</span>
            <div>
              <button
                disabled={!page || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                disabled={!more || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                More results
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
