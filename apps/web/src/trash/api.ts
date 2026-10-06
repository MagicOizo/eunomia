import type { AttachedRowKind, RecordKind, TrashPart } from '@eunomia/shared';

import { apiData, apiFetch } from '../lib/api';

/**
 * The trash API (Slice 39). One read for the whole page and two writes, both
 * addressed by the record's own public ID — the API reads the kind off its
 * prefix, so the client never has to name an entity.
 */

/** A record the trash names: its kind and what it is called. */
export interface TrashRefDto {
  kind: RecordKind;
  label: TrashPart;
}

export interface TrashEntryDto {
  uid: string;
  /** What the record is called: an invoice number, a person's name, an amount. */
  label: TrashPart;
  /** Where it belongs — may be empty. Put into words by `contextText`. */
  context: TrashPart[];
  /** Local time, or null for a record deleted before this version. */
  deletedAt: string | null;
  /** False for a kind that cannot come back at all (`notRestorableReason`). */
  restorable: boolean;
  /** Deleted records that go with it when it is removed for good. */
  attached: TrashRefDto[];
  /** Attached rows that are not records of their own (links, reminders, grants). */
  attachedRows: Array<{ kind: AttachedRowKind; count: number }>;
  /** How many records come back together with it. */
  restoresWith: number;
}

export interface TrashGroupDto {
  kind: RecordKind;
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
