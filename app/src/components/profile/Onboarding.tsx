import { useEffect, useState } from "react";
import {
  ACCENTS,
  accentColor,
  saveMyProfile,
  shownAvatar,
  shownName,
  type AccentId,
  type Profile,
} from "../../lib/profile";
import { loadPins, type PinnedRepo } from "../../lib/pins";
import { supabase } from "../../lib/supabase";
import { MEMBER_COLUMNS, memberHref, type Member } from "../../lib/people";
import Icon from "../Icon";
import Verified from "../Verified";
import PersonFollowButton from "../people/PersonFollowButton";
import { Avatar, ChoiceRow, PinSection, Section } from "./ProfileEditor";

const STEPS = ["Who you are", "What you look after", "Who you read"] as const;

async function peopleToMeet(exclude: string, limit = 4): Promise<Member[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("member_profile")
    .select(MEMBER_COLUMNS)
    .eq("private_account", false)
    .order("post_count", { ascending: false })
    .order("scan_count", { ascending: false })
    .limit(limit + 1);
  if (error) return [];
  return ((data as unknown as Member[]) ?? [])
    .filter((m) => m.id !== exclude && m.post_count + m.scan_count > 0)
    .slice(0, limit);
}

export default function Onboarding({ profile }: { profile: Profile }) {
  const [draft, setDraft] = useState<Profile>(profile);
  const [step, setStep] = useState(0);
  const [pins, setPins] = useState<PinnedRepo[]>([]);
  const [people, setPeople] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPins(profile.id).then(setPins);
    void peopleToMeet(profile.id).then(setPeople);
  }, [profile.id]);

  async function finish(next: string) {
    setBusy(true);
    setError(null);
    const { error } = await saveMyProfile({
      display_name: draft.display_name?.trim() || null,
      name_source: draft.name_source,
      bio: draft.bio?.trim() || null,
      accent: draft.accent,
      onboarded_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    window.location.href = next;
  }

  function patch(value: Partial<Profile>) {
    setDraft((prev) => ({ ...prev, ...value }));
  }

  return (
    <div className="mx-auto max-w-[640px]">
      <ol className="mb-8 flex items-center gap-2">
        {STEPS.map((label, index) => (
          <li key={label} className="flex min-w-0 flex-1 flex-col gap-2">
            <span
              className={`h-1 rounded-full transition ${
                index <= step
                  ? "bg-[var(--color-primary)]"
                  : "bg-[var(--color-line)]"
              }`}
            />
            <span
              className={`truncate text-2xs uppercase tracking-wider ${
                index === step
                  ? "text-[var(--color-text)]"
                  : "text-[var(--color-faint)]"
              }`}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar
              src={shownAvatar(draft)}
              name={shownName(draft)}
              accent={accentColor(draft.accent)}
              size={56}
            />
            <div className="min-w-0">
              <h2 className="text-xl">Welcome, {shownName(draft)}</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Three short steps. You can change all of it later, and skip any
                of it now.
              </p>
            </div>
          </div>

          <Section icon="user" title="The name people will read">
            <div className="space-y-3">
              <ChoiceRow
                selected={draft.name_source === "github"}
                onSelect={() => patch({ name_source: "github" })}
                title="The name on my GitHub account"
                detail={draft.gh_name || draft.gh_login}
              />
              <ChoiceRow
                selected={draft.name_source === "custom"}
                onSelect={() => patch({ name_source: "custom" })}
                title="A name I choose"
                detail={draft.display_name?.trim() || "Nothing written yet"}
              />
            </div>

            {draft.name_source === "custom" && (
              <input
                className="field mt-4"
                value={draft.display_name ?? ""}
                maxLength={40}
                placeholder="e.g. Berat"
                onChange={(e) => patch({ display_name: e.target.value })}
              />
            )}

            <div className="mt-6">
              <p className="label">Your colour</p>
              <div className="flex flex-wrap gap-2.5">
                {ACCENTS.map((a) => {
                  const active = draft.accent === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => patch({ accent: a.id as AccentId })}
                      aria-label={a.label}
                      aria-pressed={active}
                      title={a.label}
                      className={`grid size-9 place-items-center rounded-full border-2 transition ${
                        active
                          ? "scale-110 border-[var(--color-text)]"
                          : "border-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: a.color }}
                    >
                      {active && (
                        <Icon
                          name="check"
                          size={16}
                          className="text-[#0a0912]"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl">What are you keeping an eye on?</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Pin up to three repositories. They go to the top of your public
              page, so people can see what you care about before they read a
              word.
            </p>
          </div>
          <PinSection profile={draft} pins={pins} onPins={setPins} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl">
              Your feed is empty until you follow someone
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              These are the people posting and scanning most. Following one is
              enough to start.
            </p>
          </div>

          {people.length === 0 ? (
            <p className="rounded-[var(--radius-control)] border border-dashed border-[var(--color-line)] px-4 py-7 text-center text-sm text-[var(--color-muted)]">
              Nobody else has posted yet. You get to be first.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
              {people.map((person) => (
                <li
                  key={person.id}
                  className="flex items-center gap-3 px-5 py-3.5"
                >
                  <Avatar
                    src={person.avatar_url}
                    name={person.shown_name}
                    accent={accentColor(person.accent)}
                    size={38}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1">
                      <a
                        href={memberHref(person.gh_login) ?? "#"}
                        className="truncate text-sm text-[var(--color-text)] hover:underline"
                      >
                        {person.shown_name}
                      </a>
                      {person.verified && <Verified size={13} />}
                    </span>
                    <span className="block truncate text-xs text-[var(--color-muted)]">
                      {person.post_count} post
                      {person.post_count === 1 ? "" : "s"} · {person.scan_count}{" "}
                      scan{person.scan_count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <PersonFollowButton personId={person.id} signedIn />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
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
            Continue
            <Icon name="chevron" size={14} />
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void finish("/app/scan/")}
          >
            {busy ? "Saving…" : "Finish and scan something"}
          </button>
        )}

        <button
          type="button"
          className="btn btn-quiet"
          disabled={busy}
          onClick={() => void finish("/app/")}
        >
          {step === STEPS.length - 1
            ? "Just take me to the feed"
            : "Skip the rest"}
        </button>

        {error && (
          <span className="text-xs text-[var(--color-bad)]">{error}</span>
        )}
      </div>
    </div>
  );
}
