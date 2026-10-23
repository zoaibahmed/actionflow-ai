"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  m,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
  type MotionStyle,
} from "motion/react";
import { Icon } from "@/components/ui/icon";
import { FlowSymbol } from "@/components/ui/brand";

type StoryStyle = MotionStyle &
  Record<
    `--${string}`,
    string | number | MotionValue<string> | MotionValue<number>
  >;

function Thought({
  index,
  progress,
  phoneProgress,
  title,
  detail,
}: {
  index: number;
  progress: MotionValue<number>;
  phoneProgress: MotionValue<number>;
  title: string;
  detail: string;
}) {
  const reduced = useReducedMotion();
  const x = useTransform(
    progress,
    [0, 0.55, 1],
    [[-210, 175, -75][index], [0, 0, 0][index], 0],
  );
  const y = useTransform(
    progress,
    [0, 0.55, 1],
    [[-35, 25, 140][index], index * 74 - 74, index * 74 - 74],
  );
  const rotate = useTransform(progress, [0, 0.65], [[-12, 10, -6][index], 0]);
  const z = useTransform(progress, [0, 1], [90 - index * 35, 0]);
  const phoneX = useTransform(
    phoneProgress,
    [0, 0.7],
    [["-14px", "13px", "-9px"][index], "0px"],
  );
  const phoneY = useTransform(
    phoneProgress,
    [0, 0.7],
    [`${index * 90 - 90}px`, `${index * 74 - 74}px`],
  );
  const phoneRotate = useTransform(
    phoneProgress,
    [0, 0.7],
    [["-4deg", "3deg", "-2deg"][index], "0deg"],
  );
  return (
    <m.div
      className={`atlas-thought thought-${index}`}
      style={
        {
          ...(reduced ? { y: index * 74 - 74 } : { x, y, rotate, z }),
          "--phone-x": reduced ? "0px" : phoneX,
          "--phone-y": reduced ? `${index * 74 - 74}px` : phoneY,
          "--phone-rotate": reduced ? "0deg" : phoneRotate,
        } as StoryStyle
      }
    >
      <span className="atlas-thought-icon">
        <Icon
          name={index === 0 ? "inbox" : index === 1 ? "capture" : "tasks"}
        />
      </span>
      <div>
        <small>{detail}</small>
        <strong>{title}</strong>
      </div>
      <span className="atlas-thought-check">
        <Icon name="check" width={16} />
      </span>
    </m.div>
  );
}

export function ImmersiveOpening() {
  const target = useRef<HTMLElement>(null);
  const orbitBounds = useRef<DOMRect | null>(null);
  useEffect(() => {
    const invalidate = () => {
      orbitBounds.current = null;
    };
    window.addEventListener("resize", invalidate);
    window.addEventListener("scroll", invalidate, { passive: true });
    return () => {
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("scroll", invalidate);
    };
  }, []);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target,
    offset: ["start start", "end end"],
  });
  const { scrollYProgress: phoneProgress } = useScroll({
    target,
    offset: ["start start", "center 10%"],
  });
  const rx = useMotionValue(0),
    ry = useMotionValue(0);
  const tiltX = useSpring(rx, { stiffness: 110, damping: 25 });
  const tiltY = useSpring(ry, { stiffness: 110, damping: 25 });
  const floorRotate = useTransform(scrollYProgress, [0, 1], [16, 0]);
  const floorScale = useTransform(scrollYProgress, [0, 1], [0.92, 1]);
  return (
    <section className="atlas-opening" id="how-it-works" ref={target}>
      <div className="atlas-opening-sticky">
        <div className="atlas-hero-copy">
          <span className="atlas-intro">
            <FlowSymbol /> A little clarity, every day.
          </span>
          <h1>
            <span>Less organizing.</span>
            <span>More living.</span>
          </h1>
          <p>
            Turn everyday information into organized action.
            <br className="atlas-desktop-break" /> Your thoughts, your tasks,
            your day. Finally together.
          </p>
          <div className="atlas-actions">
            <Link className="button primary large" href="/signup">
              Find your flow <Icon name="arrow" width={18} />
            </Link>
            <a href="#features" className="button secondary large">
              Explore the workspace <Icon name="down" width={17} />
            </a>
          </div>
        </div>
        <div
          className="atlas-orbit"
          onPointerMove={(event) => {
            if (reduced || event.pointerType !== "mouse") return;
            // Pointer events can arrive faster than frames. Reuse geometry until
            // scrolling, resizing or leaving the orbit changes its coordinate space.
            const rect = (orbitBounds.current ??=
              event.currentTarget.getBoundingClientRect());
            rx.set(
              ((event.clientY - rect.top - rect.height / 2) / rect.height) * -6,
            );
            ry.set(
              ((event.clientX - rect.left - rect.width / 2) / rect.width) * 8,
            );
          }}
          onPointerLeave={() => {
            orbitBounds.current = null;
            rx.set(0);
            ry.set(0);
          }}
        >
          <m.div
            className="atlas-orbit-tilt"
            style={reduced ? undefined : { rotateX: tiltX, rotateY: tiltY }}
          >
            <m.div
              className="atlas-workspace-floor"
              style={
                reduced
                  ? undefined
                  : { rotateX: floorRotate, scale: floorScale, z: -100 }
              }
            >
              <span>
                <FlowSymbol /> Your next steps
              </span>
              <div className="atlas-floor-rule" />
              <small>A clearer place for everything on your mind.</small>
            </m.div>
            <Thought
              index={0}
              progress={scrollYProgress}
              phoneProgress={phoneProgress}
              title="Send the project proposal"
              detail="From a message · High priority"
            />
            <Thought
              index={1}
              progress={scrollYProgress}
              phoneProgress={phoneProgress}
              title="Book the weekend escape"
              detail="From a screenshot · Personal"
            />
            <Thought
              index={2}
              progress={scrollYProgress}
              phoneProgress={phoneProgress}
              title="Make time for a proper break"
              detail="From a note · Just for you"
            />
          </m.div>
        </div>
        <p className="atlas-scene-caption">
          Illustrated workflow · Capture suggestions and plans always need your
          approval.
        </p>
        <div className="atlas-scroll-hint">
          <Icon name="down" width={15} /> Scroll to bring it together
        </div>
      </div>
    </section>
  );
}

