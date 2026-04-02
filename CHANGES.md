# CHANGES.md

Session log with progressive tracking. Every session creates a **started** entry at the
beginning, **progress** lines as work happens, and a **completed** entry at the end.
If a session is interrupted, the next session sees the orphaned "started" entry plus any
progress lines — so it knows exactly what was done.

**Start entry (write before doing any work):**

```
## [YYYY-MM-DDTHH:MM] session-<id> | status: started | mode: full|lean | type: add|fix|refactor|chore
intent: One line describing what this session will do
```

**Progress lines (append after each logical unit of work):**

```
- progress: <what was done> | <files touched>
- progress: Replaced OldThing with NewThing | src/foo.ts (removed: OldThing)
```

**End entry (write when work is done):**

```
## [YYYY-MM-DDTHH:MM] session-<id> | status: completed | mode: full|lean | type: add|fix|refactor|chore
files_touched: path/to/file.ts, path/to/other.ts
symbols_added: FunctionName, ClassName
symbols_removed: OldFunction, DeprecatedClass
tests_added: path/to/test.ts
reason: One sentence. Note whether removed symbols were cleaned up or left for later.
health_snapshot: LOC=<n>, tests=<n>, complexity=ok|warn|fail
```

**Rules:**

- Write the **started** entry first — before doing any work.
- **Log progress as you go** — after each completed chunk, before moving to the next task.
- Write the **completed** entry when you finish — `symbols_removed` is mandatory if you deleted code.
- Note removed symbols in progress lines: `(removed: SymbolName)` — feeds dead code detection.
- Use the same `session-<id>` for both start and end entries.
- `tests_added` is required for `type: fix` — every fix needs a regression test.
- Do not edit past entries. Append only.
- See `.kit/changelog-protocol.md` for full details.

---

<!-- Entries below — newest at bottom -->

## [2026-04-03T10:00] session-elevenlabs-demo | status: started | mode: lean | type: add

intent: Add ElevenLabs TTS integration, demo audio generation script, and dedicated Demo page with PoC banner

