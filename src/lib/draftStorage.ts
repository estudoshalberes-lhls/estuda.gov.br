const DRAFT_STORAGE_PREFIX = 'central_estudos_field_draft_v1:';

export function readFieldDraft<T>(recordKey: string): T | null {
  if (!recordKey || typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${recordKey}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeFieldDraft<T>(recordKey: string, value: T): void {
  if (!recordKey || typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(`${DRAFT_STORAGE_PREFIX}${recordKey}`, JSON.stringify(value));
  } catch {
    // ignore storage quota errors
  }
}

export function clearFieldDraft(recordKey: string): void {
  if (!recordKey || typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${recordKey}`);
  } catch {
    // ignore storage errors
  }
}
