import { Brand, FlowSymbol } from "@/components/ui/brand";
import { Icon } from "@/components/ui/icon";
export function AuthAside() {
  return (
    <aside className="auth-aside">
      <div className="auth-aside-top">
        <span className="eyebrow">A little less in your head.</span>
        <span className="auth-aside-index">A little more in your day.</span>
      </div>
      <div className="auth-editorial">
        <h2>
          Your next chapter.
          <br />A clearer head.
        </h2>
        <p>
          A thoughtful place for your tasks, your plans,
          <br />
          and the things that matter in between.
        </p>
      </div>
      <div
        className="auth-art"
        aria-label="Illustration of an organized personal task list"
      >
        <div className="auth-art-orbit" />
        <div className="auth-paper auth-paper-back">
          <span>Room to breathe.</span>
          <div />
          <div />
          <div />
        </div>
        <div className="auth-paper auth-paper-front">
          <div className="auth-paper-brand">
            <FlowSymbol />
            <span>Your everyday, in flow.</span>
          </div>
          <div className="auth-art-date">
            Today, in your own time.<span>Personal workspace</span>
          </div>
          <h3>A little progress.</h3>
          <div className="auth-art-task">
            <span className="art-check">
              <Icon name="check" width="12" />
            </span>
            Start with what matters.
          </div>
          <div className="auth-art-task">
            <span className="art-checkbox" />
            Make room for yourself.
          </div>
          <div className="auth-art-task">
            <span className="art-checkbox" />
            Take the next small step.
          </div>
          <div className="auth-art-progress">
            <span />
            <small>One small win. Room for more.</small>
          </div>
          <div className="auth-paper-foot">
            <span className="tiny-dot" />A fresh start, every day.
          </div>
        </div>
        <span className="auth-art-note">
          <Icon name="spark" width="15" />A little more headspace.
        </span>
      </div>
      <div className="auth-aside-bottom">
        <Brand />
        <span>Built for the beautifully busy.</span>
      </div>
    </aside>
  );
}
