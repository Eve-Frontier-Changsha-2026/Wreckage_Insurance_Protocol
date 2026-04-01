/** Validate a Sui object ID or address (0x + 1-64 hex chars). */
export function isValidObjectId(id: string): boolean {
  return /^0x[0-9a-fA-F]{1,64}$/.test(id);
}

/** Parse a SUI amount string, returning 0 for any invalid/negative/non-finite input. */
export function safeParseSui(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