- progress: Created ElevenLabs TTS engine with voice fetching, matching, synthesis, preview, and full generation | src/engine/tts-elevenlabs.ts
- progress: Wired ElevenLabs into GeneratingView (replaced hard-stop error) | src/components/GeneratingView.tsx
- progress: Added ElevenLabs voice preview to CharacterSidebar, extracted VoiceOptions component | src/components/CharacterSidebar.tsx, src/components/VoiceOptions.tsx
- progress: Created demo types and generation script with "The Last Lighthouse" story | src/types/demo.ts, scripts/generate-demo-audio.ts, package.json
- progress: Built Hume AI TTS engine with voice fetching, synthesis, preview, generation | src/engine/tts-hume.ts
- progress: Wired Hume AI into GeneratingView and CharacterSidebar | src/components/GeneratingView.tsx, src/components/CharacterSidebar.tsx, src/components/VoiceOptions.tsx
- progress: Updated demo script to use Hume AI instead of ElevenLabs | scripts/generate-demo-audio.ts
- progress: Marked ElevenLabs as disabled (coming soon) in TTS provider selectors | src/stores/settings-store.ts, src/components/EditorView.tsx, src/components/StoryInput.tsx
- progress: Built DemoPage with PoC banner + 3 stages, DemoPlayer, routing | src/components/DemoPage.tsx, src/components/DemoPlayer.tsx, src/App.tsx, src/stores/project-store.ts, src/components/LeftSidebar.tsx
- progress: Fixed Hume prompt (removed [pause] tags), added trailing_silence support, trailingSilence on TextSegment | src/engine/prompts.ts, src/engine/tts-hume.ts, src/stores/project-store.ts
- progress: Created static Hume voice data (95 presets) and voice assignment store | src/data/hume-voices.ts, src/stores/voice-assignment-store.ts
- progress: Built voice selection UX: VoiceConflictDialog, PresetVoiceBrowser, rewrote VoiceOptions with matching + exclusivity | src/components/VoiceConflictDialog.tsx, src/components/PresetVoiceBrowser.tsx, src/components/VoiceOptions.tsx
- progress: Simplified CharacterSidebar from 372 to 223 LOC by using self-contained VoiceOptions | src/components/CharacterSidebar.tsx (removed: old TTS provider branching, voice fetching, play callbacks)
- progress: Replaced demo story with "The Open Window" by Saki, 7 characters, 32 segments | scripts/generate-demo-audio.ts
- progress: Updated DemoPage Stage 2 subtitle to highlight distinct AI voices | src/components/DemoPage.tsx
- progress: Created analyze-demo-story.ts to run story through LLM extraction via dev API | scripts/analyze-demo-story.ts, scripts/demo-story.txt
- progress: Created scrape-hume-voices.ts to enrich voice metadata with gender/age/accent | scripts/scrape-hume-voices.ts
- progress: Made DemoPage gracefully handle missing audio (shows character cards + pending message) | src/components/DemoPage.tsx
- progress: Fixed server prompt for Hume (removed pause tags, added phonetic rewrite guidance) | server/prompts.ts
- progress: Rewrote DemoPage as editor-style layout with CharacterSidebar, segment rows with badges | src/components/DemoPage.tsx
- progress: Added author link to Project Gutenberg source | src/components/DemoPage.tsx
- progress: Created emotion-icons utility for differentiating icons per emotion/inflection category | src/utils/emotion-icons.ts, src/components/DemoPage.tsx, src/components/EditorView.tsx
- progress: Improved narrator voice matching (boost narrator keywords, no gender penalty for unknown) | src/components/VoiceOptions.tsx
- progress: Added gender/age/accent filters and metadata tags to PresetVoiceBrowser | src/components/PresetVoiceBrowser.tsx, src/components/VoiceOptions.tsx
- progress: Updated prompts for audiobook-style segmentation (attribution as separate narrator segments) | server/prompts.ts, src/engine/prompts.ts
- progress: Updated hume-voices.ts with enriched metadata (gender, age, accent) for 96 voices | src/data/hume-voices.ts
- progress: Added live voice tuning (de-esser, tone/brightness) via Web Audio API | src/utils/audio-player.ts, src/components/VoiceOptions.tsx
- progress: Switched primary TTS to ElevenLabs (MOS 4.8) after Hume sibilance issues | src/stores/settings-store.ts, server/prompts.ts, src/engine/prompts.ts
- progress: Rewrote ElevenLabs prompt with inline tags, phoneme pronunciation, pacing control | server/prompts.ts
- progress: Added ElevenLabs sample generation script | scripts/generate-elevenlabs-samples.ts
- progress: Fixed demo page creating Untitled project on reload (loadDemoData bypasses autoSave) | src/stores/project-store.ts, src/components/DemoPage.tsx
- progress: Switched to eleven_v3 model with audio tag support | src/engine/tts-elevenlabs.ts, scripts/generate-elevenlabs-samples.ts
- progress: Generated narrator samples (Theo Silk, Jane, Allison) + Vera samples (Emmaline, Shelley, Emilia) | public/demo/samples/
- progress: Cached 100 ElevenLabs british male community voices for later scoring | scripts/elevenlabs-voices-british-male.json

