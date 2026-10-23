import { FlowSymbol } from "@/components/ui/brand";
export function AccountLoading() {
  return (
    <div
      className="auth-card account-skeleton"
      role="status"
      aria-label="Loading account form"
    >
      <div className="loading-brand">
        <FlowSymbol />
        <span>Opening your space</span>
        <i />
      </div>
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-field" />
      <div className="skeleton skeleton-field" />
      <div className="skeleton skeleton-button" />
      <span className="sr-only">Loading account form…</span>
    </div>
  );
}
