import { apiData, apiFetch } from '../lib/api';

/**
 * The trash API (Slice 39). One read for the whole page and two writes, both
 * addressed by the record's own public ID — the API reads the kind off its
 * prefix, so the client never has to name an entity.
 */

/** Something counted, already in the right German number ("2 Rechnungen"). */
export interface CountedDto {
  label: string;
  count: number;
}

export interface TrashEntryDto {
  uid: string;
  /** What the record is called: an invoice number, a person's name, an amount. */
  label: string;
  /** Where it belongs — may be empty. */
  context: string;
  /** Local time, or null for a record deleted before this version. */
  deletedAt: string | null;
  restorable: boolean;
  /** Why it cannot be restored, when it cannot. */
  restoreNote: string | null;
  /** Deleted records that go with it when it is removed for good. */
  attached: Array<{ singular: string; plural: string; label: string }>;
  /** Attached rows that are not records of their own (links, reminders, grants). */
  attachedRows: CountedDto[];
  /** How many records come back together with it. */
  restoresWith: number;
}

export interface TrashGroupDto {
  key: string;
  singular: string;
  plural: string;
  entries: TrashEntryDto[];
}

export async function loadTrash(): Promise<TrashGroupDto[]> {
  const { groups } = await apiData<{ groups: TrashGroupDto[] }>('/trash');
  return groups;
}

/** Brings the record — and what was deleted together with it — back. */
export async function restoreEntry(uid: string): Promise<number> {
  const { restored } = await apiData<{ restored: number }>(`/trash/${uid}/restore`, {
    method: 'POST',
  });
  return restored;
}

/** Removes the record for good, with everything that hangs on it. */
export async function purgeEntry(uid: string): Promise<void> {
  await apiFetch(`/trash/${uid}`, { method: 'DELETE' });
}