function DayBlock({
  index,
  progress,
  title,
  time,
  kind,
}: {
  index: number;
  progress: MotionValue<number>;
  title: string;
  time: string;
  kind: string;
}) {
  const reduced = useReducedMotion();
  const x = useTransform(progress, [0, 0.7], [index % 2 ? 180 : -180, 0]);
  const y = useTransform(progress, [0, 0.7], [70 - index * 30, 0]);
  const rotate = useTransform(progress, [0, 0.7], [index % 2 ? 7 : -7, 0]);
  const phoneX = useTransform(
    progress,
    [0, 0.7],
    [index % 2 ? "15px" : "-15px", "0px"],
  );
  const phoneY = useTransform(progress, [0, 0.7], ["16px", "0px"]);
  return (
    <m.div
      className={`atlas-day-block block-${index}`}
      style={
        {
          ...(reduced ? {} : { x, y, rotate }),
          "--phone-x": reduced ? "0px" : phoneX,
          "--phone-y": reduced ? "0px" : phoneY,
        } as StoryStyle
      }
    >
      <time>{time}</time>
      <div>
        <small>{kind}</small>
        <strong>{title}</strong>
      </div>
      <Icon name={index === 1 ? "clock" : "check"} width={18} />
    </m.div>
  );
}

export function DayStory() {
  const target = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target,
    offset: ["start 80%", "end 65%"],
  });
  const line = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return (
    <section ref={target} id="features" className="atlas-day-story site-width">
      <div className="atlas-day-intro">
        <span className="atlas-section-note">Dayflow, your daily planner</span>
        <h2>
          Your day.
          <br />
          With room to breathe.
        </h2>
        <p>
          Make a plan around your real tasks, available time, and the breaks you
          need. Review it, adjust it, then make it yours.
        </p>
        <Link href="/dashboard/planner" className="text-link">
          Open Dayflow <Icon name="arrow" width={18} />
        </Link>
        <small>
          Illustrated schedule · Your workspace uses your own tasks.
        </small>
      </div>
      <div className="atlas-day-stage">
        <div className="atlas-day-heading">
          <span>One day, thoughtfully arranged</span>
          <Icon name="today" />
        </div>
        <div className="atlas-timeline-line">
          <m.i style={{ scaleY: reduced ? 1 : line }} />
        </div>
        <DayBlock
          index={0}
          progress={scrollYProgress}
          time="09:00"
          title="Space for your important work"
          kind="Focus time"
        />
        <DayBlock
          index={1}
          progress={scrollYProgress}
          time="10:30"
          title="Step away. Clear your head."
          kind="A proper break"
        />
        <DayBlock
          index={2}
          progress={scrollYProgress}
          time="11:00"
          title="Send the project proposal"
          kind="Your next step"
        />
        <div className="atlas-day-bottom">
          <span className="tiny-dot" /> A plan you approve. Room to change it.
        </div>
      </div>
    </section>
  );
}

