# Windsurf rules
See AGENTS.md in the project root — that is the single source of truth.

## Progress tracking (no hooks — you must do this yourself)
Windsurf has no lifecycle hooks. You MUST manually follow these steps:

**Session start:** Read CHANGES.md for abandoned sessions and dead code signals. Write a `started` entry.

**During work:** After each completed chunk (fix, feature, refactor step), append a progress line:
```
- progress: <what was done> | <files touched>
```
Note removed symbols: `(removed: SymbolName)`. Do this before moving to the next task.

**After each progress line, commit.** Finish chunk → log progress → commit. Keep the tree clean: every file committed or gitignored.

**Session end:** Append a `completed` entry. See `.kit/changelog-protocol.md` for format.
