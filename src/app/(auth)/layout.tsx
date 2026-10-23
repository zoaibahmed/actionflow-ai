import Link from "next/link";
import { Brand } from "@/components/ui/brand";
import { Icon } from "@/components/ui/icon";
import { AuthAside } from "@/components/auth/auth-aside";
export const metadata = { referrer: "no-referrer" as const };
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-layout">
      <div className="auth-form-side">
        <header className="auth-header">
          <Brand />
          <Link className="text-link" href="/">
            <Icon name="right" width="14" className="back-arrow" />
            Back to home
          </Link>
        </header>
        <main id="main-content" className="auth-main">
          {children}
        </main>
        <footer className="auth-footer">
          <span className="tiny-dot" />
          Your personal space for everyday progress.
        </footer>
      </div>
      <AuthAside />
    </div>
  );
}
