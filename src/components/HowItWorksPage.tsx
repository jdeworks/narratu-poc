import { useProjectStore } from "../stores/project-store";

const STEPS = [
  {
    number: "01",
    title: "Paste Your Story",
    description:
      "Drop in a short story, a chapter excerpt, or any narrative text. No formatting required. The AI works with raw text.",
    icon: "📝",
  },
  {
    number: "02",
    title: "AI Reads Like a Director",
    description:
      "The AI analyzes your story and extracts every character, their personality, age, accent, and emotional arc. It maps out who speaks when, how they should sound, and what they are feeling in each moment.",
    icon: "🧠",
  },
  {
    number: "03",
    title: "Review & Fine-Tune",
    description:
      "See your story broken into segments with color-coded speakers and emotion markers. Every segment shows the voice-optimized text with audio tags like [whispers], [tense], [excited]. Adjust anything before generation.",
    icon: "✏️",
  },
  {
    number: "04",
    title: "Design Character Voices",
    description:
      "Each character gets matched to a unique voice based on their traits. Preview options, pick your favorites, or create a custom voice clone from your own audio. The AI suggests, you decide.",
    icon: "🎙️",
  },
  {
    number: "05",
    title: "Generate & Mix",
    description:
      "Generate the full audiobook with distinct voices and emotional delivery. Use the audio mixer to add background music and sound effects, adjust per-segment settings, and export as MP3.",
    icon: "🎧",
  },
];

export default function HowItWorksPage() {
  const setView = useProjectStore((s) => s.setView);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-12 text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight">
          How Narratu Works
        </h1>
        <p className="text-lg text-[var(--color-text-secondary)]">
          From text to voiced audiobook in five steps. Quality over speed: every character sounds distinct, every line has the right emotion.
        </p>
      </div>

      <div className="space-y-6">
        {STEPS.map((step) => (
          <div
            key={step.number}
            className="flex gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:gap-5 sm:p-6"
          >
            <div className="flex shrink-0 flex-col items-center">
              <span className="text-3xl">{step.icon}</span>
              <span className="mt-1 text-xs font-bold text-[var(--color-text-muted)]">
                {step.number}
              </span>
            </div>
            <div>
              <h3 className="mb-1 text-lg font-semibold text-[var(--color-text)]">
                {step.title}
              </h3>
              <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* What makes it different */}
      <div className="mt-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-xl font-bold">What Makes This Different</h2>
        <div className="space-y-3">
          <FeatureRow
            name="Quality-first approach"
            description="We use the best available voices (ElevenLabs, MOS 4.8) with per-line emotion tags and pronunciation control. The AI acts as a director, not just a text-to-speech wrapper."
            tag="CORE"
          />
          <FeatureRow
            name="Full production pipeline"
            description="Not just voices. Narratu includes LUFS normalization, artifact detection, fade curves, background music, sound effects, and a visual audio mixer. Export a finished product, not raw audio."
            tag="CORE"
          />
          <FeatureRow
            name="Voice cloning"
            description="Create a custom voice from your own audio samples. Read bedtime stories in a parent's voice, create personalized gifts, or preserve a voice for future use. Quality depends on source audio clarity."
            tag="BYOK"
          />
          <FeatureRow
            name="Bring your own key"
            description="You use your own API keys. We never store them. This keeps costs transparent and gives you full control over which AI providers you use."
            tag="BYOK"
          />
        </div>
      </div>

      {/* CTA */}
      <div className="mt-12 text-center">
        <button
          onClick={() => setView("demo")}
          className="rounded-lg bg-[var(--color-primary)] px-8 py-3 text-base font-medium text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)] sm:text-lg"
        >
          Listen to the Demo
        </button>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          Pre-generated with real AI voices. No account or API key needed.
        </p>
      </div>
    </div>
  );
}

function FeatureRow({ name, description, tag }: { name: string; description: string; tag: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 rounded bg-[var(--color-bg)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-muted)]">
        {tag}
      </span>
      <div>
        <span className="text-sm font-medium text-[var(--color-text)]">{name}</span>
        <p className="text-sm text-[var(--color-text-secondary)]">{description}</p>
      </div>
    </div>
  );
}
