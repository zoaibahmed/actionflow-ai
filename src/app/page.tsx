import Link from "next/link";
import { Brand, FlowSymbol } from "@/components/ui/brand";
import { Icon } from "@/components/ui/icon";
import { PublicNavbar } from "@/components/marketing/public-navbar";
import { PublicAccountLinks } from "@/components/marketing/account-links";
import {
  ImmersiveOpening,
  DayStory,
  CaptureStory,
  MobileReminderStory,
} from "@/components/marketing/immersive-story";

export default function Home() {
  return (
    <div className="marketing-page atlas-public">
      <PublicNavbar accountLinks={<PublicAccountLinks />} />
      <main id="main-content">
        <ImmersiveOpening />
        <section className="atlas-manifesto site-width">
          <p>
            Life arrives in pieces.
            <br />A message. A deadline. A passing thought.
          </p>
          <h2>
            Give it all
            <br />a little direction.
          </h2>
          <span>
            One connected workspace, from the first thought to the final check.
          </span>
        </section>
        <DayStory />
        <CaptureStory />
        <MobileReminderStory />
        <section className="atlas-toolbox site-width" id="our-approach">
          <div className="atlas-toolbox-title">
            <span className="atlas-section-note">
              The details that keep you moving
            </span>
            <h2>
              Less to keep in your head.
              <br />
              More space for your life.
            </h2>
            <p>Practical tools that work together, with you in control.</p>
          </div>
          <div className="atlas-tools">
            <Link href="/dashboard/tasks">
              <Icon name="tasks" />
              <h3>Your tasks, in focus.</h3>
              <p>
                Priorities, deadlines, and a clear next step. Saved privately in
                your workspace.
              </p>
              <span>
                Open your tasks <Icon name="arrow" width={17} />
              </span>
            </Link>
            <Link href="/dashboard/reminders">
              <Icon name="bell" />
              <h3>A nudge you choose.</h3>
              <p>
                Set reminders and recurring tasks. In-app notifications keep the
                follow-through in sight.
              </p>
              <span>
                Meet Reminder Stream <Icon name="arrow" width={17} />
              </span>
            </Link>
            <Link href="/dashboard/notifications">
              <Icon name="inbox" />
              <h3>Stay in the loop.</h3>
              <p>
                Read, snooze, or revisit reminders. Email and browser push
                require delivery setup and permission.
              </p>
              <span>
                View your notifications <Icon name="arrow" width={17} />
              </span>
            </Link>
          </div>
        </section>
        <section className="atlas-closing">
          <FlowSymbol />
          <h2>
            A clearer day.
            <br />A little more you.
          </h2>
          <p>Start with one thought. Find your next step.</p>
          <Link href="/signup" className="button primary large">
            Make space for what matters <Icon name="arrow" width={18} />
          </Link>
          <Link href="/login" className="text-link">
            Already have a workspace? Log in
          </Link>
        </section>
      </main>
      <footer className="premium-footer site-width">
        <div>
          <Brand />
          <p>A little clarity, every day.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="#features">Explore the product</a>
          <Link href="/login">Log in</Link>
          <Link href="/signup">Get started</Link>
        </nav>
        <div className="footer-note">
          <span>Thoughtfully made for everyday progress.</span>
          <small>
            AI suggestions and daily plans always need your approval.
          </small>
        </div>
      </footer>
    </div>
  );
}
