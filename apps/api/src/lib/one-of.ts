/**
 * Narrowing a value the database answered to the set of values the application
 * knows — with a check, not with an assertion (CR-19).
 *
 * Several columns hold a vocabulary that only the API ever writes, validated
 * there against the very same list (`@eunomia/shared`), but the column itself
 * is a `VARCHAR`: the database would take any string. An assertion would carry
 * a wrong value straight into the calculation that reads it; this reads it
 * once and says so when it is not one of the values.
 */

/**
 * Returns `value` as one of `values`, or throws. The throw is deliberately not
 * an `ApiError`: a stored value outside the vocabulary is a defect in the data,
 * not something a client did, so it travels the 500 path and the error handler
 * logs it with its own event — a quiet miscalculation is the one outcome worth
 * avoiding here. `what` names the column, so the log says which one it was.
 */
export function oneOf<T extends string>(values: readonly T[], value: unknown, what: string): T {
  // Returns the value FROM the list, not the one that came in: that way the
  // narrowing is the comparison itself and this helper needs no assertion of
  // its own, which would only have moved the problem to one place.
  for (const candidate of values) {
    if (candidate === value) return candidate;
  }
  throw new Error(`${what} holds ${JSON.stringify(value)}, which is none of: ${values.join(', ')}`);
}
