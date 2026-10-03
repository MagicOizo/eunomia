import { PERMISSIONS } from '@eunomia/shared';
import type { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import type { AppConfig } from '../config/env.js';
import { createMasterDataRouter } from '../crud/master-data-router.js';
import type { CrudTable } from '../crud/repository.js';

export const companiesTable: CrudTable = {
  table: 'InsuranceCompanies',
  uidColumn: 'companyUID',
  statusColumn: 'companyStatus',
  entity: 'company',
  columns: [
    'companyName',
    'addressStreet',
    'addressPostalCode',
    'addressCity',
    'serviceHotline',
    'url',
  ],
};

const base = z.object({
  companyName: z.string().trim().min(1).max(100),
  addressStreet: z.string().trim().min(1).max(255).nullish(),
  addressPostalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'Expected a 5-digit postal code')
    .nullish(),
  addressCity: z.string().trim().min(1).max(100).nullish(),
  serviceHotline: z.string().trim().min(1).max(30).nullish(),
  url: z.string().trim().url().max(255).nullish(),
});

/** CRUD router for insurance companies. */
export function createInsuranceCompaniesRouter(pool: Pool, config: AppConfig): Router {
  return createMasterDataRouter(pool, config, {
    table: companiesTable,
    resource: 'Insurance company',
    managePermission: PERMISSIONS.MANAGE_COMPANIES,
    createSchema: base,
    updateSchema: base.partial(),
  });
}
