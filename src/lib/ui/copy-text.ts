/**
 * Copy text to the clipboard, saying whether it worked.
 *
 * The async clipboard is refused in more places than it is missing: an
 * embedded browser, a page whose permission was denied, some extension
 * setups. Both share buttons swallowed that refusal, so a click did nothing
 * at all. The older selection copy still works in most of those places, so
 * it is tried next; false means neither did, and the caller must say so.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    // Some browsers neither grant nor refuse, and the promise never settles; a second is plenty for a real copy.
    await Promise.race([navigator.clipboard.writeText(text), new Promise((_, reject) => window.setTimeout(() => reject(new Error('clipboard timeout')), 1000))]);
    return true;
  } catch {
    /* Refused, unavailable or stuck: try the selection copy. */
  }
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.top = '0';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    return copied;
  } catch {
    return false;
  }
}

/** The copy shortcut on this device, for the hint shown when copying failed. */
export function copyShortcut(): string {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘C' : 'Ctrl+C';
}
