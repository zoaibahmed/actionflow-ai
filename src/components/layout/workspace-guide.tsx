"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export function WorkspaceGuide({
  account,
  onAdd,
}: {
  account: string;
  onAdd: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const storageKey = useRef("");
  const dismissed = useRef(false);
  const requested = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true;
    const show = () => {
      requested.current = true;
      setVisible(true);
      requestAnimationFrame(() => {
        heading.current?.focus();
        heading.current?.scrollIntoView({
          block: "nearest",
          behavior: "instant",
        });
      });
    };
    window.addEventListener("actionflow:open-guide", show);
    async function initialize() {
      try {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(account),
        );
        if (!active) return;
        storageKey.current = `actionflow:guide:v1:${Array.from(
          new Uint8Array(digest),
        )
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("")}`;
        if (!dismissed.current && !requested.current)
          setVisible(localStorage.getItem(storageKey.current) !== "dismissed");
      } catch {
        if (active && !dismissed.current && !requested.current)
          setVisible(true);
      }
    }
    void initialize();
    return () => {
      active = false;
      window.removeEventListener("actionflow:open-guide", show);
    };
  }, [account]);
  function dismiss() {
    dismissed.current = true;
    setVisible(false);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Open workspace guide"]')
        ?.focus({ preventScroll: true }),
    );
    try {
      if (storageKey.current)
        localStorage.setItem(storageKey.current, "dismissed");
    } catch {
      /* The guide still closes when browser storage is unavailable. */
    }
  }
  if (!visible) return null;
  return (
    <section
      className="workspace-guide"
      aria-labelledby="workspace-guide-title"
    >
      <div className="workspace-guide-heading">
        <div>
          <span>Your workspace, explained</span>
          <h2 id="workspace-guide-title" tabIndex={-1} ref={heading}>
            A clear next step starts here.
          </h2>
          <p>
            Keep tasks in one place, turn information into actions, and make a
            realistic plan for your day.
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Dismiss workspace guide"
          onClick={dismiss}
        >
          <Icon name="close" width={18} />
        </button>
      </div>
      <div className="workspace-guide-actions">
        <button onClick={onAdd}>
          <Icon name="plus" />
          <span>
            <strong>Add a next step</strong>
            <small>Create a task, choose a priority, add a deadline.</small>
          </span>
          <Icon name="chevron" width={15} />
        </button>
        <Link href="/dashboard/capture">
          <Icon name="capture" />
          <span>
            <strong>Turn information into tasks</strong>
            <small>
              Paste text or upload an image or PDF. Review before saving.
            </small>
          </span>
          <Icon name="chevron" width={15} />
        </Link>
        <Link href="/dashboard/planner">
          <Icon name="spark" />
          <span>
            <strong>Build a plan with Dayflow</strong>
            <small>
              Choose tasks and available hours. Adjust and approve your plan.
            </small>
          </span>
          <Icon name="chevron" width={15} />
        </Link>
      </div>
      <footer>
        <p>
          <Link href="/dashboard/reminders">Reminders</Link> help you follow
          through. <Link href="/dashboard/settings">Settings</Link> controls
          notification preferences. Write in{" "}
          <Link href="/dashboard/notes">Notes</Link>, make space with{" "}
          <Link href="/dashboard/focus">Focus</Link>, and review{" "}
          <Link href="/dashboard/insights">Insights</Link>. Use header Search or
          Ctrl/Cmd+K to find your work.
        </p>
        <button className="text-link" onClick={dismiss}>
          Got it, let’s begin <Icon name="check" width={15} />
        </button>
      </footer>
    </section>
  );
}
