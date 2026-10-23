"use client";
import { useEffect, useRef, useState } from "react";
import { m, useScroll, useMotionValueEvent } from "motion/react";
import { Brand } from "@/components/ui/brand";
import { Icon } from "@/components/ui/icon";
export function PublicNavbar({
  accountLinks,
}: {
  accountLinks: React.ReactNode;
}) {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const scrolledRef = useRef(false);
  const [active, setActive] = useState("");
  useEffect(() => {
    const sections = ["how-it-works", "features", "our-approach"]
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) setActive(entry.target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: 0 },
    );
    sections.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
  const drawer = useRef<HTMLDialogElement>(null);
  useMotionValueEvent(scrollY, "change", (value) => {
    const next = value > 18;
    if (scrolledRef.current !== next) {
      scrolledRef.current = next;
      setScrolled(next);
    }
  });
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 769px)");
    const close = () => {
      if (mq.matches) drawer.current?.close();
    };
    mq.addEventListener("change", close);
    return () => mq.removeEventListener("change", close);
  }, []);
  return (
    <header className={`public-header ${scrolled ? "is-scrolled" : ""}`}>
      <div className="public-nav site-width">
        <Brand />
        <nav className="public-links" aria-label="Public navigation">
          {[
            ["how-it-works", "The flow"],
            ["features", "What’s inside"],
            ["our-approach", "Our approach"],
          ].map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={active === id ? "location" : undefined}
              onClick={() => setActive(id)}
            >
              {label}
              {active === id && (
                <m.span
                  className="public-active-indicator"
                  layoutId="public-section"
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
              )}
            </a>
          ))}
        </nav>
        <div className="public-account">{accountLinks}</div>
        <button
          className="icon-button public-menu-toggle"
          onClick={() => drawer.current?.showModal()}
          aria-label="Open site navigation"
        >
          <Icon name="menu" />
        </button>
      </div>
      <dialog
        className="public-mobile-menu"
        ref={drawer}
        aria-label="Site navigation"
      >
        <div className="mobile-menu-heading">
          <Brand />
          <button
            className="icon-button"
            aria-label="Close site navigation"
            onClick={() => drawer.current?.close()}
          >
            <Icon name="close" />
          </button>
        </div>
        <nav aria-label="Mobile public navigation">
          {[
            ["#how-it-works", "The flow"],
            ["#features", "What’s inside"],
            ["#our-approach", "Our approach"],
          ].map(([href, label]) => (
            <a href={href} key={href} onClick={() => drawer.current?.close()}>
              {label}
              <Icon name="arrow" />
            </a>
          ))}
        </nav>
        <div className="mobile-account" onClick={() => drawer.current?.close()}>
          {accountLinks}
        </div>
        <p>
          A little less in your head.
          <br />A little more in your day.
        </p>
      </dialog>
    </header>
  );
}
