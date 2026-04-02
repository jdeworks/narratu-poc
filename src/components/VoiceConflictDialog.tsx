interface Props {
  voiceName: string;
  assignedTo: string;
  onUseAnyway: () => void;
  onUnassignAndUse: () => void;
  onCancel: () => void;
}

export default function VoiceConflictDialog({
  voiceName,
  assignedTo,
  onUseAnyway,
  onUnassignAndUse,
  onCancel,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-sm font-semibold">Voice already assigned</h3>
        <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
          <strong>{voiceName}</strong> is currently assigned to{" "}
          <strong>{assignedTo}</strong>.
        </p>
        <div className="space-y-2">
          <button
            onClick={onUseAnyway}
            className="w-full cursor-pointer rounded-lg border border-[var(--color-border)] px-4 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]"
          >
            Use anyway (both characters share this voice)
          </button>
          <button
            onClick={onUnassignAndUse}
            className="w-full cursor-pointer rounded-lg border border-[var(--color-border)] px-4 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]"
          >
            Use and unassign from {assignedTo}
          </button>
          <button
            onClick={onCancel}
            className="w-full cursor-pointer rounded-lg px-4 py-2 text-center text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
