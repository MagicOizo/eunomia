/**
 * What API and web share: the rules and names that would otherwise have to be
 * written down twice and kept in step by hand (see Notes/eunomia-plan.md, 2.2 "Repo-Struktur").
 * Both apps import from the package root; the modules are split by subject, not
 * by which app happens to use them.
 *
 * The line for this package is narrow on purpose: a name both sides spell, or a
 * rule both sides apply. Everything one side alone decides — how a status looks,
 * how a row is read from the database — stays in that app.
 */

export * from './contract-enums.js';
export * from './error-codes.js';
export * from './format.js';
export * from './http-url.js';
export * from './invoice-status.js';
export * from './locale.js';
export * from './payment-details.js';
export * from './payment-state.js';
export * from './permissions.js';
export * from './settings-keys.js';
export * from './trash.js';