## [2026-04-05T10:00] session-settings-analysis | status: started | mode: lean | type: add
intent: Add per-segment settings system with three-tier merge (default/analyzed/user), deviation tracking, and analysis report UI
- progress: Extracted DemoSegmentRow into own file, created StoryTextModal, added "Full Text" button. DemoPage 675→317 LOC | src/components/DemoPage.tsx, src/components/DemoSegmentRow.tsx, src/components/StoryTextModal.tsx
- progress: Added segment settings types (TrackedValue, SegmentSettings, DeviationReport), SETTING_META to audio-processor, Zustand settings store with 3-tier merge | src/types/segment-settings.ts, src/stores/segment-settings-store.ts, src/engine/audio-processor.ts
- progress: Added rule-based segment analyzer (emotion/inflection-aware gap, LUFS, fade optimization), wired to DemoPage on load | src/engine/segment-analyzer.ts, src/components/DemoPage.tsx
- progress: Added SettingSlider + SegmentSettingsPanel replacing hardcoded auto-processing block, origin badges, theme tokens | src/components/SettingSlider.tsx, src/components/SegmentSettingsPanel.tsx, src/components/DemoSegmentRow.tsx, src/index.css
- progress: Added DeviationReport modal (per-speaker patterns, voice source badges, summary cards), extracted demo-loader utils, DemoPage 340→292 LOC | src/components/DeviationReport.tsx, src/utils/demo-loader.ts, src/components/DemoPage.tsx
- progress: Fixed infinite loop in DeviationReport (getReport selector), added readOnly mode for demo sliders with tooltip | src/components/DeviationReport.tsx, src/components/SettingSlider.tsx, src/components/SegmentSettingsPanel.tsx, src/components/DemoSegmentRow.tsx
- progress: Enabled slider editing in demo for testing, wired Export Audiobook button (decode→process→assemble→WAV download with progress) | src/components/DemoPage.tsx, src/components/DemoSegmentRow.tsx, src/utils/export-audiobook.ts
- progress: Researched ElevenLabs SFX/Music APIs, CC0 sources, waveform rendering, multi-track architecture. Full audio mixer plan written | .claude/plans/audio-mixer-timeline.md
- progress: Enhanced DeviationReport with CharacterDiff (collapsible field comparison table) and SegmentDiff (per-segment audio+content settings with origin badges) | src/components/DeviationReport.tsx, src/components/CharacterDiff.tsx, src/components/SegmentDiff.tsx, src/components/DemoPage.tsx
- progress: Built Audio Mixer: 4-track timeline (speakers/noise/music/sfx), canvas waveforms, ruler with timestamps, zoom slider, progressive async loading, click-to-seek | src/components/AudioMixerView.tsx, src/components/MixerTrack.tsx, src/components/MixerRuler.tsx, src/components/MixerToolbar.tsx, src/stores/mixer-store.ts, src/utils/peak-utils.ts
- progress: Added drag-to-move speaker segments (updates gapBeforeMs in settings store), arrow key nudge ±50ms, bidirectional binding | src/components/MixerTrack.tsx
- progress: Added mixer playback engine (Web Audio scheduled sources, cursor animation, play/pause/stop transport) | src/utils/mixer-playback.ts, src/components/MixerToolbar.tsx, src/components/AudioMixerView.tsx
- progress: Refactored DeviationReport into 6-tab layout (Overview/Text/Characters/Segments/SFX/Music), virtual scroll on segments, text comparison view | src/components/DeviationReport.tsx, src/components/ReportTextTab.tsx, src/components/DemoPage.tsx
- progress: Mixer phases D+E+F: music/SFX track upload+drag+delete, multi-track export (speakers+noise→WAV with current settings) | src/components/MixerRegionPanel.tsx, src/components/MixerTrack.tsx, src/components/MixerToolbar.tsx, src/utils/mixer-export.ts
- progress: Mixer polish: overflow fix, zoom label, draggable scrollbar, 50/sec peaks, streaming playback, prev-boundary jump, AI Mixing tab | multiple files
- progress: LLM-powered mixing analysis: prompt + endpoint, client engine, word anchor resolver, auto-placement, sound store/sidebar, demo data script | server/prompts.ts, server/dev-api.ts, src/engine/analyze-mixing.ts, src/utils/word-position.ts, src/utils/auto-place.ts, src/stores/sound-store.ts, src/components/SoundSidebar.tsx, src/components/AnalysisMixingTab.tsx
- progress: Research-optimized prompts (music 16w, sfx 12w), loop=true API param, audio persistence IndexedDB, demo sound files in repo, Settings Report tabs, manual % stat | multiple files
- progress: Region edit panel (volume/fade/loop/start/end), right-click context menu (portal), live waveform scaling, fade envelope playback, duplicate menu fix | multiple files
- progress: Wider modal (max-w-4xl), bumped all text sizes, virtual scroll on Text tab, added CharacterEditModal (all fields editable, saves to project store) | src/components/DeviationReport.tsx, src/components/CharacterEditModal.tsx, src/components/CharacterDiff.tsx, src/components/ReportTextTab.tsx, src/components/SegmentDiff.tsx, src/components/DemoPage.tsx
- progress: Moved character edit from report to sidebar (report is read-only analysis), fixed nested button HTML violation, pencil icon on hover | src/components/CharacterSidebar.tsx, src/components/CharacterDiff.tsx, src/components/DeviationReport.tsx, src/components/DemoPage.tsx

