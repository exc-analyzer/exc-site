import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { signOutEverywhere } from "../lib/auth";
import Icon from "./Icon";

const VERSION = "2026-09-03";

type Stage = "checking" | "clear" | "consent" | "offer" | "tour";

interface Step {
  icon: "search" | "shield" | "share" | "users";
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    icon: "search",
    title: "It reads what GitHub already publishes",
    body: "Point it at a repository and it checks a handful of things anyone could check by hand: whether there is a licence, an issue tracker, a security policy, a dependency bot. It never reads your code.",
  },
  {
    icon: "shield",
    title: "The score is a hundred minus what went wrong",
    body: "A repository starts at 100 and loses points for each check it fails. Anything that cannot be read costs nothing and is marked unknown. A high score means little went visibly wrong, not that a project is safe.",
  },
  {
    icon: "share",
    title: "You publish only your own repositories",
    body: "You can scan anything. You can publish a result, or run a secret scan, only where you have push access. Every published score carries the date it was computed.",
  },
  {
    icon: "users",
    title: "The rest is people",
    body: "The feed is what everyone else found. Follow a repository to hear when its score moves, argue with a result in the comments, or flag one you think is wrong.",
  },
];

export default function FirstRun() {
  const [stage, setStage] = useState<Stage>("checking");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setStage("clear");
      return;
    }
    let alive = true;

    async function check() {
      const { data: sessionData } = await supabase!.auth.getSession();
      if (!sessionData.session) {
        if (alive) setStage("clear");
        return;
      }
      const { data, error } = await supabase!.rpc("my_first_run");
      if (!alive) return;
      if (error) {
        setStage("clear");
        return;
      }
      const row = (
        data as { accepted_at: string | null; tour_seen: string | null }[] | null
      )?.[0];
      if (!row?.accepted_at) setStage("consent");
      else if (!row.tour_seen) setStage("offer");
      else setStage("clear");
    }

    void check();
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void check();
    });
    return () => {
      alive = false;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  const showing = stage === "consent" || stage === "offer" || stage === "tour";

  useEffect(() => {
    document.documentElement.style.overflow = showing ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [showing]);

  if (!showing) return null;

  async function accept() {
    setBusy(true);
    setProblem(null);
    const { error } = await supabase!.rpc("accept_terms", { version: VERSION });
    setBusy(false);
    if (error) {
      setProblem("That did not save. Try once more.");
      return;
    }
    setStage("offer");
  }

  async function closeTour(goTo?: string) {
    setBusy(true);
    setProblem(null);
    const { error } = await supabase!.rpc("finish_tour");
    setBusy(false);
    if (error) {
      setProblem("That did not save. Try once more.");
      return;
    }
    if (goTo) {
      window.location.href = goTo;
      return;
    }
    setStage("clear");
  }

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-[rgba(8,7,14,0.88)] p-4 backdrop-blur-md">
      <div className="surface w-full max-w-lg p-6 sm:p-7">
        {stage === "consent" && (
          <>
            <h2 className="text-lg font-semibold">Before you start</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
              Reading and scanning need no account. An account is what lets you
              publish a result, post, and follow. Publishing a scan of a
              repository is limited to repositories you can push to.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
              Scans run in your browser, on your own GitHub account. Your code
              never reaches us, and we never receive your token.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
              To continue, accept the{" "}
              <a
                href="/app/terms/"
                className="link"
                target="_blank"
                rel="noopener"
              >
                Terms of Use
              </a>{" "}
              and the{" "}
              <a
                href="/app/privacy/"
                className="link"
                target="_blank"
                rel="noopener"
              >
                Privacy Notice
              </a>
              .
            </p>

            {problem && (
              <p className="mt-4 text-sm text-[var(--color-bad)]">{problem}</p>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void accept()}
              >
                {busy ? "Saving…" : "I accept"}
              </button>
              <button
                type="button"
                className="btn btn-quiet"
                disabled={busy}
                onClick={() => void signOutEverywhere()}
              >
                Not now, sign me out
              </button>
            </div>
          </>
        )}

        {stage === "offer" && (
          <>
            <h2 className="text-lg font-semibold">Want the short version?</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
              Four screens on what this does, what the score means, and what you
              are allowed to publish. Under a minute, and you will not be asked
              again.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setStep(0);
                  setStage("tour");
                }}
              >
                Show me around
              </button>
              <button
                type="button"
                className="btn btn-quiet"
                disabled={busy}
                onClick={() => void closeTour()}
              >
                Skip it
              </button>
            </div>
          </>
        )}

        {stage === "tour" && (
          <>
            <div className="flex size-10 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-primary-soft)] text-[var(--color-accent)]">
              <Icon name={STEPS[step].icon} size={19} />
            </div>
            <h2 className="mt-4 text-lg font-semibold">{STEPS[step].title}</h2>
            <p className="mt-2.5 text-sm leading-relaxed text-[var(--color-muted)]">
              {STEPS[step].body}
            </p>

            <div className="mt-6 flex items-center gap-1.5">
              {STEPS.map((entry, i) => (
                <span
                  key={entry.title}
                  className={`h-1 rounded-full transition-all ${
                    i === step
                      ? "w-6 bg-[var(--color-accent)]"
                      : "w-1.5 bg-[var(--color-line-strong)]"
                  }`}
                />
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {step > 0 && (
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </button>
              )}
              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setStep(step + 1)}
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void closeTour("/app/scan/")}
                >
                  {busy ? "Saving…" : "Scan something"}
                </button>
              )}
              <button
                type="button"
                className="ml-auto text-xs text-[var(--color-faint)] hover:text-[var(--color-muted)]"
                disabled={busy}
                onClick={() => void closeTour()}
              >
                {step < STEPS.length - 1 ? "Skip the tour" : "Close"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