export function CaptureStory() {
  const target = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target,
    offset: ["start 65%", "end 75%"],
  });
  const sourceX = useTransform(scrollYProgress, [0, 1], [-65, 0]);
  const sourceRotate = useTransform(scrollYProgress, [0, 1], [-7, 0]);
  const taskX = useTransform(scrollYProgress, [0, 1], [65, 0]);
  const taskRotate = useTransform(scrollYProgress, [0, 1], [7, 0]);
  const phoneSourceY = useTransform(scrollYProgress, [0, 1], ["12px", "-8px"]);
  const phoneTaskY = useTransform(scrollYProgress, [0, 1], ["24px", "0px"]);
  const highlight = useTransform(
    scrollYProgress,
    [0, 0.55, 1],
    ["#f4f0e9", "#e0e7ff", "#e0e7ff"],
  );
  const line = useTransform(scrollYProgress, [0, 1], [0.05, 1]);
  const stampScale = useTransform(
    scrollYProgress,
    [0, 0.6, 1],
    [0.82, 0.82, 1],
  );
  return (
    <section className="atlas-capture-story" ref={target}>
      <div className="site-width">
        <div className="atlas-centered-heading">
          <span className="atlas-section-note">Smart Capture</span>
          <h2>
            A message becomes
            <br />a meaningful next step.
          </h2>
          <p>
            Paste text, add a screenshot, or upload a PDF.
            <br />
            AI finds the actions. You decide what gets saved.
          </p>
        </div>
        <div
          className="atlas-capture-scene"
          aria-label="Illustrated Smart Capture workflow, from a message to an editable task and user approval"
        >
          <m.div
            className="atlas-source-paper"
            style={
              {
                ...(reduced ? {} : { x: sourceX, rotate: sourceRotate }),
                "--phone-source-y": reduced ? "0px" : phoneSourceY,
              } as StoryStyle
            }
          >
            <span>
              <Icon name="inbox" width={17} /> A message worth keeping
            </span>
            <p>
              Could you send the{" "}
              <m.mark
                style={{ backgroundColor: reduced ? "#e0e7ff" : highlight }}
              >
                project proposal by Friday
              </m.mark>
              ? Include the updated timeline and budget.
            </p>
            <small>Your original context, in one place.</small>
          </m.div>
          <div className="atlas-capture-connection">
            <m.i
              style={
                {
                  scaleX: reduced ? 1 : line,
                  "--phone-progress": reduced ? 1 : line,
                } as StoryStyle
              }
            />
            <span>
              <FlowSymbol />
            </span>
          </div>
          <m.div
            className="atlas-extracted-task"
            style={
              {
                ...(reduced ? {} : { x: taskX, rotate: taskRotate }),
                "--phone-task-y": reduced ? "0px" : phoneTaskY,
              } as StoryStyle
            }
          >
            <span>
              <Icon name="spark" width={17} /> Suggested action
            </span>
            <h3>Send the project proposal</h3>
            <p>Include the updated timeline and budget.</p>
            <div>
              <span>Friday · confirm date</span>
              <span>Priority · editable</span>
            </div>
            <m.footer style={reduced ? undefined : { scale: stampScale }}>
              <Icon name="check" width={17} /> Review. Edit. Approve.
            </m.footer>
          </m.div>
        </div>
        <ol className="atlas-capture-steps" aria-label="Smart Capture steps">
          <li>Add your content</li>
          <li>AI suggests actions</li>
          <li>Review and edit</li>
          <li>Approve and save to tasks</li>
        </ol>
        <div className="atlas-capture-outro">
          <p>
            Nothing is saved until you say so.
            <small>
              Illustration of the real workflow. No live analysis is running
              here.
            </small>
          </p>
          <Link className="button primary" href="/dashboard/capture">
            Try Smart Capture <Icon name="arrow" width={17} />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function MobileReminderStory() {
  const target = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target,
    offset: ["start 90%", "end 65%"],
  });
  const x = useTransform(scrollYProgress, [0, 1], [-18, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [22, 0]);
  const line = useTransform(scrollYProgress, [0, 1], [0.1, 1]);
  return (
    <section className="phone-reminder-story site-width" ref={target}>
      <div className="phone-reminder-thread">
        <m.i style={{ scaleY: reduced ? 1 : line }} />
      </div>
      <span className="atlas-section-note">A little follow-through</span>
      <h2>
        A good plan.
        <br />A timely nudge.
      </h2>
      <p>
        Choose when you want a reminder. Find it in your notification stream,
        ready when you return.
      </p>
      <m.div
        className="phone-reminder-scene"
        style={reduced ? undefined : { x, y }}
      >
        <span className="phone-reminder-bell">
          <Icon name="bell" width={22} />
        </span>
        <div>
          <small>ActionFlow · Reminder illustration</small>
          <strong>Send the project proposal</strong>
          <span>Your next step, back in view.</span>
        </div>
        <Icon name="check" width={17} />
      </m.div>
      <Link className="text-link" href="/dashboard/reminders">
        Choose your reminders <Icon name="arrow" width={16} />
      </Link>
      <small className="phone-reminder-disclosure">
        Email and browser push need delivery setup and permission.
      </small>
    </section>
  );
}
