import { useState } from "react";
import { useProjectStore } from "../stores/project-store";

/**
 * Native survey form matching our design.
 * On submit, POSTs directly to Google Forms public endpoint.
 * Results appear in the linked Google Sheet automatically.
 * No API key, no auth, no proxy needed.
 */

const GOOGLE_FORM_ID =
  "1FAIpQLSew4xavtoQiqRVddZbQUTtBy-5lQFG58dQ3x_4_2VzCc_fxOA";

const FIELD_IDS = {
  aiSentiment: "entry.802041725",
  impression: "entry.1758558717",
  wouldPayAudiobook: "entry.1009263761",
  wouldPayAiAudiobook: "entry.2050547000",
  useCase: "entry.128050824",
  contactInfo: "entry.1435394282",
  feedback: "entry.586765347",
} as const;

interface SurveyData {
  aiSentiment: string;
  impression: string;
  wouldPayAudiobook: string;
  wouldPayAiAudiobook: string;
  useCase: string;
  contactInfo: string;
  feedback: string;
}

export default function SurveyPage() {
  const setView = useProjectStore((s) => s.setView);
  const [data, setData] = useState<SurveyData>({
    aiSentiment: "",
    impression: "",
    wouldPayAudiobook: "",
    wouldPayAiAudiobook: "",
    useCase: "",
    contactInfo: "",
    feedback: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  function update(field: keyof SurveyData, value: string) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    setSending(true);

    // Build form data for Google Forms
    const formData = new URLSearchParams();
    formData.append(FIELD_IDS.aiSentiment, data.aiSentiment);
    formData.append(FIELD_IDS.impression, data.impression);
    formData.append(FIELD_IDS.wouldPayAudiobook, data.wouldPayAudiobook);
    formData.append(FIELD_IDS.wouldPayAiAudiobook, data.wouldPayAiAudiobook);
    formData.append(FIELD_IDS.useCase, data.useCase);
    formData.append(FIELD_IDS.contactInfo, data.contactInfo);
    formData.append(FIELD_IDS.feedback, data.feedback);

    // POST to Google Forms (fire and forget, CORS will block the response but the data goes through)
    try {
      await fetch(
        `https://docs.google.com/forms/d/e/${GOOGLE_FORM_ID}/formResponse`,
        {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        },
      );
    } catch {
      // Expected: no-cors mode won't give us a readable response, but the data is submitted
    }

    // Also store locally as backup
    const entry = { ...data, timestamp: new Date().toISOString() };
    const existing = JSON.parse(
      localStorage.getItem("narratu-survey-responses") ?? "[]",
    );
    existing.push(entry);
    localStorage.setItem("narratu-survey-responses", JSON.stringify(existing));

    setSending(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-center sm:px-6 sm:py-12">
        <div className="mb-4 text-5xl">🙏</div>
        <h2 className="mb-3 text-2xl font-bold">Thank you!</h2>
        <p className="mb-6 text-[var(--color-text-secondary)]">
          Your feedback helps shape the future of Narratu.
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => setView("demo")}
            className="rounded-lg bg-[var(--color-primary)] px-6 py-2 font-medium text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)]"
          >
            Try the Demo
          </button>
          <button
            onClick={() => setView("investors")}
            className="rounded-lg border border-[var(--color-border)] px-6 py-2 font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]"
          >
            Learn More
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8 text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight">
          What do you think?
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          Help us shape the future of AI audiobook creation. Takes about 30
          seconds.
        </p>
      </div>

      <div className="space-y-6">
        <Question label="How do you feel about AI-generated content?">
          <div className="flex flex-wrap gap-2">
            {[
              "I actively use AI tools",
              "Curious and open to it",
              "Cautious but willing to try",
              "I prefer human-created content",
              "Against AI-generated content",
            ].map((opt) => (
              <PillOption
                key={opt}
                label={opt}
                selected={data.aiSentiment === opt}
                onClick={() => update("aiSentiment", opt)}
              />
            ))}
          </div>
        </Question>

        <Question label="First impression of Narratu?">
          <div className="flex flex-wrap gap-2">
            {["Love it", "Interesting", "Not sure yet", "Not for me"].map(
              (opt) => (
                <PillOption
                  key={opt}
                  label={opt}
                  selected={data.impression === opt}
                  onClick={() => update("impression", opt)}
                />
              ),
            )}
          </div>
        </Question>

        <Question label="What would you be willing to pay to listen to an audiobook (5-10h)?">
          <div className="flex flex-wrap gap-2">
            {["Free only", "$1 to $5", "$5 to $15", "$15 to $30", "$30+"].map(
              (opt) => (
                <PillOption
                  key={opt}
                  label={opt}
                  selected={data.wouldPayAudiobook === opt}
                  onClick={() => update("wouldPayAudiobook", opt)}
                />
              ),
            )}
          </div>
        </Question>

        <Question label="What would you be willing to pay to listen to an AI generated audiobook (5-10h)?">
          <div className="flex flex-wrap gap-2">
            {["Free only", "$1 to $5", "$5 to $15", "$15 to $30", "$30+"].map(
              (opt) => (
                <PillOption
                  key={opt}
                  label={opt}
                  selected={data.wouldPayAiAudiobook === opt}
                  onClick={() => update("wouldPayAiAudiobook", opt)}
                />
              ),
            )}
          </div>
        </Question>

        <Question label="Which describes you best?">
          <div className="flex flex-wrap gap-2">
            {[
              "Author (my own books)",
              "Content creator",
              "Publisher",
              "Listener / audiobook fan",
              "Educator",
              "Developer / tech enthusiast",
              "Investor",
              "Just curious",
            ].map((opt) => (
              <PillOption
                key={opt}
                label={opt}
                selected={data.useCase === opt}
                onClick={() => update("useCase", opt)}
              />
            ))}
          </div>
        </Question>

        <Question label="E-Mail or Phone" optional>
          <p className="mb-2 text-xs text-[var(--color-text-muted)]">
            If you are a VC or generally interested in the tool, leave your contact info so I can reach out.
          </p>
          <input
            type="text"
            value={data.contactInfo}
            onChange={(e) => update("contactInfo", e.target.value)}
            placeholder="hello@world"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] p-3 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
          />
        </Question>

        <Question label="Anything else you'd like to share?" optional>
          <textarea
            value={data.feedback}
            onChange={(e) => update("feedback", e.target.value)}
            placeholder="Ideas, concerns, feature requests..."
            className="h-24 w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] p-3 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
          />
        </Question>

        <button
          onClick={handleSubmit}
          disabled={!data.aiSentiment || !data.impression || sending}
          className="w-full rounded-lg bg-[var(--color-primary)] py-3 font-medium text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
        >
          {sending ? "Sending..." : "Submit Feedback"}
        </button>
      </div>
    </div>
  );
}

function Question({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">
        {label}
        {optional && (
          <span className="ml-1 font-normal text-[var(--color-text-muted)]">
            (optional)
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function PillOption({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
        selected
          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
          : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-muted)]"
      }`}
    >
      {label}
    </button>
  );
}
