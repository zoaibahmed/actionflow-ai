"use client";

import Link from "next/link";
import { Brand } from "@/components/ui/brand";

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <div className="auth-layout">
      <header className="auth-header">
        <Brand />
      </header>
      <main id="main-content" className="auth-main">
        <section className="auth-card" role="alert">
          <span className="badge">Connection interrupted</span>
          <h1>Your workspace is taking a moment.</h1>
          <p className="auth-description">
            We couldn’t reach your workspace. Please check your connection and
            try again.
          </p>
          <button className="button primary" onClick={reset}>
            Try again
          </button>
          <div className="auth-switch">
            <Link href="/">Back to home</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