## [2026-04-06T10:00] session-mixer-polish | status: started | mode: lean | type: fix
intent: Fix mixer audio playback, waveform reactivity, loop visual, audio variety review, and general polish
- progress: Fixed mixer audio playback — added 2.5x gain boost for music/SFX regions (matching preview), dev-mode console warnings for missing audio, proper error logging in decode path. Fixed mixer export to actually mix region audio from sound store blobs. | src/utils/mixer-playback.ts, src/utils/mixer-export.ts
- progress: Speaker waveform in mixer now reacts to settings changes — LUFS scaling + micro-fade envelope applied visually. MixerTrack subscribes to settingsState. | src/components/MixerTrack.tsx
- progress: Loop visual toggle: toggling loop off shrinks region to clip duration, on restores placement span. Added clipDurationMs + placementDurationMs to MixerRegion. | src/stores/mixer-store.ts, src/utils/auto-place.ts, src/components/AudioMixerView.tsx, src/components/SoundSidebar.tsx
- progress: Drag-and-drop from Sound sidebar to mixer timeline. Music/SFX items are draggable, mixer tracks accept drops with visual highlight, creates region at drop position. | src/components/SoundSidebar.tsx, src/components/MixerTrack.tsx
- progress: Settings Report Music/SFX tabs now show user changes in amber — compares mixer region values (volume, fade) against AI suggestions. | src/components/DeviationReport.tsx
- progress: Reviewed audio variety — piano bias appropriate for Edwardian setting, 5 SFX covers key beats, no regen needed
- progress: Zoomed-out bar rendering works correctly at extreme zoom (< 1px/s), no fix needed
- progress: Live mixing — volume/fade changes on regions take effect immediately during playback via gain node subscription. Fixed waveform tiling — peaks use constant clipDurationMs spacing, loop toggle only changes duration not bar width. Loop cycle markers shown as dashed lines. | src/utils/mixer-playback.ts, src/components/MixerTrack.tsx
- progress: Music volume slider range 0-20% (was 0-100%), ruler click-to-seek during playback, removed Loop Duration from report (not user-controllable), added Fade Out comparison. | src/components/AudioMixerView.tsx, src/components/MixerRuler.tsx, src/utils/mixer-playback.ts, src/components/DeviationReport.tsx
- progress: Lowered music/SFX volume range to 2-5% (was 15-60%). Updated LLM prompt (music 0.02-0.05, SFX 0.03-0.08), example JSON, demo manifest, slider max 10%, report defaults. Background audio should barely be perceptible. | server/prompts.ts, src/components/AudioMixerView.tsx, src/components/DeviationReport.tsx, public/demo/manifest.json
- progress: Tail artifact detection — auto-detects trailing clicks/pops/breaths in segment audio, sets earlyStopMs as analyzed setting. Input field (not slider) for precise adjustment 0-500ms. Applied before fade-out so fade ends at early stop point. | src/engine/audio-processor.ts, src/types/segment-settings.ts, src/stores/segment-settings-store.ts, src/components/SegmentSettingsPanel.tsx, src/components/DemoPage.tsx, src/utils/use-processed-segment.ts, src/utils/mixer-export.ts, src/components/DemoPlayer.tsx
- progress: Raw JSON tab now shows mixing analysis (Pass 3) and all sections are collapsible with counts | src/components/AnalysisModal.tsx
- progress: Moved tail detection to one-time pre-computed step (script), removed from page load. Improved detector: catches end clicks (seg-17), dip-then-rise (seg-7), isolated spikes. 16/63 segments optimized. Early stop input now matches SettingSlider grid layout. Duration before badge in header. | src/engine/audio-processor.ts, src/components/SegmentSettingsPanel.tsx, src/components/DemoPage.tsx, src/types/demo.ts, scripts/optimize-demo-audio.ts, public/demo/manifest.json
- progress: Unified settings layout — early stop is now a regular slider, all setting values are click-to-edit for precise input, header has "Reset all" button aligned to reset column, duration before badge | src/components/SettingSlider.tsx, src/components/SegmentSettingsPanel.tsx
- progress: earlyStopMs now live-affects mixer: shortens segment duration, shifts subsequent segments forward, truncates waveform peaks, limits playback duration. Input padding fix. Zoomed-out bars use solid color + 2px min width. | src/stores/mixer-store.ts, src/components/AudioMixerView.tsx, src/components/MixerTrack.tsx, src/utils/mixer-playback.ts, src/components/SettingSlider.tsx
- progress: Replaced trim settings with fade system — fadeIn/Out Ms + fadeIn/Out Strength (curve shape). Power-curve fades (linear→aggressive). Auto-detected from audio onset/tail energy. Visible in mixer waveform. Zoom-out scroll clamp fix. 62/63 segments auto-optimized. | src/types/segment-settings.ts, src/engine/audio-processor.ts, src/engine/segment-analyzer.ts, src/stores/segment-settings-store.ts, src/stores/mixer-store.ts, src/components/MixerTrack.tsx, src/components/SegmentSettingsPanel.tsx, src/utils/use-processed-segment.ts, src/utils/mixer-export.ts, src/components/DemoPlayer.tsx, scripts/optimize-demo-audio.ts, public/demo/manifest.json
- progress: Simplified volume system — removed 2.5x gain boost, volume values are now direct gain (7%=0.07). Slider 0-20%, defaults music=7% sfx=10%. Fixed sidebar preview boost. Updated LLM prompt + report defaults. | src/utils/mixer-playback.ts, src/utils/mixer-export.ts, src/components/AudioMixerView.tsx, src/components/SoundSidebar.tsx, src/components/DeviationReport.tsx, server/prompts.ts, public/demo/manifest.json
- progress: Add All to Mixer works without opening mixer first — extracted shared segment loader, segmentAudioUrls in project store. Improved early stop detection: requires 15ms+ of genuine silence before flagging dip-then-rise (seg-18 false positive fixed, 16→9 early stops). | src/utils/load-mixer-segments.ts, src/stores/project-store.ts, src/components/AudioMixerView.tsx, src/components/SoundSidebar.tsx, src/components/DemoPage.tsx, src/engine/audio-processor.ts, scripts/optimize-demo-audio.ts, public/demo/manifest.json
- progress: Demo auto-places music/SFX regions on mixer timeline at load — waits for sounds to finish loading, loads mixer segments, then auto-places all regions. No user action needed. | src/components/DemoPage.tsx
- progress: Export dropdown with two options: Export Voiceline (voices+noise) and Export Audiobook (full mix with music/SFX). Fixed seek scheduling error (negative regionEndTime). | src/components/DemoPage.tsx, src/utils/export-audiobook.ts, src/utils/mixer-playback.ts
- progress: Fixed pause/seek not clearing sound (playback generation counter, gain node cleanup). Added Check 4 to tail detector: non-monotonic decay detects TTS trailing artifacts where energy drops then rises (seg-7 now detected at 36ms). | src/utils/mixer-playback.ts, src/engine/audio-processor.ts, scripts/optimize-demo-audio.ts, public/demo/manifest.json
- progress: Deep TTS research — updated prompts to enforce sentence-final punctuation (never trailing commas/semicolons), added [pause] tail hint to synthesize(), send previous_text/next_text for future model stitching, higher stability for short segments, normalize trailing commas in API call. | server/prompts.ts, src/engine/tts-elevenlabs.ts
- progress: Regenerated all 44 changed segments with ElevenLabs. Clean endings + [pause] tail hint dramatically reduced artifacts: early stops 16→7 (56% reduction), most fade-outs now 8ms (clean tails). Fixed v3 doesn't support previous_text/next_text. Updated manifest with new analysis + audio optimizations. | scripts/regenerate-changed-segments.ts, src/engine/tts-elevenlabs.ts, public/demo/manifest.json, public/demo/audio/
- progress: Trailing silence detection — [pause] tag generates 1-2s silence, now auto-trimmed via earlyStopMs. Slider max raised to 3000ms. Show original/voice text in mixer selection panel. | src/engine/audio-processor.ts, scripts/optimize-demo-audio.ts, src/components/AudioMixerView.tsx, public/demo/manifest.json
- progress: Relative silence threshold (90th percentile speech × 8%) catches low-level TTS room tone. Regenerated all remaining 19 segments with [pause]. All 63/63 now have clean tails + optimized early stop. | src/engine/audio-processor.ts, scripts/optimize-demo-audio.ts, public/demo/audio/, public/demo/manifest.json
- progress: Audio tag optimization — replaced [drawn out] overuse with specific tags ([hushed], [measured], [tense], [matter-of-fact], [chanting]). Fixed singing line (seg-52), closing punchline (seg-63), dread approach (seg-51). Expanded tag palette in prompt with tone/combinable categories. 9 segments regenerated. | server/prompts.ts, public/demo/manifest.json, public/demo/audio/
- progress: Full regeneration of all 63 segments with style=0.2 (was 0.5) for inter-segment consistency. Tags handle expressiveness, lower style reduces variation. Re-ran full optimization pass. | src/engine/tts-elevenlabs.ts, scripts/regenerate-changed-segments.ts, public/demo/audio/, public/demo/manifest.json
- progress: Fixed trailing silence detection skipping end-spikes (seg-1 had 2s silence masked by end click). Skip last 100ms in scan, detect spikes separately. Fixed music waveform at low zoom (sub-pixel bars capped to 1px min, capped iterations). | src/engine/audio-processor.ts, scripts/optimize-demo-audio.ts, src/components/MixerTrack.tsx, public/demo/manifest.json

