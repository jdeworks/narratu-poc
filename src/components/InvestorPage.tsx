import { useProjectStore } from "../stores/project-store";

export default function InvestorPage() {
  const setView = useProjectStore((s) => s.setView);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      {/* PoC banner */}
      <div className="mb-8 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 px-5 py-3 text-center text-sm text-[var(--color-text-secondary)]">
        <strong className="text-[var(--color-primary)]">
          Proof of Concept
        </strong>{" "}
        You are looking at a working prototype that demonstrates the full pipeline. The demo uses real AI-generated voices with emotional delivery, not synthetic placeholders. With funding, this moves from impressive to production-grade.
      </div>

      {/* Hero */}
      <div className="mb-12 text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight">
          Quality-First AI Audio Production
        </h1>
        <p className="text-lg text-[var(--color-text-secondary)]">
          Narratu creates audiobooks where every character sounds like a distinct person with real emotion. Not the fastest AI audio tool. The one that sounds the best.
        </p>
      </div>

      {/* Problem */}
      <Section title="The Problem">
        <p>
          AI audiobook tools already exist. They are fast and cheap, and they sound like it. Flat narration, characters that blur together, robotic delivery on emotional lines. Authors use them because professional narration costs <strong>$100-$250 per finished hour</strong>, but they are not proud of the result.
        </p>
        <p>
          The quality gap is not in the TTS engines themselves. ElevenLabs, for example, can produce remarkably natural speech. The gap is in everything around the engine: understanding which character is speaking, what emotion fits this line, how pacing should shift between dialogue and narration, where to place emphasis. That layer of creative intelligence is what separates a good audiobook from a generated one.
        </p>
      </Section>

      {/* Solution */}
      <Section title="Our Approach: Intelligence Layer + Best-in-Class Voices">
        <p>
          Narratu is not another wrapper around a TTS API. It is a creative production system that understands story structure, character voice, and emotional delivery. The AI reads the text like a director would, then orchestrates the best available voice engines to perform it.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <FeatureCard
            icon="🎭"
            title="Story Intelligence"
            description="Deep character extraction: personality, age, accent, emotional arc. Maps every line to the right speaker with the right delivery."
          />
          <FeatureCard
            icon="🎙️"
            title="Voice Design"
            description="Each character gets a unique voice. Not random assignment, but trait-matched selection from 1000+ premium voices with preview and override."
          />
          <FeatureCard
            icon="🎛️"
            title="Production Control"
            description="Per-segment settings: loudness, pacing, fades. Audio mixer with music and SFX. Export when you are happy, not before."
          />
        </div>
      </Section>

      {/* What exists vs. what we do */}
      <Section title="Competitive Landscape">
        <p>
          Existing AI audiobook tools optimize for speed and price. We optimize for the result.
        </p>
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]"></th>
                <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">Typical AI tools</th>
                <th className="px-4 py-2 text-left font-medium text-[var(--color-primary)]">Narratu</th>
              </tr>
            </thead>
            <tbody className="text-[var(--color-text-secondary)]">
              <tr className="border-b border-[var(--color-border)]/50"><td className="px-4 py-2 font-medium text-[var(--color-text)]">Character voices</td><td className="px-4 py-2">1-3 voices, manually assigned</td><td className="px-4 py-2">Unlimited, auto-matched to traits</td></tr>
              <tr className="border-b border-[var(--color-border)]/50"><td className="px-4 py-2 font-medium text-[var(--color-text)]">Emotional delivery</td><td className="px-4 py-2">Flat or basic tone tags</td><td className="px-4 py-2">Per-line emotion + inflection from story context</td></tr>
              <tr className="border-b border-[var(--color-border)]/50"><td className="px-4 py-2 font-medium text-[var(--color-text)]">Editing</td><td className="px-4 py-2">Regenerate entire book</td><td className="px-4 py-2">Edit any segment, adjust settings, re-export</td></tr>
              <tr className="border-b border-[var(--color-border)]/50"><td className="px-4 py-2 font-medium text-[var(--color-text)]">Audio production</td><td className="px-4 py-2">Raw voice output</td><td className="px-4 py-2">Full mixer: music, SFX, fades, LUFS normalization</td></tr>
              <tr><td className="px-4 py-2 font-medium text-[var(--color-text)]">Voice cloning</td><td className="px-4 py-2">Upload and hope</td><td className="px-4 py-2">Quality-gated: clone only when source audio is clean enough</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* Solved challenges */}
      <Section title="TTS Challenges We Have Already Solved">
        <p>
          Raw TTS output is not production-ready. Every AI voice engine produces artifacts that make
          concatenated speech sound robotic. These are engineering problems, not model problems, and
          we have solved each one in the current PoC. Open the demo mixer to see the waveforms.
        </p>
        <div className="mt-4 space-y-3">
          <ChallengeCard
            problem="Trailing clicks and pops"
            description="TTS engines frequently produce a click or pop at the end of a segment, an artifact of the neural decoder stopping abruptly."
            solution="Multi-pass tail artifact detection: end-spike analysis, dip-then-rise pattern matching, non-monotonic decay detection. Segments are auto-trimmed to the last clean sample with configurable fade-out curves."
            demo="Visible in the mixer: segments have clean endings with smooth fade-out envelopes. Before optimization, 16 of 63 segments had audible artifacts. After: zero."
          />
          <ChallengeCard
            problem="Inconsistent loudness"
            description="Different characters, emotions, and line lengths produce wildly different volume levels. A whispered line followed by a shout is jarring."
            solution="ITU-R BS.1770 LUFS measurement with gated loudness normalization. Each segment is normalized to a target loudness (-19 LUFS for speech), with peak limiting at -3dB. Whispers stay quiet, shouts stay loud, but they are calibrated to the same perceived scale."
            demo="Visible in the mixer: speaker waveform heights are consistent across segments despite different original recording levels."
          />
          <ChallengeCard
            problem="Digital silence between segments"
            description="Silence between speech segments sounds unnatural, like switching between recordings in a dead room. Listeners notice the absence of room tone."
            solution="Context-aware gaps filled with -52dB pink noise (Voss-McCartney algorithm). Gap duration adapts to speaker transitions: same speaker gets shorter gaps, narrator-to-character gets longer. L-cut and J-cut overlaps blend segment boundaries."
            demo="Visible in the mixer noise track: continuous subtle pink noise runs under all speech, creating a shared acoustic space."
          />
          <ChallengeCard
            problem="Abrupt segment transitions"
            description="Even with good TTS, concatenating segments produces hard cuts where one waveform ends and another begins. The ear detects the discontinuity as a click or an unnatural jump."
            solution="Per-segment configurable fade curves with strength parameter (linear to aggressive). Fade-in preserves plosive consonants (5-25ms), fade-out matches the tail energy profile (8-50ms). Micro-reverb (8ms impulse response) applied to all segments creates a shared acoustic space."
            demo="Each segment in the mixer shows fade-in and fade-out regions. The optimized values were auto-detected from the audio itself."
          />
        </div>
      </Section>

      {/* Beyond audiobooks */}
      <Section title="Beyond Audiobooks: Voice as a Personal Medium">
        <p>
          The same technology that makes a fictional character sound real can make real voices come alive in new contexts. Voice cloning opens deeply personal use cases, where quality is everything and speed is secondary.
        </p>
        <div className="mt-4 space-y-3">
          <UseCaseCard
            label="Near-term"
            title="Personalized Gifts"
            description="Valentine's Day package: clone your voice, write or generate a custom story about your loved one, and produce a one-of-a-kind audio gift. The kind of thing you keep forever."
          />
          <UseCaseCard
            label="Near-term"
            title="Bedtime Stories"
            description="A parent traveling for work records a few minutes of speech. Their child hears them read a new bedtime story every night, in their real voice, with real warmth."
          />
          <UseCaseCard
            label="Advanced"
            title="Memorial Voices"
            description="With enough clean audio from a loved one who has passed, their voice can narrate letters, stories, or messages they never got to record. This requires exceptional clone quality and careful, respectful handling."
          />
        </div>
        <p className="mt-4 text-sm text-[var(--color-text-muted)]">
          These are quality-dependent features. The voice cloning pipeline already works in the current PoC. What determines whether these use cases succeed is clone fidelity, which improves with better source audio and model advances. We have the architecture; the quality bar is what we are raising.
        </p>
      </Section>

      {/* Market */}
      <Section title="Market Opportunity">
        <p>
          The global audiobook market is projected to reach <strong>$35B+ by 2030</strong>, growing at 26% CAGR. Self-publishing is the fastest growing segment. But the real market is broader than books: personalized audio content, educational material, corporate training, and the personal voice use cases above.
        </p>
      </Section>

      {/* Roadmap */}
      <Section title="Roadmap">
        <div className="space-y-4">
          <RoadmapPhase
            phase="Phase 1: Proof of Concept"
            items={[
              "Full pipeline working: text analysis, voice matching, generation, mixing, export",
              "Premium AI voices via ElevenLabs with inline emotion tags",
              "Audio mixer with music/SFX, per-segment settings, waveform editing",
              "Voice cloning demo (quality-dependent, works with clean source audio)",
              "100% browser-based, no account needed, BYOK model",
            ]}
          />
          <RoadmapPhase
            phase="Phase 2: Product (Current)"
            items={[
              "Backend infrastructure for full-length books (chapters, 100K+ tokens)",
              "Streaming pipeline: generate as you analyze, not after",
              "Voice quality scoring: automatically assess clone fidelity before publishing",
              "User accounts, project management, collaboration",
              "Personalized gift and bedtime story workflows",
            ]}
          />
          <RoadmapPhase
            phase="Phase 3: Marketplace"
            items={[
              "Audiobook marketplace: authors sell directly, 90% revenue share",
              "Crowdfunding: traditional and shared-revenue models for audiobook production",
              "Unified credit system for production and consumption",
              "Publisher partnerships and API access",
            ]}
          />
          <RoadmapPhase
            phase="Phase 4: Scale"
            items={[
              "Multi-language support (70+ languages via existing TTS providers)",
              "Custom voice marketplace",
              "Integration with Amazon, Audible, and publishing platforms",
              "White-label API for publishers and content platforms",
            ]}
          />
        </div>
      </Section>

      {/* Revenue model */}
      <Section title="Revenue Model">
        <div className="grid gap-4 sm:grid-cols-2">
          <RevenueCard
            title="Book Packages"
            description="Fixed-price per book, scaling with length. Unlimited iterations until satisfied. No per-generation anxiety."
          />
          <RevenueCard
            title="SaaS Subscriptions"
            description="Monthly plans for authors and publishers with included generation hours and priority processing."
          />
          <RevenueCard
            title="Personalized Audio"
            description="Premium pricing for gift packages, memorial voices, and custom voice workflows. High-touch, high-value."
          />
          <RevenueCard
            title="Marketplace Commission"
            description="10% platform fee on audiobook sales. Authors keep 90%."
          />
          <RevenueCard
            title="Enterprise & API"
            description="White-label solutions for publishers, educators, and content platforms."
          />
        </div>
      </Section>

      {/* CTA */}
      <div className="mt-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
        <h2 className="mb-3 text-2xl font-bold">Interested?</h2>
        <p className="mb-6 text-[var(--color-text-secondary)]">
          Try the demo with real AI-generated voices, or get in touch directly.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => setView("demo")}
            className="rounded-lg bg-[var(--color-primary)] px-6 py-2.5 font-medium text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)]"
          >
            Try the Demo
          </button>
          <button
            onClick={() => setView("survey")}
            className="rounded-lg border border-[var(--color-border)] px-6 py-2.5 font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]"
          >
            Share Feedback
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-2xl font-bold">{title}</h2>
      <div className="space-y-3 leading-relaxed text-[var(--color-text-secondary)]">{children}</div>
    </section>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
      <div className="mb-2 text-2xl">{icon}</div>
      <h3 className="mb-1 font-semibold text-[var(--color-text)]">{title}</h3>
      <p className="text-sm text-[var(--color-text-muted)]">{description}</p>
    </div>
  );
}

