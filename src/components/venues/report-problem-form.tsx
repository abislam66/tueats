"use client";

import { useState } from "react";
import { usePostHog } from "posthog-js/react";

import { reportProblem } from "@/actions/reports";
import { Button } from "@/components/ui/primitives";
import { AnalyticsEvent } from "@/lib/analytics";

const REASONS = [
  ["closed", "It looks closed"],
  ["moved", "It moved"],
  ["wrong_hours", "Hours are wrong"],
  ["other", "Something else"],
] as const;

// Visually hidden but still in normal tab/DOM order (unlike display:none,
// which some bots know to skip) — real users never see or fill this field;
// a filled value fails the server's max-length-0 check.
const HONEYPOT_STYLE = {
  position: "absolute",
  left: "-9999px",
  width: "1px",
  height: "1px",
  overflow: "hidden",
} as const;

export function ReportProblemForm({
  venueId,
  venueName,
  compact = false,
}: {
  venueId: string;
  venueName: string;
  /** Inline "Something's wrong?" link (status card) instead of a button. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const posthog = usePostHog();

  if (submitted) {
    return (
      <div className="report-success" role="status">
        <strong>Thanks for the heads-up.</strong>
        <p>We’ll check the details for {venueName}.</p>
      </div>
    );
  }

  if (!open) {
    return compact ? (
      <button
        aria-expanded={false}
        className="text-link status-card-report"
        onClick={() => setOpen(true)}
        type="button"
      >
        Something&apos;s wrong?
      </button>
    ) : (
      <Button onClick={() => setOpen(true)} variant="secondary">
        Report a problem
      </Button>
    );
  }

  return (
    <form
      className="report-form"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const reason = formData.get("reason");
        const note = formData.get("note");
        const website = formData.get("website");
        const kind = typeof reason === "string" ? reason : "closed";

        setPending(true);
        setError(null);
        void reportProblem({
          venueId,
          kind,
          note: typeof note === "string" && note.trim() ? note : undefined,
          website: typeof website === "string" ? website : "",
        }).then((result) => {
          setPending(false);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          // Only counted once it's actually persisted — previously this
          // fired (and the "Thanks" message showed) unconditionally.
          posthog.capture(AnalyticsEvent.ProblemReported, { reason: kind });
          setSubmitted(true);
        });
      }}
    >
      <fieldset>
        <legend>What seems wrong?</legend>
        {REASONS.map(([value, label], index) => (
          <label key={value}>
            <input
              defaultChecked={index === 0}
              name="reason"
              type="radio"
              value={value}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label>
        <span>
          Anything else? <small>Optional</small>
        </span>
        <textarea maxLength={500} name="note" rows={4} />
      </label>
      <input
        aria-hidden="true"
        autoComplete="off"
        name="website"
        style={HONEYPOT_STYLE}
        tabIndex={-1}
        type="text"
      />
      {error ? <p className="form-error">{error}</p> : null}
      <div className="report-actions">
        <Button disabled={pending} type="submit">
          Send report
        </Button>
        <Button
          disabled={pending}
          onClick={() => setOpen(false)}
          variant="ghost"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
