/**
 * PLACEHOLDER — regenerate this file against your real project.
 *
 *     npx supabase link --project-ref <your-ref>
 *     npm run db:types
 *
 * `lib/supabase/{client,server}.ts` import `Database` from here, so the build
 * fails outright without this file. It is typed loosely on purpose: a wrong
 * hand-written schema is worse than an honest `any`, because it would report
 * type-safety the queries do not actually have.
 *
 * Once generated, every `.from('loans')` call becomes properly typed and
 * several classes of bug (renamed column, wrong enum value) turn into compile
 * errors instead of runtime ones. Do this before Phase 1.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/** Tables present as of migration 005. Kept as a reminder of what to expect. */
export type TableName =
  | 'tenants'
  | 'subscriptions'
  | 'users'
  | 'loans'
  | 'loan_photos'
  | 'deposits'
  | 'closed_record_deposits'
  | 'removed_records_with_deposits'
  | 'daily_deposit_records'
  | 'daily_cash_summary'
  | 'cash_transactions'
  | 'activity_log'
  | 'camera_sessions'
  | 'paired_devices'
  | 'app_state'
  | 'tenant_settings'
  | 'user_invitations'
  | 'migration_jobs'

export type Database = any
