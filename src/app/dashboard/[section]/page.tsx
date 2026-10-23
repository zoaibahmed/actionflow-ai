import { Suspense } from "react";
import Loading from "../loading";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
const sections: Record<
  string,
  { title: string; icon: IconName; description: string }
> = {
  settings: {
    title: "Make your workspace your own",
    icon: "settings",
    description:
      "Workspace preferences are coming soon. Your account and tasks are securely stored. Use the account menu to sign out.",
  },
};
export function generateStaticParams() {
  return Object.keys(sections).map((section) => ({ section }));
}
async function PreviewContent({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const content = sections[section];
  if (!content) notFound();
  return (
    <section className="coming-soon">
      <span className="feature-icon">
        <Icon name={content.icon} />
      </span>
      <span className="badge">Coming soon</span>
      <h1>{content.title}</h1>
      <p>{content.description}</p>
      <Link href="/dashboard" className="button primary">
        Back to Today
        <Icon name="arrow" />
      </Link>
    </section>
  );
}

export default function Preview({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  return (
    <Suspense fallback={<Loading />}>
      <PreviewContent params={params} />
    </Suspense>
  );
}
