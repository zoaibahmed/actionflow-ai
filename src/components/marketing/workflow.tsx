"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  m,
  useScroll,
  useTransform,
  useMotionValueEvent,
  useMotionValue,
  useSpring,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import { Icon } from "@/components/ui/icon";
import { FlowSymbol } from "@/components/ui/brand";
const stages = [
  {
    label: "Capture",
    title: "A thought finds a home.",
    text: "A message, a screenshot, a note to yourself. Keep the context without carrying it all in your head.",
  },
  {
    label: "Understand",
    title: "The next step comes into focus.",
    text: "A preview of turning the important details into a title, a due time, and a priority. You stay in control.",
  },
  {
    label: "Organize",
    title: "Everything falls into place.",
    text: "The task joins a calmer view of the day. A little structure, with room left for being human.",
  },
];
function SignatureScene({ progress }: { progress: MotionValue<number> }) {
  const mx = useTransform(
    progress,
    [0, 0.38, 0.65, 1],
    [-88, -115, -145, -170],
  );
  const my = useTransform(progress, [0, 0.4, 1], [-65, -85, -115]);
  const mr = useTransform(progress, [0, 0.5, 1], [-12, -5, 0]);
  const sourceOpacity = useTransform(
    progress,
    [0, 0.46, 0.72, 1],
    [1, 1, 0.12, 0],
  );
  const sx = useTransform(progress, [0, 0.42, 1], [115, 120, 155]);
  const sy = useTransform(progress, [0, 0.45, 1], [-30, -65, -90]);
  const sr = useTransform(progress, [0, 0.6, 1], [11, 4, 0]);
  const nx = useTransform(progress, [0, 0.4, 1], [-100, -155, -180]);
  const ny = useTransform(progress, [0, 0.4, 1], [142, 118, 95]);
  const taskOpacity = useTransform(progress, [0, 0.22, 0.4, 1], [0, 0, 1, 1]);
  const tx = useTransform(progress, [0, 0.4, 0.62, 1], [35, 0, 0, -8]);
  const ty = useTransform(progress, [0, 0.4, 0.62, 1], [95, 0, 0, 47]);
  const tr = useTransform(progress, [0, 0.4, 0.62, 1], [8, -3, -3, 0]);
  const scale = useTransform(progress, [0, 0.4, 0.62, 1], [0.78, 1, 1, 0.81]);
  const depth = useTransform(progress, [0, 0.4, 0.65, 1], [0, 90, 90, 0]);
  const tilt = useTransform(progress, [0, 0.5, 1], [12, 7, 0]);
  const plannerOpacity = useTransform(
    progress,
    [0, 0.55, 0.82, 1],
    [0, 0, 1, 1],
  );
  const plannerY = useTransform(progress, [0, 0.55, 1], [80, 80, 0]);
  const plannerScale = useTransform(progress, [0, 0.55, 1], [0.88, 0.88, 1]);
  const plannerRotate = useTransform(progress, [0, 0.6, 1], [-8, -8, 0]);
  const highlight = useTransform(
    progress,
    [0, 0.25, 0.45, 0.7],
    ["#f7f8f3", "#f7f8f3", "#dce4bf", "#dce4bf"],
  );
  const fieldsOpacity = useTransform(
    progress,
    [0, 0.36, 0.5, 0.72, 1],
    [0, 0, 1, 1, 0],
  );
  const line = useTransform(progress, [0, 1], [0, 1]);
  return (
    <div
      className="signature-scene"
      role="img"
      aria-label="Concept preview: a message, screenshot and handwritten note become a task with a title, due date and priority, then align inside a daily planner. Smart Capture suggestions require your review; AI plans require your explicit approval."
    >
      <div className="signature-grid" aria-hidden="true" />
      <m.div className="signature-stage" style={{ rotateX: tilt }}>
        <m.div
          className="signature-planner"
          style={{
            opacity: plannerOpacity,
            y: plannerY,
            scale: plannerScale,
            rotateY: plannerRotate,
          }}
        >
          <div className="signature-planner-head">
            <FlowSymbol />
            <span>
              Friday, in flow<small>A little room for everything.</small>
            </span>
            <Icon name="more" width="16" />
          </div>
          <div className="signature-week">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i} className={i === 4 ? "current" : ""}>
                {d}
                <small>{12 + i}</small>
              </span>
            ))}
          </div>
          <div className="signature-slot">
            <time>10:00</time>
            <span>Space for focused work</span>
          </div>
          <div className="signature-slot destination">
            <time>14:00</time>
            <span />
          </div>
          <div className="signature-slot last">
            <time>16:00</time>
            <span>A little time for yourself</span>
          </div>
          <div className="signature-planner-foot">
            <Icon name="check" width="12" />A clearer day. One next step at a
            time.
          </div>
        </m.div>
        <m.div
          className="signature-paper source-message"
          style={{ x: mx, y: my, rotateZ: mr, opacity: sourceOpacity }}
        >
          <div className="source-message-head">
            <span>J</span>
            <strong>
              Jamie<small>Project message</small>
            </strong>
            <Icon name="more" width="14" />
          </div>
          <p>
            Could you send the{" "}
            <m.mark style={{ backgroundColor: highlight }}>
              final designs
            </m.mark>{" "}
            by{" "}
            <m.mark style={{ backgroundColor: highlight }}>
              Friday, 2 pm?
            </m.mark>
          </p>
          <small>One detail you don’t want to lose.</small>
        </m.div>
        <m.div
          className="signature-paper source-screenshot"
          style={{ x: sx, y: sy, rotateZ: sr, opacity: sourceOpacity }}
        >
          <div className="screenshot-toolbar">
            <i />
            <i />
            <i />
            <span>project-notes.png</span>
          </div>
          <div className="screenshot-art">
            <div />
            <div />
            <div />
          </div>
          <strong>Final design review</strong>
          <span>Friday · Project notes</span>
        </m.div>
        <m.div
          className="signature-paper source-note"
          style={{ x: nx, y: ny, rotateZ: -7, opacity: sourceOpacity }}
        >
          <span>A note to self</span>
          <p>
            Send the final
            <br />
            designs to Jamie.
          </p>
          <div>Friday, before 2 ♡</div>
        </m.div>
        <m.div
          className="signature-task flow-paper"
          style={{
            x: tx,
            y: ty,
            rotateZ: tr,
            scale,
            z: depth,
            opacity: taskOpacity,
          }}
        >
          <div className="signature-task-top">
            <span>
              <Icon name="spark" width="14" />
              One clear next step
            </span>
            <small>Concept</small>
          </div>
          <h3>Send final designs</h3>
          <p>Put the finishing touches on the project.</p>
          <div className="signature-task-tags">
            <span>
              <i />
              High priority
            </span>
            <span>
              <Icon name="clock" width="12" />
              Friday, 2 pm
            </span>
          </div>
          <div className="signature-task-foot">
            <span className="paper-check">
              <Icon name="check" width="12" />
            </span>
            Ready for your day.
          </div>
        </m.div>
        <m.div className="extracted-fields" style={{ opacity: fieldsOpacity }}>
          <span>
            <Icon name="check" width="12" />
            Title found
          </span>
          <span>
            <Icon name="today" width="12" />
            Due time found
          </span>
          <span>
            <Icon name="tasks" width="12" />
            Priority suggested
          </span>
        </m.div>
      </m.div>
      <div className="signature-progress" aria-hidden="true">
        <m.span style={{ scaleX: line }} />
      </div>
      <p className="signature-caption">
        <span className="tiny-dot" />
        Illustrated workflow · Review and approve every plan
      </p>
    </div>
  );
}
export function HeroExperience() {
  const [complete, setComplete] = useState(false);
  const [tab, setTab] = useState("today");
  return (
    <div className="hero-experience signature-hero">
      <m.div
        className="hero-app-preview"
        initial={{ y: 24, rotateY: -5, rotateX: 4 }}
        animate={{ y: 0, rotateY: -3, rotateX: 2 }}
        transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="preview-top">
          <FlowSymbol />
          <strong>Your personal workspace</strong>
          <span className="preview-avatar">You</span>
        </div>
        <div className="preview-body">
          <div className="preview-sidebar" aria-hidden="true">
            <Icon name="today" />
            <Icon name="tasks" />
            <Icon name="capture" />
            <Icon name="spark" />
          </div>
          <div className="preview-main">
            <div className="preview-greeting">
              <span>A little clarity, every day.</span>
              <h2>Make space for what matters.</h2>
            </div>
            <div className="preview-view-tabs">
              <button
                aria-pressed={tab === "today"}
                onClick={() => setTab("today")}
              >
                Today
              </button>
              <button
                aria-pressed={tab === "upcoming"}
                onClick={() => setTab("upcoming")}
              >
                Up next
              </button>
              <span>Interactive example</span>
            </div>
            {tab === "today" ? (
              <div
                className={`preview-focus ${complete ? "preview-done" : ""}`}
              >
                <span>
                  Your focus today <Icon name="today" width="14" />
                </span>
                <h3>Send the final designs.</h3>
                <p>A clear next step for a calmer day.</p>
                <div>
                  <span className="priority high">High priority</span>
                  <span>
                    <Icon name="clock" width="12" />
                    14:00
                  </span>
                </div>
                <button
                  aria-pressed={complete}
                  className="preview-check"
                  onClick={() => setComplete(!complete)}
                >
                  <span>
                    <Icon name={complete ? "check" : "plus"} width="14" />
                  </span>
                  {complete
                    ? "Complete. A little more headspace."
                    : "Mark this example complete"}
                </button>
              </div>
            ) : (
              <div className="preview-focus preview-upcoming">
                <span>
                  A little further ahead <Icon name="today" width="14" />
                </span>
                <h3>Room for the plans in between.</h3>
                <p>Give the small things a place, too.</p>
                <div className="preview-next">
                  <span>Sat</span>
                  <strong>Book a table for dinner</strong>
                  <Icon name="chevron" width="13" />
                </div>
              </div>
            )}
            <div className="preview-bottom">
              <div>
                <span className="preview-progress-track">
                  <m.i
                    initial={false}
                    animate={{ scaleX: complete ? 1 : 0.5 }}
                  />
                </span>
                <span>{complete ? "2 of 2" : "1 of 2"} examples complete</span>
              </div>
              <span>One step at a time.</span>
            </div>
          </div>
        </div>
      </m.div>
      <div className="hero-floating-note">
        <Icon name="check" width="14" />
        <span>
          A little less on your mind.
          <small>Your tasks. Saved in your workspace.</small>
        </span>
      </div>
      <p className="hero-preview-caption">
        Explore the example above. Your own workspace starts fresh.
      </p>
    </div>
  );
}
export function WorkflowStory() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 75%", "end 85%"],
  });
  const [stage, setStage] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const next = value < 0.32 ? 0 : value < 0.68 ? 1 : 2;
    setStage((old) => (old === next ? old : next));
  });
  return (
    <section id="how-it-works" className="signature-story site-width" ref={ref}>
      <div className="signature-story-heading">
        <div>
          <span className="eyebrow">
            From a scattered thought to an organized day
          </span>
          <h2>
            A little context.
            <br />A clear next step.
          </h2>
        </div>
        <p>
          An illustrated workflow. Smart Capture and Dayflow Planner are
          available today, with your review and approval.
        </p>
      </div>
      <div className="signature-story-layout">
        <div className="signature-steps">
          {stages.map((item, index) => (
            <article
              key={item.label}
              className={`story-step ${stage === index ? "is-current" : ""}`}
            >
              <span className="step-index">0{index + 1}</span>
              <div>
                <span className="signature-step-label">{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <span className="step-status">
                  {index === 1
                    ? "Illustrated extraction · future feature"
                    : index === 2
                      ? "Planning concept · future feature"
                      : "Capture concept · future feature"}
                </span>
              </div>
            </article>
          ))}
        </div>
        <div className="signature-sticky story-visual">
          <SignatureScene progress={scrollYProgress} />
          <div className="signature-stage-label">
            <span>0{stage + 1} / 03</span>
            <strong>{stages[stage].label}</strong>
            <span>
              Scroll to explore <Icon name="scroll" width="13" />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LivingOpening() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end 75%"],
  });
  const [stage, setStage] = useState(0);
  const stageRef = useRef(0);
  const pointerX = useMotionValue(0),
    pointerY = useMotionValue(0);
  const rotateX = useSpring(pointerX, { stiffness: 160, damping: 25 }),
    rotateY = useSpring(pointerY, { stiffness: 160, damping: 25 });
  const reduced = useReducedMotion();
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const next = value < 0.32 ? 0 : value < 0.68 ? 1 : 2;
    if (stageRef.current !== next) {
      stageRef.current = next;
      setStage(next);
    }
  });
  return (
    <section
      ref={ref}
      className="living-opening site-width"
      aria-label="From scattered context to a clearer day"
    >
      <div className="premium-hero">
        <div className="hero-copy">
          <span className="hero-label">
            <span className="tiny-dot" />A little order. A lot more life.
          </span>
          <h1 aria-label="Less organizing. More living.">
            <span className="kinetic-line">
              <span>Less organizing.</span>
            </span>
            <span className="kinetic-line">
              <span>More living.</span>
            </span>
          </h1>
          <p>
            Turn messages, screenshots, and PDFs into tasks you review before
            saving. A clearer day starts here.
          </p>
          <div className="hero-actions">
            <MagneticCTA />
            <a href="#how-it-works" className="button text-button">
              Follow the thought
              <Icon name="scroll" width="15" />
            </a>
          </div>
          <div className="hero-assurance">
            <FlowSymbol />
            <span>
              Your context. Your next step.
              <br />
              <strong>You always have the final say.</strong>
            </span>
          </div>
        </div>
      </div>
      <div
        className="living-visual"
        onPointerMove={(e) => {
          if (reduced || e.pointerType !== "mouse") return;
          const box = e.currentTarget.getBoundingClientRect();
          pointerX.set(((e.clientY - box.top) / box.height - 0.5) * -4);
          pointerY.set(((e.clientX - box.left) / box.width - 0.5) * 4);
        }}
        onPointerLeave={() => {
          pointerX.set(0);
          pointerY.set(0);
        }}
      >
        <m.div className="living-tilt" style={{ rotateX, rotateY }}>
          <SignatureScene progress={scrollYProgress} />
        </m.div>
        <div className="living-scene-caption">
          <span>0{stage + 1} / 03</span>
          <strong>{stages[stage].label}</strong>
          <span>
            Scroll to follow the thought <Icon name="scroll" width="13" />
          </span>
        </div>
      </div>
      <section id="how-it-works" className="living-story">
        <div className="living-story-intro">
          <span className="eyebrow">The Living Workspace</span>
          <h2>
            A little context.
            <br />A clear next step.
          </h2>
          <p>One continuous journey, from what comes in to what comes next.</p>
        </div>
        <div className="signature-steps">
          {[
            {
              label: "Capture",
              title: "Let the thought land.",
              text: "Paste a message, or bring a screenshot or PDF. Give your loose ends one place to begin.",
              note: "Text, images & PDFs · Available now",
            },
            {
              label: "Understand",
              title: "Find what matters.",
              text: "Smart Capture suggests tasks from your source. Review the original wording and clarify any uncertain deadline.",
              note: "Real AI extraction · Your review comes first",
            },
            {
              label: "Organize",
              title: "Make it your next step.",
              text: "Edit, choose, and approve. Only the tasks you select are saved to your workspace.",
              note: "Illustrated schedule · Plans need your approval",
            },
          ].map((item, index) => (
            <article
              className={`story-step ${stage === index ? "is-current" : ""}`}
              key={item.label}
            >
              <span className="step-index">0{index + 1}</span>
              <div>
                <span className="signature-step-label">{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <span className="step-status">{item.note}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
function MagneticCTA() {
  const x = useMotionValue(0),
    y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 250, damping: 25 }),
    sy = useSpring(y, { stiffness: 250, damping: 25 });
  const reduced = useReducedMotion();
  return (
    <m.span
      className="living-magnetic"
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        if (reduced || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set(((e.clientX - r.left) / r.width - 0.5) * 6);
        y.set(((e.clientY - r.top) / r.height - 0.5) * 4);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      <Link className="button primary large" href="/signup">
        Find your flow
        <Icon name="arrow" width="17" />
      </Link>
    </m.span>
  );
}
