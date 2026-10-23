"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { m, AnimatePresence } from "motion/react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { SessionGuard } from "@/components/auth/session-guard";
import { NotificationBell } from "@/components/reminders/notification-bell";
import { Brand } from "@/components/ui/brand";
import { Icon, type IconName } from "@/components/ui/icon";
import { WorkspaceSearch } from "@/components/workspace/search";
import { WorkspaceGuide } from "./workspace-guide";
const TaskEditor = dynamic(
  () =>
    import("@/components/tasks/task-editor").then(
      (module) => module.TaskEditor,
    ),
  {
    loading: () => (
      <span className="mobile-save-notice" role="status">
        Opening task form…
      </span>
    ),
  },
);
const navigation: {
  label: string;
  href: string;
  icon: IconName;
  soon?: boolean;
}[] = [
  { label: "Today", href: "/dashboard", icon: "today" },
  { label: "AI Assistant", href: "/dashboard/assistant", icon: "spark" },
  { label: "My Tasks", href: "/dashboard/tasks", icon: "tasks" },
  { label: "Notes", href: "/dashboard/notes", icon: "notes" },
  { label: "Focus", href: "/dashboard/focus", icon: "focus" },
  { label: "Insights", href: "/dashboard/insights", icon: "insights" },
  { label: "Reminders", href: "/dashboard/reminders", icon: "bell" },
  {
    label: "Smart Capture",
    href: "/dashboard/capture",
    icon: "capture",
  },
  {
    label: "Dayflow Planner",
    href: "/dashboard/planner",
    icon: "spark",
  },
];
function AccountMenu({
  user,
  initials,
}: {
  user: { name: string; email: string };
  initials: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="user-menu" ref={ref}>
      <button
        ref={button}
        className="profile-trigger"
        aria-label={`${initials} ${user.name} account menu`}
        aria-expanded={open}
        aria-controls="account-popover"
        onClick={() => setOpen(!open)}
      >
        <span className="avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="profile-trigger-name">{user.name}</span>
        <Icon name="down" width="13" />
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            id="account-popover"
            className="menu-popover"
            initial={{ opacity: 0, y: -5, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <span className="menu-label">Your personal space</span>
            <strong>{user.name}</strong>
            <p>{user.email}</p>
            <Link href="/dashboard/settings" onClick={() => setOpen(false)}>
              <Icon name="settings" width="16" />
              Workspace settings
            </Link>
            <Link href="/" onClick={() => setOpen(false)}>
              <Icon name="arrow" width="16" />
              Back to home
            </Link>
            <SignOutButton />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; email: string };
}) {
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const pathname = usePathname();
  const router = useRouter();
  const [quickAdd, setQuickAdd] = useState(false);
  const [quickSaved, setQuickSaved] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  useEffect(() => {
    const expired = () => setSessionExpired(true),
      restored = () => setSessionExpired(false);
    window.addEventListener("actionflow:session-expired", expired);
    window.addEventListener("actionflow:session-restored", restored);
    return () => {
      window.removeEventListener("actionflow:session-expired", expired);
      window.removeEventListener("actionflow:session-restored", restored);
    };
  }, []);
  const drawer = useRef<HTMLDialogElement>(null);
  const title =
    navigation.find((item) => item.href === pathname)?.label ??
    (pathname.startsWith("/dashboard/tasks/")
      ? "Task details"
      : pathname === "/dashboard/notifications"
        ? "Notifications"
        : "Settings");
  useEffect(() => {
    const media = window.matchMedia("(min-width: 769px)");
    const close = () => {
      if (media.matches) drawer.current?.close();
    };
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, []);
  function nav(location: string) {
    return (
      <>
        <div className="sidebar-brand">
          <Brand />
          <span className="workspace-plan">Personal</span>
        </div>
        <div className="workspace-label">Your workspace</div>
        <nav
          aria-label={`${location === "desktop" ? "Main" : "Mobile"} navigation`}
        >
          {navigation.map((item) => (
            <div key={item.href}>
              <Link
                href={item.href}
                title={collapsed ? item.label : undefined}
                aria-label={item.label}
                aria-current={pathname === item.href ? "page" : undefined}
                onClick={() => drawer.current?.close()}
                className={`nav-item ${pathname === item.href ? "active" : ""}`}
              >
                {pathname === item.href && (
                  <m.span
                    className="nav-active-background"
                    layoutId={`active-navigation-${location}`}
                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                  />
                )}
                <Icon name={item.icon} />
                <span className="nav-label">{item.label}</span>
                {item.soon && <span className="nav-soon">Soon</span>}
              </Link>
            </div>
          ))}
          {location === "mobile" && (
            <Link
              href="/dashboard/notifications"
              className="nav-item"
              onClick={() => drawer.current?.close()}
              aria-current={
                pathname === "/dashboard/notifications" ? "page" : undefined
              }
            >
              <Icon name="inbox" />
              <span className="nav-label">Notifications</span>
            </Link>
          )}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="nav-item workspace-guide-trigger"
            title={collapsed ? "Workspace guide" : undefined}
            onClick={() => {
              drawer.current?.close();
              window.dispatchEvent(new Event("actionflow:open-guide"));
            }}
          >
            <Icon name="help" />
            <span className="nav-label">Workspace guide</span>
          </button>
          <div className="sidebar-reflection">
            <Icon name="spark" width="18" />
            <p>
              A little less in your head.
              <br />
              <strong>A little more in your day.</strong>
            </p>
          </div>
          <Link
            href="/dashboard/settings"
            onClick={() => drawer.current?.close()}
            aria-label="Settings"
            aria-current={
              pathname === "/dashboard/settings" ? "page" : undefined
            }
            className={`nav-item ${pathname === "/dashboard/settings" ? "active" : ""}`}
          >
            <Icon name="settings" />
            <span className="nav-label">Settings</span>
          </Link>
          <div className="sidebar-user">
            <span className="avatar">{initials}</span>
            <div>
              <strong>{user.name}</strong>
              <small>Personal workspace</small>
            </div>
            <Icon name="complete" width="14" />
          </div>
        </div>
      </>
    );
  }
  return (
    <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>
      <SessionGuard
        preserveDrafts={
          pathname === "/dashboard/notes" ||
          pathname === "/dashboard/focus" ||
          pathname === "/dashboard/assistant" ||
          pathname === "/dashboard/capture" ||
          pathname === "/dashboard/planner" ||
          pathname === "/dashboard/reminders" ||
          pathname === "/dashboard/notifications" ||
          pathname === "/dashboard/settings"
        }
      />
      <aside className="sidebar">
        {nav("desktop")}
        <button
          className="collapse-button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          <Icon name="panel" />
          <span>{collapsed ? "Expand" : "Collapse sidebar"}</span>
        </button>
      </aside>
      <dialog
        className="mobile-drawer"
        aria-label="Workspace navigation"
        ref={drawer}
        onClick={(e) => {
          if (e.target === e.currentTarget) drawer.current?.close();
        }}
      >
        <div className="drawer-content">
          <button
            className="icon-button drawer-close"
            aria-label="Close navigation"
            onClick={() => drawer.current?.close()}
          >
            <Icon name="close" />
          </button>
          {nav("mobile")}
        </div>
      </dialog>
      <div className="app-main">
        <header className="app-header">
          <div className="header-title">
            <button
              className="icon-button mobile-toggle"
              aria-label="Open navigation"
              onClick={() => drawer.current?.showModal()}
            >
              <Icon name="menu" />
            </button>
            <span className="breadcrumb-home">Personal workspace</span>
            <Icon name="chevron" width="12" />
            <strong>{title}</strong>
          </div>
          <div className="header-controls">
            <button
              className="icon-button"
              aria-label="Open workspace guide"
              title="How your workspace works"
              onClick={() =>
                window.dispatchEvent(new Event("actionflow:open-guide"))
              }
            >
              <Icon name="help" width={18} />
            </button>
            <WorkspaceSearch />
            <Link
              className="agent-header-entry"
              href="/dashboard/assistant"
              aria-label="Open AI Assistant"
            >
              <Icon name="spark" width={16} />
              <span>Ask ActionFlow</span>
            </Link>
            <NotificationBell />
            <span className="header-divider" />
            <AccountMenu user={user} initials={initials} />
          </div>
        </header>
        <m.main
          id="main-content"
          className="dashboard-main"
          key={pathname}
          initial={{ y: 7 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
        >
          {sessionExpired && (
            <p className="form-error workspace-session-warning" role="alert">
              Your session expired.{" "}
              <Link href="/login" target="_blank">
                Sign in in a new tab
              </Link>{" "}
              to continue; your current edits remain here.
            </p>
          )}
          <WorkspaceGuide
            key={user.email}
            account={user.email}
            onAdd={() => {
              setQuickSaved(false);
              setQuickAdd(true);
            }}
          />
          {children}
        </m.main>
        <footer className="app-footer">
          <span>
            <span className="tiny-dot" />A little clarity, every day.
          </span>
          <span>Your space. Your pace.</span>
        </footer>
      </div>
      <nav
        className="mobile-workspace-dock"
        aria-label="Quick workspace navigation"
      >
        <Link
          href="/dashboard"
          aria-current={pathname === "/dashboard" ? "page" : undefined}
        >
          <Icon name="today" />
          <span>Today</span>
        </Link>
        <Link
          href="/dashboard/tasks"
          aria-current={
            pathname.startsWith("/dashboard/tasks") ? "page" : undefined
          }
        >
          <Icon name="tasks" />
          <span>Tasks</span>
        </Link>
        <button
          className="mobile-dock-add"
          aria-label="Quick add task"
          onClick={() => {
            setQuickSaved(false);
            setQuickAdd(true);
          }}
        >
          <Icon name="plus" width={25} />
          <span>Add</span>
        </button>
        <Link
          href="/dashboard/planner"
          aria-current={pathname === "/dashboard/planner" ? "page" : undefined}
        >
          <Icon name="spark" />
          <span>Planner</span>
        </Link>
        <button
          aria-label="More workspace navigation"
          aria-haspopup="dialog"
          onClick={() => drawer.current?.showModal()}
        >
          <Icon name="more" />
          <span>More</span>
        </button>
      </nav>
      <AnimatePresence>
        {quickAdd && (
          <TaskEditor
            key="global-task-editor"
            task={null}
            onClose={() => setQuickAdd(false)}
            onSaved={() => {
              setQuickAdd(false);
              setQuickSaved(true);
              router.refresh();
            }}
            onUnauthorized={() => {
              router.replace("/login?notice=session");
              router.refresh();
            }}
          />
        )}
      </AnimatePresence>
      {quickSaved && (
        <div className="mobile-save-notice" role="status">
          <Icon name="check" width={16} />
          <Link href="/dashboard/tasks" onClick={() => setQuickSaved(false)}>
            Task saved. View your tasks
          </Link>
          <button
            className="icon-button"
            aria-label="Dismiss quick-add confirmation"
            onClick={() => setQuickSaved(false)}
          >
            <Icon name="close" width={16} />
          </button>
        </div>
      )}
    </div>
  );
}
