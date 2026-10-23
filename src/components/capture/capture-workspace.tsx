"use client";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useCallback,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "motion/react";
import { Icon } from "@/components/ui/icon";
import { FlowSymbol } from "@/components/ui/brand";
import {
  approvalSchema,
  type CaptureResult,
  type Suggestion,
  type SaveResult,
} from "@/lib/capture/schema";
type Draft = Suggestion & {
  selected: boolean;
  saved: boolean;
  deadlineMode: "review" | "confirmed" | "none";
  error: string;
};
type Mode = "text" | "image" | "pdf";
const subscribeZone = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverZone = () => "";
export function CaptureWorkspace({
  configured,
  dailyLimit,
}: {
  configured: boolean;
  dailyLimit: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("text"),
    [text, setText] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [dragging, setDragging] = useState(false),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [result, setResult] = useState<CaptureResult | null>(null),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [error, setError] = useState(""),
    [code, setCode] = useState(""),
    [message, setMessage] = useState(""),
    [zoneOverride, setTimezone] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null),
    reviewHeading = useRef<HTMLHeadingElement>(null),
    sourceHeading = useRef<HTMLHeadingElement>(null);
  const detectedZone = useSyncExternalStore(
    subscribeZone,
    browserZone,
    serverZone,
  );
  const timezone = zoneOverride ?? detectedZone;
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    const expired = () => {
      setCode("session");
      setError(
        "Your session expired. Sign in in a new tab, then retry. Your source and edits are still here.",
      );
    };
    window.addEventListener("actionflow:session-expired", expired);
    return () =>
      window.removeEventListener("actionflow:session-expired", expired);
  }, []);
  useEffect(() => () => controller.current?.abort(), []);
  const focusReview = useCallback((node: HTMLHeadingElement | null) => {
    reviewHeading.current = node;
    if (node) node.focus();
  }, []);

  const selected = drafts.filter((d) => d.selected && !d.saved);
  function changeMode(value: Mode) {
    if (busy || saving) return;
    setMode(value);
    setFile(null);
    setPreview("");
    setError("");
    setMessage("");
  }
  function chooseFile(value: File | undefined) {
    if (!value) return;
    setError("");
    const valid =
      mode === "pdf"
        ? value.type === "application/pdf" && /\.pdf$/i.test(value.name)
        : ["image/png", "image/jpeg", "image/webp"].includes(value.type) &&
          /\.(png|jpe?g|webp)$/i.test(value.name);
    if (!valid) {
      setError(
        mode === "pdf"
          ? "Choose a PDF file."
          : "Choose a PNG, JPG, or WebP image.",
      );
      return;
    }
    if (
      value.size > (mode === "pdf" ? 10 : 5) * 1024 * 1024 ||
      value.size === 0
    ) {
      setError(
        mode === "pdf"
          ? "Choose a non-empty PDF of 10 MB or less."
          : "Choose a non-empty image of 5 MB or less.",
      );
      return;
    }
    setFile(value);
    setPreview(mode === "image" ? URL.createObjectURL(value) : "");
  }
  function patch(id: string, value: Partial<Draft>) {
    setDrafts((current) =>
      current.map((d) => (d.id === id ? { ...d, ...value, error: "" } : d)),
    );
    setMessage("");
  }
  async function analyze() {
    if (
      result &&
      drafts.some((d) => !d.saved) &&
      !window.confirm(
        "Retry analysis and replace these suggestions? Tasks already saved will stay in your workspace.",
      )
    )
      return;
    setError("");
    setCode("");
    setMessage("");
    if (!timezone) {
      setError("Choose your IANA time zone before analyzing.");
      return;
    }
    if (mode === "text" && (!text.trim() || text.length > 20000)) {
      setError("Paste 1–20,000 characters to analyze.");
      return;
    }
    if (mode !== "text" && !file) {
      setError("Choose a file first.");
      return;
    }
    const form = new FormData();
    form.set("timezone", timezone);
    if (mode === "text") form.set("text", text);
    else form.set("file", file!);
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      const response = await fetch("/api/capture/analyze", {
        method: "POST",
        body: form,
        signal: abort.signal,
      });
      const body = await response.json();
      if (!response.ok) {
        setCode(body.code || "");
        throw new Error(
          body.error || "Analysis is unavailable. Please try again.",
        );
      }
      setResult(body as CaptureResult);
      setDrafts(
        (body as CaptureResult).suggestions.map((d) => ({
          ...d,
          description:
            d.description ||
            (d.date_wording && (!d.due_date || !d.due_time)
              ? `Timing from source: ${d.date_wording}`
              : null),
          selected: false,
          saved: false,
          deadlineMode: "review",
          error: "",
        })),
      );
      if (!body.suggestions.length)
        setMessage(
          "No actionable tasks were found. Nothing was saved. You can edit your source and retry.",
        );
    } catch (e) {
      setError(
        e instanceof Error && e.name === "AbortError"
          ? "Analysis canceled. Your source is still here; the request may count toward today’s allowance."
          : e instanceof TypeError
            ? "The connection was interrupted. Your input is still here. Please retry."
            : e instanceof Error
              ? e.message
              : "The connection was interrupted. Your source is still here.",
      );
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }
  async function save() {
    if (!result) return;
    setCode("");
    setError("");
    setMessage("");
    const payload = {
      captureId: result.captureId,
      items: selected.map((d) => ({
        suggestionId: d.id,
        title: d.title,
        description: d.description || null,
        priority: d.priority,
        deadlineMode: d.deadlineMode,
        dueDate: d.deadlineMode === "none" ? null : d.due_date,
        dueTime: d.deadlineMode === "none" ? null : d.due_time,
        timezone: d.timezone,
      })),
    };
    const parsed = approvalSchema.safeParse(payload);
    if (!parsed.success) {
      setError(
        "Check your selected tasks. Every task needs a title and a confirmed date/time or an explicit choice to save without a deadline.",
      );
      const issues = new Map<string, string>();
      for (const issue of parsed.error.issues) {
        const index = issue.path[1];
        if (typeof index === "number" && selected[index])
          issues.set(selected[index].id, issue.message);
      }
      setDrafts((current) =>
        current.map((d) => ({ ...d, error: issues.get(d.id) || d.error })),
      );
      const first = selected.find((d) => issues.has(d.id));
      if (first)
        document
          .getElementById(
            `${first.title.trim() ? "date" : "title"}-${first.id}`,
          )
          ?.focus();
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/capture/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json();
      if (!response.ok) {
        setCode(body.code || "");
        throw new Error(body.error || "We couldn’t save these tasks.");
      }
      const data = body as SaveResult;
      setDrafts((current) =>
        current.map((d) =>
          data.saved.some((s) => s.suggestionId === d.id)
            ? { ...d, saved: true, selected: false, error: "" }
            : {
                ...d,
                error:
                  data.errors.find((e) => e.suggestionId === d.id)?.message ||
                  d.error,
              },
        ),
      );
      if (data.saved.length) {
        setMessage(
          `${data.saved.length} ${data.saved.length === 1 ? "task is" : "tasks are"} saved in your workspace.${data.saved.some((s) => s.alreadySaved) ? " Previously saved tasks were not duplicated." : ""}`,
        );
        router.refresh();
      }
      if (data.errors.length)
        setError(
          `${data.errors.length} ${data.errors.length === 1 ? "task needs" : "tasks need"} another attempt. Your edits are preserved; see the messages below.`,
        );
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "The connection was interrupted. Retry to check the result; approved tasks won’t be duplicated."
          : e instanceof Error
            ? e.message
            : "We couldn’t confirm this save. Your edits are still here; please retry.",
      );
    } finally {
      setSaving(false);
    }
  }
  function startNew() {
    if (
      drafts.some((d) => !d.saved) &&
      !window.confirm("Start a new capture and discard unsaved suggestions?")
    )
      return;
    setResult(null);
    setDrafts([]);
    setText("");
    setFile(null);
    setPreview("");
    setMessage("");
    setError("");
    setCode("");
    requestAnimationFrame(() => sourceHeading.current?.focus());
  }
  return (
    <div className="capture-workspace">
      <header className="capture-heading">
        <div>
          <span className="eyebrow">Smart Capture</span>
          <h1>
            From a thought
            <br />
            to a little headspace.
          </h1>
          <p>Bring the context. Find the next step. Keep the final say.</p>
        </div>
        <div className="capture-privacy">
          <Icon name="check" width="15" />
          <span>
            Only you approve what’s saved.
            <small>Original uploads aren’t stored in ActionFlow.</small>
          </span>
        </div>
      </header>
      <nav className="capture-journey" aria-label="Capture progress">
        {["Capture", "Understand", "Organize"].map((label, index) => (
          <span
            key={label}
            className={(busy ? 1 : result ? 2 : 0) === index ? "current" : ""}
            aria-current={
              (busy ? 1 : result ? 2 : 0) === index ? "step" : undefined
            }
          >
            <i>0{index + 1}</i>
            {label}
            {index < 2 && (
              <svg viewBox="0 0 100 16" aria-hidden="true">
                <path d="M1 8 Q 30 -3 50 8 T99 8" />
              </svg>
            )}
          </span>
        ))}
      </nav>
      {!configured && (
        <div className="capture-setup" role="status">
          <Icon name="settings" />
          <div>
            <strong>A connection is needed.</strong>
            <p>
              Add OPENAI_API_KEY to the server’s local environment to analyze
              sources. You can still prepare your input. No example results will
              be substituted.
            </p>
          </div>
        </div>
      )}
      <div className={`capture-stage ${result ? "has-results" : ""}`}>
        <m.section
          layout="position"
          className="capture-source"
          aria-labelledby="capture-source-heading"
        >
          <div className="capture-source-heading">
            <h2 ref={sourceHeading} tabIndex={-1} id="capture-source-heading">
              {result ? "Capture source" : "What’s on your mind?"}
            </h2>
            {result && (
              <span className="availability">Kept here for your review</span>
            )}
          </div>
          <div className="capture-modes" aria-label="Source type">
            {(["text", "image", "pdf"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={mode === value}
                disabled={busy || saving}
                onClick={() => changeMode(value)}
              >
                <Icon
                  name={
                    value === "text"
                      ? "tasks"
                      : value === "image"
                        ? "capture"
                        : "inbox"
                  }
                  width="16"
                />
                {value === "text"
                  ? "Paste text"
                  : value === "image"
                    ? "Image"
                    : "PDF"}
                {mode === value && <m.span layoutId="capture-source-tab" />}
              </button>
            ))}
          </div>
          {mode === "text" ? (
            <div className="capture-text-wrap">
              <label htmlFor="capture-text" className="sr-only">
                Text to analyze
              </label>
              <textarea
                id="capture-text"
                value={text}
                maxLength={20000}
                disabled={busy || saving}
                onChange={(e) => setText(e.target.value)}
                placeholder="A message from a colleague. A deadline from class. That note you don’t want to lose…"
              />
              <div className="capture-input-note">
                <span>One source. A clearer next step.</span>
                <span>{text.length.toLocaleString()} / 20,000</span>
              </div>
            </div>
          ) : (
            <div
              className={`capture-drop ${dragging ? "is-dragging" : ""} ${file ? "has-file" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy && !saving) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!busy && !saving) {
                  if (e.dataTransfer.files.length !== 1)
                    setError("Choose one source per capture.");
                  else chooseFile(e.dataTransfer.files[0]);
                }
              }}
            >
              <input
                className="sr-only"
                ref={input}
                type="file"
                aria-label={mode === "pdf" ? "Choose a PDF" : "Choose an image"}
                accept={
                  mode === "pdf"
                    ? ".pdf,application/pdf"
                    : ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                }
                disabled={busy || saving}
                onChange={(e) => {
                  chooseFile(e.target.files?.[0]);
                  e.currentTarget.value = "";
                }}
              />
              {file ? (
                <>
                  <m.div
                    layout
                    layoutId="capture-file-preview"
                    className="capture-file-preview"
                  >
                    {preview ? (
                      <Image
                        src={preview}
                        alt="Selected source preview"
                        width={800}
                        height={600}
                        unoptimized
                      />
                    ) : (
                      <Icon name="inbox" width="42" />
                    )}
                  </m.div>
                  <strong>{file.name}</strong>
                  <span>
                    {(file.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                    {mode === "pdf"
                      ? "PDF page count verified on the server"
                      : "Image content verified on the server"}
                  </span>
                  <button
                    className="text-link"
                    disabled={busy || saving}
                    onClick={() => {
                      setFile(null);
                      setPreview("");
                    }}
                  >
                    Remove file <Icon name="close" width="13" />
                  </button>
                </>
              ) : (
                <>
                  <span className="capture-drop-symbol">
                    <Icon
                      name={mode === "pdf" ? "inbox" : "capture"}
                      width="28"
                    />
                  </span>
                  <h3>A little context goes a long way.</h3>
                  <p>
                    {mode === "pdf"
                      ? "Drop a PDF here. Up to 10 MB and 20 pages."
                      : "Drop a screenshot or image here. PNG, JPG, or WebP, up to 5 MB."}
                  </p>
                  <button
                    className="button secondary"
                    disabled={busy || saving}
                    onClick={() => input.current?.click()}
                  >
                    Choose {mode === "pdf" ? "a PDF" : "an image"}
                    <Icon name="plus" width="15" />
                  </button>
                </>
              )}
            </div>
          )}
          <div className="capture-source-footer">
            <label htmlFor="capture-timezone">
              Your time zone
              <input
                id="capture-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={busy || saving}
                placeholder="e.g. Asia/Karachi"
              />
            </label>
            <p>
              On Analyze, this source is sent to OpenAI. Review sensitive
              information before sharing. Analysis attempts count toward your{" "}
              {dailyLimit}-per-day allowance, resetting at midnight UTC.
            </p>
          </div>
          <div className="capture-source-actions">
            <button
              className="button primary"
              disabled={!configured || busy || saving}
              onClick={analyze}
            >
              <Icon
                name={busy ? "loading" : "spark"}
                className={busy ? "spinner" : ""}
                width="16"
              />
              {busy
                ? "Analyzing…"
                : result
                  ? "Retry analysis"
                  : "Analyze source"}
            </button>
            {busy && (
              <button
                className="button text-button"
                onClick={() => controller.current?.abort()}
              >
                Cancel analysis
              </button>
            )}
            {result && !busy && (
              <button
                className="button text-button"
                disabled={saving}
                onClick={startNew}
              >
                Start new capture
              </button>
            )}
          </div>
        </m.section>
        <AnimatePresence mode="wait">
          {busy ? (
            <m.section
              key="understanding"
              className="capture-understanding"
              initial={{ opacity: 0.4, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              role="status"
            >
              <div className="understanding-orbit">
                <FlowSymbol />
                <span />
                <span />
              </div>
              <h2>Finding the next step.</h2>
              <p>
                Your source is being validated and analyzed. Suggestions will
                appear when the request completes.
              </p>
              <span className="capture-wait">
                <Icon name="loading" className="spinner" width="15" />
                Waiting for the analysis response
              </span>
              <small>No tasks are being created.</small>
            </m.section>
          ) : result ? (
            <m.section
              key="organize"
              className="capture-review"
              initial={{ opacity: 0.5, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              aria-labelledby="capture-review-heading"
            >
              <header className="capture-review-heading">
                <div>
                  <span className="eyebrow">You have the final say</span>
                  <h2
                    id="capture-review-heading"
                    tabIndex={-1}
                    ref={focusReview}
                  >
                    {drafts.length
                      ? "A few clear next steps."
                      : "A little more context may help."}
                  </h2>
                  <p>
                    {drafts.length} suggestions · {result.remaining} remaining
                    after this analysis
                  </p>
                </div>
                <FlowSymbol />
              </header>
              {drafts.length > 0 && (
                <div className="capture-selection">
                  <span>{selected.length} selected</span>
                  <button
                    disabled={saving}
                    onClick={() =>
                      setDrafts((v) =>
                        v.map((d) => (d.saved ? d : { ...d, selected: true })),
                      )
                    }
                  >
                    Select all
                  </button>
                  <button
                    disabled={saving}
                    onClick={() =>
                      setDrafts((v) =>
                        v.map((d) => ({ ...d, selected: false })),
                      )
                    }
                  >
                    Clear selection
                  </button>
                </div>
              )}
              <div className="capture-drafts">
                <AnimatePresence initial={false}>
                  {drafts.map((draft, index) => (
                    <m.article
                      layout="position"
                      key={draft.id}
                      className={`capture-draft ${draft.selected ? "is-selected" : ""} ${draft.saved ? "is-saved" : ""}`}
                      initial={{ opacity: 0.5, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      aria-label={`Suggestion ${index + 1}`}
                    >
                      <div className="draft-heading">
                        <label>
                          <input
                            type="checkbox"
                            checked={draft.selected}
                            disabled={draft.saved || saving}
                            onChange={(e) =>
                              patch(draft.id, { selected: e.target.checked })
                            }
                          />
                          {draft.saved
                            ? "Saved to your tasks"
                            : `Include suggestion ${index + 1}`}
                        </label>
                        <span>{draft.action_type}</span>
                        {!draft.saved && (
                          <button
                            className="icon-button"
                            disabled={saving}
                            aria-label={`Remove suggestion ${index + 1}`}
                            onClick={() =>
                              setDrafts((v) =>
                                v.filter((d) => d.id !== draft.id),
                              )
                            }
                          >
                            <Icon name="close" width="14" />
                          </button>
                        )}
                      </div>
                      <fieldset
                        disabled={draft.saved || saving}
                        aria-describedby={
                          draft.error ? `draft-error-${draft.id}` : undefined
                        }
                      >
                        <label htmlFor={`title-${draft.id}`}>
                          Task title
                          <input
                            id={`title-${draft.id}`}
                            value={draft.title}
                            maxLength={160}
                            onChange={(e) =>
                              patch(draft.id, { title: e.target.value })
                            }
                          />
                        </label>
                        <label htmlFor={`description-${draft.id}`}>
                          Description
                          <textarea
                            id={`description-${draft.id}`}
                            value={draft.description || ""}
                            maxLength={2000}
                            rows={2}
                            onChange={(e) =>
                              patch(draft.id, { description: e.target.value })
                            }
                          />
                        </label>
                        <label htmlFor={`priority-${draft.id}`}>
                          Priority
                          <select
                            id={`priority-${draft.id}`}
                            value={draft.priority}
                            onChange={(e) =>
                              patch(draft.id, {
                                priority: e.target.value as Draft["priority"],
                              })
                            }
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                        </label>
                        {draft.source_excerpt && (
                          <blockquote>
                            <span>From your source</span>
                            {draft.source_excerpt}
                          </blockquote>
                        )}
                        <div className="draft-date-context">
                          <Icon name="clock" width="14" />
                          <p>
                            {draft.date_wording
                              ? `Original wording: “${draft.date_wording}”`
                              : "No deadline was specified."}
                            <strong>
                              {draft.clarification_required ||
                              draft.date_confidence === "ambiguous"
                                ? "Clarification needed. Please choose the intended deadline."
                                : "Confirm the details before saving."}
                            </strong>
                          </p>
                        </div>
                        <div className="draft-date-inputs">
                          <label htmlFor={`date-${draft.id}`}>
                            Due date
                            <input
                              type="date"
                              id={`date-${draft.id}`}
                              value={draft.due_date || ""}
                              disabled={draft.deadlineMode === "none"}
                              onChange={(e) =>
                                patch(draft.id, {
                                  due_date: e.target.value || null,
                                  deadlineMode: "review",
                                })
                              }
                            />
                          </label>
                          <label htmlFor={`time-${draft.id}`}>
                            Due time
                            <input
                              type="time"
                              id={`time-${draft.id}`}
                              value={draft.due_time || ""}
                              disabled={draft.deadlineMode === "none"}
                              onChange={(e) =>
                                patch(draft.id, {
                                  due_time: e.target.value || null,
                                  deadlineMode: "review",
                                })
                              }
                            />
                          </label>
                        </div>
                        <label htmlFor={`zone-${draft.id}`}>
                          Deadline time zone
                          <input
                            id={`zone-${draft.id}`}
                            value={draft.timezone}
                            disabled={draft.deadlineMode === "none"}
                            onChange={(e) =>
                              patch(draft.id, {
                                timezone: e.target.value,
                                deadlineMode: "review",
                              })
                            }
                          />
                        </label>
                        <label className="draft-confirm">
                          <input
                            type="checkbox"
                            checked={draft.deadlineMode === "confirmed"}
                            disabled={
                              !draft.due_date ||
                              !draft.due_time ||
                              draft.deadlineMode === "none"
                            }
                            onChange={(e) =>
                              patch(draft.id, {
                                deadlineMode: e.target.checked
                                  ? "confirmed"
                                  : "review",
                              })
                            }
                          />
                          I confirm this date, time, and time zone.
                        </label>
                        <label className="draft-confirm">
                          <input
                            type="checkbox"
                            checked={draft.deadlineMode === "none"}
                            onChange={(e) =>
                              patch(draft.id, {
                                deadlineMode: e.target.checked
                                  ? "none"
                                  : "review",
                              })
                            }
                          />
                          Save without a deadline.
                        </label>
                      </fieldset>
                      {draft.error && (
                        <p
                          className="form-error"
                          role="alert"
                          id={`draft-error-${draft.id}`}
                        >
                          {draft.error}
                        </p>
                      )}
                      {draft.saved && (
                        <Link className="text-link" href="/dashboard/tasks">
                          View in My Tasks <Icon name="arrow" width="14" />
                        </Link>
                      )}
                    </m.article>
                  ))}
                </AnimatePresence>
              </div>
              {drafts.length > 0 && (
                <div className="capture-approval">
                  <span>
                    Only selected, reviewed suggestions will become tasks.
                  </span>
                  <button
                    className="button primary"
                    disabled={!selected.length || saving}
                    onClick={save}
                  >
                    <Icon
                      name={saving ? "loading" : "check"}
                      className={saving ? "spinner" : ""}
                      width="16"
                    />
                    {saving
                      ? "Saving approved tasks…"
                      : `Save selected tasks (${selected.length})`}
                  </button>
                </div>
              )}
            </m.section>
          ) : (
            <m.aside
              key="capture-guidance"
              className="capture-guidance"
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
            >
              <span className="capture-note-pin" />
              <p>
                A message.
                <br />A screenshot.
                <br />
                One less loose end.
              </p>
              <svg viewBox="0 0 160 70" aria-hidden="true">
                <path d="M5 10 C140 -10 145 60 40 55 M50 44 39 55 53 62" />
              </svg>
              <small>
                AI finds possibilities.
                <br />
                You decide what happens next.
              </small>
            </m.aside>
          )}
        </AnimatePresence>
      </div>
      <div className="capture-feedback" aria-live="polite">
        {error && (
          <div className="form-error" role="alert">
            <p>{error}</p>
            {code === "session" && (
              <Link
                className="text-link"
                href="/login"
                target="_blank"
                rel="noopener noreferrer"
              >
                Sign in in a new tab, then retry
              </Link>
            )}
          </div>
        )}
        {message && (
          <div className="form-success" role="status">
            {message}
            {drafts.some((d) => d.saved) && (
              <Link href="/dashboard" className="text-link">
                Open dashboard <Icon name="arrow" width="14" />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
