import Link from "next/link";
export function FlowSymbol({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M7 22 16 6l4.4 7.8M11.2 22H25l-4.6-8.2H15"
          stroke="currentColor"
          strokeWidth="3.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="actionflowai home">
      <FlowSymbol />
      <span className="brand-word">
        actionflow<span className="brand-ai">ai</span>
      </span>
    </Link>
  );
}
