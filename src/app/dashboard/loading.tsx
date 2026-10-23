import { FlowSymbol } from "@/components/ui/brand";
export function WorkspaceLoading() {
  return (
    <div className="loading-frame">
      <aside className="loading-sidebar" aria-hidden="true">
        <span className="brand">
          <FlowSymbol />
          <span className="brand-word">actionflow</span>
        </span>
        {[1, 2, 3, 4].map((value) => (
          <div className="skeleton" key={value} />
        ))}
      </aside>
      <div>
        <div className="loading-frame-header" aria-hidden="true">
          <div className="skeleton" />
        </div>
        <Loading />
      </div>
    </div>
  );
}
export default function Loading() {
  return (
    <div
      className="loading-layout"
      role="status"
      aria-label="Loading your workspace"
    >
      <div className="loading-brand">
        <FlowSymbol />
        <span>A little clarity is on its way.</span>
        <i />
      </div>
      <div className="skeleton skeleton-heading" />
      <div className="command-loading" aria-hidden="true">
        <div>
          <div className="skeleton skeleton-focus" />
          <div className="skeleton-task-panel">
            <div className="skeleton skeleton-field" />
            {[1, 2, 3].map((n) => (
              <div key={n} className="skeleton skeleton-row" />
            ))}
          </div>
        </div>
        <div>
          <div className="skeleton skeleton-momentum" />
          <div className="skeleton skeleton-agenda" />
        </div>
      </div>
      <span className="sr-only">Loading your workspace…</span>
    </div>
  );
}
