import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../stores/project-store";
import { useSettingsStore } from "../stores/settings-store";
import { analyzeStory, enrichStory } from "../engine/analyze-story";
import { matchVoicesForCharacter } from "../engine/voice-matcher";
import type { VoiceMatches, StoredVoiceMatch } from "../stores/project-store";

export default function ProcessingView() {
  const storyText = useProjectStore((s) => s.storyText);
  const setCharacters = useProjectStore((s) => s.setCharacters);
  const setSegments = useProjectStore((s) => s.setSegments);
  const setEnrichment = useProjectStore((s) => s.setEnrichment);
  const setVoiceMatches = useProjectStore((s) => s.setVoiceMatches);
  const setView = useProjectStore((s) => s.setView);
  const [status, setStatus] = useState("Starting analysis...");
  const [pass, setPass] = useState<1 | 2 | 3>(1);
  const [partial, setPartial] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const scrollRef = useRef<HTMLPreElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Elapsed timer
  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (running.current) return;
    running.current = true;

    const settings = useSettingsStore.getState();

    async function run() {
      setStatus("Connecting to AI...");

      try {
        const result = await analyzeStory({
          storyText,
          ttsProvider: settings.ttsProvider,
          llmProvider: settings.llmProvider,
          llmApiKey: settings.llmApiKey,
          llmBaseUrl: settings.llmBaseUrl,
          llmModel: settings.llmModel,
          onToken: (text) => {
            setPartial(text);
            setStatus("Response received, parsing...");
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
          },
          onLog: (msg) => {
            setLogs((prev) => [...prev, msg]);
            // Update status based on log content
            if (msg.includes("initialized")) {
              setStatus(
                "AI is analyzing your story. This may take 30 to 60 seconds...",
              );
            } else if (msg.includes("Spawning")) {
              setStatus("Starting AI...");
            } else if (msg.includes("Hook")) {
              setStatus("Preparing environment...");
            }
            if (logRef.current) {
              logRef.current.scrollTop = logRef.current.scrollHeight;
            }
          },
          onTokenCount: () => {},
        });

        setCharacters(result.characters);
        setSegments(result.segments);

        // Pass 2: Enrichment (relationships + voice profiles)
        setPass(2);
        setPartial("");
        setStatus("Enriching characters (relationships & voice profiles)...");

        try {
          const enrichment = await enrichStory({
            characters: result.characters,
            segments: result.segments,
            onToken: (text) => {
              setPartial(text);
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }
            },
            onLog: (msg) => {
              setLogs((prev) => [...prev, msg]);
              if (msg.includes("initialized")) {
                setStatus("AI is generating relationships & voice profiles...");
              }
              if (logRef.current) {
                logRef.current.scrollTop = logRef.current.scrollHeight;
              }
            },
          });

          setEnrichment(enrichment);
        } catch (err) {
          // Enrichment failure is non-fatal — continue to editor
          const msg = err instanceof Error ? err.message : "Enrichment failed";
          setLogs((prev) => [...prev, `Enrichment skipped: ${msg}`]);
        }

        // Pass 3: Voice matching
        setPass(3 as 1 | 2);
        setStatus("Matching voices for each character...");

        try {
          const matches: VoiceMatches = {};
          for (const char of result.characters) {
            setStatus(`Matching voice for ${char.name}...`);
            const matchResult = await matchVoicesForCharacter(char);
            // Store top 20 for browser, top 3 shown in sidebar
            matches[char.name] = matchResult.all.slice(0, 20).map((sv): StoredVoiceMatch => ({
              voice_id: sv.voice.voice_id,
              name: sv.voice.name,
              gender: sv.voice.gender,
              age: sv.voice.age,
              accent: sv.voice.accent,
              descriptive: sv.voice.descriptive,
              description: sv.voice.description,
              preview_url: sv.voice.preview_url,
              category: sv.voice.category,
              score: sv.score,
              reasons: sv.reasons,
            }));
          }
          setVoiceMatches(matches);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Voice matching failed";
          setLogs((prev) => [...prev, `Voice matching skipped: ${msg}`]);
        }

        setStatus("Preparing editor...");
        await new Promise((r) => setTimeout(r, 500));
        setView("editor");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Analysis failed";
        if (
          msg.includes("ERR_CONNECTION_REFUSED") ||
          msg.includes("Failed to fetch")
        ) {
          setError(
            "Dev API not running. Start it in another terminal:\n\nnpm run dev:api",
          );
        } else {
          setError(msg);
        }
      }
    }

    run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  if (error) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
        <div className="mb-4 text-4xl">&#9888;</div>
        <h2 className="mb-2 text-xl font-semibold">Analysis failed</h2>
        <p className="mb-6 whitespace-pre-line text-[var(--color-text-secondary)]">
          {error}
        </p>
        <button
          onClick={() => setView("input")}
          className="rounded-lg bg-[var(--color-primary)] px-6 py-2 font-medium text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)]"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-4 py-8">
      <div className="mb-6 flex items-center gap-4">
        <div className="h-10 w-10 shrink-0 animate-spin rounded-full border-4 border-[var(--color-border)] border-t-[var(--color-primary)]" />
        <div>
          <h2 className="text-lg font-semibold">
            {pass === 1 ? "Pass 1: Analyzing your story" : pass === 2 ? "Pass 2: Enriching characters" : "Pass 3: Matching voices"}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {status}
            <span className="ml-2 text-[var(--color-text-muted)]">
              ({timeStr})
            </span>
          </p>
        </div>
      </div>

      {/* Log stream */}
      {logs.length > 0 && (
        <div
          ref={logRef}
          className="mb-4 max-h-32 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
        >
          {logs.map((msg, i) => (
            <p
              key={i}
              className="text-xs leading-relaxed text-[var(--color-text-muted)]"
            >
              <span className="text-[var(--color-text-secondary)]">
                &rsaquo;
              </span>{" "}
              {msg}
            </p>
          ))}
        </div>
      )}

      {/* Token stream / waiting indicator */}
      {partial ? (
        <pre
          ref={scrollRef}
          className="max-h-80 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] p-4 text-xs leading-relaxed text-[var(--color-text-muted)] whitespace-pre-wrap break-words"
        >
          {partial}
          <span className="animate-pulse text-[var(--color-primary)]">▊</span>
        </pre>
      ) : (
        logs.some((l) => l.includes("initialized")) && (
          <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-primary)] [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-primary)] [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-primary)] [animation-delay:300ms]" />
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              AI is thinking. The local CLI does not stream tokens, so the
              response will appear all at once
            </p>
          </div>
        )
      )}
    </div>
  );
}
