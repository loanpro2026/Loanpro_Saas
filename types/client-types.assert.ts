/**
 * Compile-time assertion that the Supabase client actually resolves the
 * database types. Nothing imports this file; it exists to be type-checked.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * `@supabase/ssr` 0.6.1 declared its return as:
 *
 *     SupabaseClient<Database, SchemaName, Schema>
 *
 * but supabase-js 2.106 reordered that generic list to:
 *
 *     SupabaseClient<Database, SchemaNameOrClientOptions, SchemaName, Schema, ClientOptions>
 *
 * so the schema object landed in the `SchemaName` slot, which is constrained
 * to `string & keyof Database`. Inference collapsed and every query row became
 * `never` — `Property 'tenant_id' does not exist on type 'never'`.
 *
 * The versions drifted apart on their own. `^0.6.1` cannot cross to 0.12,
 * because a caret on a 0.x version is pinned to that minor, while `^2.49.4`
 * happily walked forward to 2.106. Nothing warned: ssr's peer range still
 * nominally allowed it.
 *
 * None of this was visible while `types/supabase.ts` was a placeholder that
 * ended in `export type Database = any`, because `any` swallows the failure.
 * It only surfaced the moment real types arrived.
 *
 * So the pairing is a real constraint, not a preference:
 *
 *     @supabase/ssr        ^0.12.4    (peer: supabase-js ^2.111.0)
 *     @supabase/supabase-js ^2.111.0
 *
 * If someone upgrades one without the other, the build fails here with a
 * pointed message instead of a confusing `never` in whichever page happens to
 * be compiled first.
 */
import type { createServerClient } from '@supabase/ssr'
import type { Database } from './supabase'

type Client = ReturnType<typeof createServerClient<Database>>

/**
 * Never called — it takes the client as a parameter rather than constructing
 * one, so there is no runtime cost and no credentials involved. Its only job
 * is to be type-checked.
 *
 * It has to run a real query. Reading `Database['public']['Tables']` directly
 * would not catch the bug: the schema type is fine on its own, and only
 * collapses when the client's generics resolve it. An earlier version of this
 * file asserted against the schema type and passed happily on the broken
 * version pair, which made it worse than useless.
 */
export async function __assertSupabaseTypesResolve(client: Client) {
  const { data: user } = await client
    .from('users')
    .select('tenant_id')
    .eq('auth_id', '')
    .single()

  // If the generics are mismatched, `user` is `never` and this line fails with
  // "Property 'tenant_id' does not exist on type 'never'".
  const tenantId: string | undefined = user?.tenant_id

  // Same check through a `select('*')`, which resolves differently.
  const { data: rows } = await client.from('cash_transactions').select('*')
  const amount: number | undefined = rows?.[0]?.amount

  // And through an RPC, whose return type comes from a different code path.
  const { data: found } = await client.rpc('search_loans', { p_query: '' })
  const name: string | null | undefined = found?.[0]?.name

  return { tenantId, amount, name }
}
