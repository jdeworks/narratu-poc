let toastTimeout: ReturnType<typeof setTimeout> | null = null;

export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  showToast(`Copied: "${text.slice(0, 40)}${text.length > 40 ? "..." : ""}"`);
}

function showToast(message: string) {
  // Remove existing toast
  const existing = document.getElementById("copy-toast");
  if (existing) existing.remove();
  if (toastTimeout) clearTimeout(toastTimeout);

  const toast = document.createElement("div");
  toast.id = "copy-toast";
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: var(--color-text); color: var(--color-bg);
    padding: 8px 16px; border-radius: 8px; font-size: 13px;
    z-index: 9999; pointer-events: none; opacity: 0;
    transition: opacity 0.2s;
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => (toast.style.opacity = "1"));

  toastTimeout = setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  }, 1500);
}
