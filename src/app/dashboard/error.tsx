"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="coming-soon">
      <span className="badge">Connection interrupted</span>
      <h1>Your workspace is taking a moment.</h1>
      <p>
        We couldn’t load your tasks. Check your connection and try again. No
        placeholder data has been substituted.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