## [2026-04-07T08:30] session-export-fix | status: started | mode: lean | type: fix
intent: Fix MP3 export producing weird sounds — sample rate mismatch and missing per-segment settings in voiceline export

- progress: Fixed sample rate mismatch in mixer-export — hardcoded 44100 replaced with audioCtx.sampleRate. Cleaned unused imports (MixerSegment, MixerRegion, encodeWav), fixed doc comment (WAV→MP3). | src/utils/mixer-export.ts
- progress: Fixed voiceline export ignoring per-segment settings — now reads earlyStopMs/fades/LUFS from segment-settings store (matching mixer export behavior). Fixes tail artifacts in voiceline export. | src/utils/export-audiobook.ts
- progress: Added MP3 encoding test suite — verifies lamejs at 44100/48000Hz, silence, short input, float32→int16 conversion, Int8→Uint8 byte preservation. 6 tests. | tests/audio-export.test.ts
- progress: Deleted orphaned Header.tsx. Moved PresetVoice type from hume-voices.ts to types/voices.ts, made provider generic string. Deleted hume-voices.ts (HUME_PRESET_VOICES array was dead). Fixed "HUME_AI" provider strings → "elevenlabs". | src/components/Header.tsx (removed), src/data/hume-voices.ts (removed), src/types/voices.ts, src/components/VoiceOptions.tsx, src/components/PresetVoiceBrowser.tsx
- progress: Removed dead exports from tts-hume.ts (synthesizeFile, previewVoice, stopPreview) and tts-elevenlabs.ts (previewVoice, stopPreview). Made synthesize/SynthesizeOptions/HumeVoiceOption internal. | src/engine/tts-hume.ts, src/engine/tts-elevenlabs.ts
- progress: Added dist/ and dev scratch files to .gitignore. Rebuilt docs/ — build clean. | .gitignore
- progress: Design audit fixes: added :focus-visible outline, prefers-reduced-motion, skip link, <nav> landmark, semantic <button> replacing role="button", body text 14px→16px in HowItWorksPage | src/index.css, src/App.tsx, src/components/LeftSidebar.tsx, src/components/HowItWorksPage.tsx
- progress: Mobile responsiveness — sidebar drawer with overlay on <640px, hamburger menu, responsive padding (px-4 sm:px-6), flex-wrap button rows, right sidebars hidden on mobile, mixer desktop-only gate, responsive textarea/token bar/heading sizes | src/App.tsx, src/components/LeftSidebar.tsx, src/components/DemoPage.tsx, src/components/InvestorPage.tsx, src/components/HowItWorksPage.tsx, src/components/StoryInput.tsx, src/components/EditorView.tsx, src/components/PlaybackView.tsx, src/components/SurveyPage.tsx, src/components/CharacterSidebar.tsx, src/components/SoundSidebar.tsx, src/components/AudioMixerView.tsx
- progress: Mobile mixer transport bar — compact play/pause/restart/time on mobile, full timeline hidden sm:flex. Zoom controls desktop-only. Segment settings still accessible via per-row panels. Export buttons accessible in main flow. | src/components/AudioMixerView.tsx, src/components/MixerToolbar.tsx
- progress: Right sidebars as mobile drawers — CharacterSidebar and SoundSidebar slide in from right with overlay on mobile, inline on desktop. Width reduced w-80→w-72 (desktop), w-full (mobile drawer). RightDrawer component in DemoPage, same pattern in EditorView. | src/components/DemoPage.tsx, src/components/EditorView.tsx, src/components/CharacterSidebar.tsx, src/components/SoundSidebar.tsx
- progress: Analyzer fix pass — darkened muted text (#64748b→#5b6b7d) and primary (#0284c7→#0369a1) for 4.5:1+ contrast. Touch targets py-3 (44px+) on all sidebar items, selects, buttons. Added form labels (htmlFor + id) for textarea and selects. Scores: desktop 89→96(A), phone 87→96(A), tablet 79→85(B). | src/index.css, src/components/LeftSidebar.tsx, src/components/StoryInput.tsx, src/App.tsx
- progress: Hide dev-only providers on production — Local Dev (Claude CLI) and Browser TTS hidden on GitHub Pages. IS_DEV flag detects localhost/tunnel. Defaults to OpenRouter + ElevenLabs on production. | src/stores/settings-store.ts, src/components/StoryInput.tsx, src/components/EditorView.tsx
- progress: Deep audio review — reuse shared AudioContext in DemoPlayer (eliminates per-segment creation pops). Reordered pipeline: reverb before peak limit (catches reverb overshoot). Removed double-close race condition. | src/components/DemoPlayer.tsx, src/engine/audio-processor.ts
- progress: Added Cache API caching for all audio fetches — DemoPlayer, mixer playback, exports, peak loading, processed segments. Repeat plays/visits use cached MP3s. Falls back to normal fetch if Cache API unavailable. | src/utils/audio-cache.ts, src/components/DemoPlayer.tsx, src/utils/mixer-playback.ts, src/utils/export-audiobook.ts, src/utils/mixer-export.ts, src/utils/peak-utils.ts, src/utils/use-processed-segment.ts