function UseCaseCard({ label, title, description }: { label: string; title: string; description: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
          label === "Advanced"
            ? "bg-[var(--color-emotion-bg)] text-[var(--color-emotion-text)]"
            : "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
        }`}>{label}</span>
        <h3 className="font-semibold text-[var(--color-text)]">{title}</h3>
      </div>
      <p className="text-sm text-[var(--color-text-secondary)]">{description}</p>
    </div>
  );
}

function RoadmapPhase({ phase, items }: { phase: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
      <h3 className="mb-2 font-semibold text-[var(--color-primary)]">{phase}</h3>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-[var(--color-text-secondary)]">
            <span className="shrink-0 text-[var(--color-text-muted)]">-</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChallengeCard({ problem, description, solution, demo }: { problem: string; description: string; solution: string; demo: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
      <h3 className="mb-1 font-semibold text-[var(--color-text)]">{problem}</h3>
      <p className="mb-2 text-sm text-[var(--color-text-muted)]">{description}</p>
      <div className="mb-2 rounded border-l-2 border-[var(--color-primary)] bg-[var(--color-primary)]/5 px-3 py-2 text-sm text-[var(--color-text-secondary)]">
        <span className="font-medium text-[var(--color-primary)]">Solution: </span>
        {solution}
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">{demo}</p>
    </div>
  );
}

function RevenueCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
      <h3 className="mb-1 font-semibold text-[var(--color-text)]">{title}</h3>
      <p className="text-sm text-[var(--color-text-muted)]">{description}</p>
    </div>
  );
}
