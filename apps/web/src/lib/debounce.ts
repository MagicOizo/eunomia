import { onScopeDispose } from 'vue';

/**
 * Wraps a callback so it only runs once the caller has been quiet for
 * `delayMs` — a filter that reloads on every keystroke would send a request
 * per typed character. The pending timer is dropped with the owning component,
 * so a closed dialog never fires a late search.
 */
export function useDebouncedCallback(callback: () => void, delayMs = 300): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  onScopeDispose(() => clearTimeout(timer));
  return () => {
    clearTimeout(timer);
    timer = setTimeout(callback, delayMs);
  };
}
