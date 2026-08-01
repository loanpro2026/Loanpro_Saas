/**
 * Narrowing helpers for `jsonb` values coming back from Postgres functions.
 *
 * Twenty-two of the RPCs are declared `RETURNS jsonb`, so their generated type
 * is `Json` — a union of object, array, string, number, boolean and null.
 * That is accurate: Postgres really can return any of those, and the Supabase
 * CLI generates exactly the same thing. But the app reads them as objects, so
 * every property access fails to compile against the union.
 *
 * The wrong fix is `as Record<string, unknown>`, which silences the compiler
 * and leaves a real crash in place: if a function ever returns null — which
 * several do, on a not-found path — the cast still says "object" and the next
 * property read throws at runtime, in a shop, mid-transaction.
 *
 * These check at runtime and fall back, so a null or unexpected shape produces
 * an empty object instead of an exception. Cheap, and it keeps the failure
 * boring.
 */
import type { Json } from '@/types/supabase'

/** A JSON object with unknown values. */
export type JsonObject = { [key: string]: Json | undefined }

/**
 * Narrow a `Json` to an object. Arrays, scalars, null and undefined all become
 * `{}` — deliberately, so callers can read properties without guarding first.
 */
export function asObject(value: Json | null | undefined): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}

/** Narrow a `Json` to an array. Anything else becomes `[]`. */
export function asArray(value: Json | null | undefined): Json[] {
  return Array.isArray(value) ? value : []
}

/**
 * Read a nested object off a `Json` value: `asObject(stock).cost` is
 * `Json | undefined`, which still cannot be indexed. This does both steps.
 */
export function objectAt(value: Json | null | undefined, key: string): JsonObject {
  return asObject(asObject(value)[key] ?? null)
}

/**
 * Numeric field off a JSON object, with a fallback.
 *
 * `Number(null)` is 0 and `Number(undefined)` is NaN, and NaN formatted as
 * currency renders "₹NaN" on the dashboard. This collapses both to the
 * fallback.
 */
export function numberAt(
  value: Json | null | undefined,
  key: string,
  fallback = 0
): number {
  const n = Number(asObject(value)[key])
  return Number.isFinite(n) ? n : fallback
}

/** String field off a JSON object, with a fallback. */
export function stringAt(
  value: Json | null | undefined,
  key: string,
  fallback = ''
): string {
  const v = asObject(value)[key]
  return typeof v === 'string' ? v : fallback
}
