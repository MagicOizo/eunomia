import { describe, expect, it, vi } from 'vitest';

import { HttpError } from '../lib/http';
import { CREATE_KINDS, type CreateKind, useEntityCreate } from './entity-create';

const { createResource } = vi.hoisted(() => ({ createResource: vi.fn() }));

vi.mock('../lib/resource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/resource')>()),
  createResource,
}));

function setup() {
  const created: { kind: CreateKind; value: string; label: string }[] = [];
  const create = useEntityCreate((kind, option) => created.push({ kind, ...option }));
  return { create, created };
}

describe('useEntityCreate', () => {
  it('opens the right resource form, seeded with the typed name', () => {
    const { create } = setup();
    create.start('agency', 'Inkasso Nord');
    expect(create.open.value).toBe(true);
    expect(create.kind.value).toBe('agency');
    expect(create.prefill.value).toEqual({ agencyName: 'Inkasso Nord' });
    expect(CREATE_KINDS.agency.config.singular).toBe('Abrechnungsdienstleister');
  });

  it('hands the saved row back as a picker option and closes', async () => {
    createResource.mockResolvedValue({ facilityUID: 'f-9', facilityName: 'Praxis Süd' });
    const { create, created } = setup();
    create.start('facility', 'Praxis Süd');
    await create.submit({ facilityName: 'Praxis Süd' });

    expect(createResource).toHaveBeenCalledWith('/facilities', { facilityName: 'Praxis Süd' });
    expect(created).toEqual([{ kind: 'facility', value: 'f-9', label: 'Praxis Süd' }]);
    expect(create.open.value).toBe(false);
    expect(create.busy.value).toBe(false);
    expect(create.error.value).toBeNull();
  });

  it('stays open and says why when the row cannot be saved', async () => {
    createResource.mockImplementation(() => {
      throw new HttpError(409, 'DUPLICATE_VALUE', 'duplicate');
    });
    const { create, created } = setup();
    create.start('facility', 'Praxis Nord');
    await create.submit({ facilityName: 'Praxis Nord' });

    expect(created).toEqual([]);
    expect(create.open.value).toBe(true);
    expect(create.busy.value).toBe(false);
    expect(create.error.value).toBe('Es gibt bereits einen Eintrag mit diesem Wert.');
  });
});
