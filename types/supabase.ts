/**
 * Database types for LoanPro SaaS.
 *
 * GENERATED FROM supabase/migrations/*.sql — the same DDL that was applied to
 * the project — rather than introspected from a live database. That makes it
 * accurate to the schema you ran, and it needs no CLI, no login and no network.
 *
 * What this gives you: every column name and type on all 21 tables, and the
 * argument and return shape of all RPC functions. A typo in a column name is
 * now a compile error instead of a row of `undefined` at runtime.
 *
 * Derived from the DDL, so these are real rather than guessed:
 *   - Relationships[], from every REFERENCES clause, which is what makes
 *     nested selects like `.select('*, tenant:tenants(*)')` type-check.
 *   - String unions from `CHECK (col IN (...))`, inline or added later by an
 *     ALTER TABLE. This schema uses CHECK constraints instead of Postgres
 *     enums, so without this every status and category would be bare `string`.
 *
 * What it still cannot know, because it reads DDL and not a live catalogue:
 *   - Views and composite types (this schema uses none).
 *   - A function returning `record` without an OUT/TABLE list becomes Json.
 *   - A CHECK written any way other than `col IN (...)` — a regex or a range
 *     check, say — is not turned into a type.
 *
 * If the schema changes, re-run the generator, or replace this file wholesale
 * with `supabase gen types typescript --linked` if you ever want the CLI.
 * Do not hand-edit: a wrong type here is worse than none, because it claims a
 * safety the queries do not have.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  /**
   * Read by supabase-js to pick its PostgREST typing rules. Supabase hosts
   * PostgREST 12. Leaving this out is not an error — the client assumes 12 —
   * but stating it means an upgrade becomes a visible change here rather than
   * a silent shift in how query results are typed.
   */
  __InternalSupabase: {
    PostgrestVersion: '12'
  }
  public: {
    Tables: {
      access_devices: {
        Row: {
          id: string
          tenant_id: string
          user_id: string
          auth_session_id: string
          display_name: string
          user_agent: string | null
          first_seen_at: string
          last_seen_at: string
          revoked_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id: string
          auth_session_id: string
          display_name: string
          user_agent?: string | null
          first_seen_at?: string
          last_seen_at?: string
          revoked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string
          auth_session_id?: string
          display_name?: string
          user_agent?: string | null
          first_seen_at?: string
          last_seen_at?: string
          revoked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'access_devices_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'access_devices_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      activity_log: {
        Row: {
          id: number
          tenant_id: string
          type: string
          description: string
          amount: number | null
          color: string | null
          icon: string | null
          time: string
        }
        Insert: {
          id?: number
          tenant_id: string
          type: string
          description: string
          amount?: number | null
          color?: string | null
          icon?: string | null
          time?: string
        }
        Update: {
          id?: number
          tenant_id?: string
          type?: string
          description?: string
          amount?: number | null
          color?: string | null
          icon?: string | null
          time?: string
        }
        Relationships: [
          {
            foreignKeyName: 'activity_log_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      api_rate_limits: {
        Row: {
          scope: string
          identity_hash: string
          window_started_at: string
          request_count: number
        }
        Insert: {
          scope: string
          identity_hash: string
          window_started_at?: string
          request_count?: number
        }
        Update: {
          scope?: string
          identity_hash?: string
          window_started_at?: string
          request_count?: number
        }
        Relationships: []
      }
      app_state: {
        Row: {
          tenant_id: string
          state_key: string
          state_value: string | null
          updated_at: string
        }
        Insert: {
          tenant_id: string
          state_key: string
          state_value?: string | null
          updated_at?: string
        }
        Update: {
          tenant_id?: string
          state_key?: string
          state_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'app_state_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      camera_sessions: {
        Row: {
          id: string
          tenant_id: string
          loan_id: number | null
          session_key: string
          status: 'pending' | 'captured' | 'expired'
          photo_url: string | null
          expires_at: string
          created_at: string
          r2_key: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          loan_id?: number | null
          session_key?: string
          status?: 'pending' | 'captured' | 'expired'
          photo_url?: string | null
          expires_at?: string
          created_at?: string
          r2_key?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          loan_id?: number | null
          session_key?: string
          status?: 'pending' | 'captured' | 'expired'
          photo_url?: string | null
          expires_at?: string
          created_at?: string
          r2_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'camera_sessions_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'camera_sessions_loan_id_fkey'
            columns: ['loan_id']
            isOneToOne: false
            referencedRelation: 'loans'
            referencedColumns: ['id']
          },
        ]
      }
      cash_transactions: {
        Row: {
          id: number
          tenant_id: string
          transaction_date: string
          type: 'add' | 'remove'
          amount: number
          reason: string
          created_at: string
          idempotency_key: string | null
        }
        Insert: {
          id?: number
          tenant_id: string
          transaction_date: string
          type: 'add' | 'remove'
          amount: number
          reason: string
          created_at?: string
          idempotency_key?: string | null
        }
        Update: {
          id?: number
          tenant_id?: string
          transaction_date?: string
          type?: 'add' | 'remove'
          amount?: number
          reason?: string
          created_at?: string
          idempotency_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'cash_transactions_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      closed_record_deposits: {
        Row: {
          id: number
          tenant_id: string
          loan_id: number
          original_deposit_id: number | null
          amount: number
          deposit_date: string
          archived_at: string
          source_version: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          tenant_id: string
          loan_id: number
          original_deposit_id?: number | null
          amount: number
          deposit_date: string
          archived_at?: string
          source_version?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          tenant_id?: string
          loan_id?: number
          original_deposit_id?: number | null
          amount?: number
          deposit_date?: string
          archived_at?: string
          source_version?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'closed_record_deposits_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'closed_record_deposits_loan_id_tenant_id_fkey'
            columns: ['loan_id', 'tenant_id']
            isOneToOne: false
            referencedRelation: 'loans'
            referencedColumns: ['id', 'tenant_id']
          },
        ]
      }
      daily_cash_summary: {
        Row: {
          tenant_id: string
          date: string
          investments: number | null
          returns: number | null
          total_cash: number | null
          added_cash: number | null
          removed_cash: number | null
          deposit_credit: number | null
          deposit_debit: number | null
          left_cash: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          date: string
          investments?: number | null
          returns?: number | null
          total_cash?: number | null
          added_cash?: number | null
          removed_cash?: number | null
          deposit_credit?: number | null
          deposit_debit?: number | null
          left_cash?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          tenant_id?: string
          date?: string
          investments?: number | null
          returns?: number | null
          total_cash?: number | null
          added_cash?: number | null
          removed_cash?: number | null
          deposit_credit?: number | null
          deposit_debit?: number | null
          left_cash?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'daily_cash_summary_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      daily_deposit_records: {
        Row: {
          id: number
          tenant_id: string
          loan_id: number
          loan_name: string
          father_name: string | null
          location: string | null
          loan_amount: number
          detailed_type: string | null
          weight: number | null
          deposit_amount: number
          deposit_date: string
          created_at: string
        }
        Insert: {
          id?: number
          tenant_id: string
          loan_id: number
          loan_name: string
          father_name?: string | null
          location?: string | null
          loan_amount: number
          detailed_type?: string | null
          weight?: number | null
          deposit_amount: number
          deposit_date: string
          created_at?: string
        }
        Update: {
          id?: number
          tenant_id?: string
          loan_id?: number
          loan_name?: string
          father_name?: string | null
          location?: string | null
          loan_amount?: number
          detailed_type?: string | null
          weight?: number | null
          deposit_amount?: number
          deposit_date?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'daily_deposit_records_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      deposits: {
        Row: {
          id: number
          tenant_id: string
          loan_id: number
          amount: number
          deposit_date: string
          created_at: string
          idempotency_key: string | null
        }
        Insert: {
          id?: number
          tenant_id: string
          loan_id: number
          amount: number
          deposit_date: string
          created_at?: string
          idempotency_key?: string | null
        }
        Update: {
          id?: number
          tenant_id?: string
          loan_id?: number
          amount?: number
          deposit_date?: string
          created_at?: string
          idempotency_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'deposits_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'deposits_loan_id_fkey'
            columns: ['loan_id']
            isOneToOne: false
            referencedRelation: 'loans'
            referencedColumns: ['id']
          },
        ]
      }
      enquiries: {
        Row: {
          id: string
          name: string
          email: string | null
          phone: string | null
          shop_name: string | null
          reason: 'migration' | 'sales' | 'problem' | 'billing' | 'other'
          message: string
          ip: string | null
          handled_at: string | null
          handled_by: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email?: string | null
          phone?: string | null
          shop_name?: string | null
          reason?: 'migration' | 'sales' | 'problem' | 'billing' | 'other'
          message: string
          ip?: string | null
          handled_at?: string | null
          handled_by?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string | null
          phone?: string | null
          shop_name?: string | null
          reason?: 'migration' | 'sales' | 'problem' | 'billing' | 'other'
          message?: string
          ip?: string | null
          handled_at?: string | null
          handled_by?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'enquiries_handled_by_fkey'
            columns: ['handled_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      loan_photos: {
        Row: {
          loan_id: number
          tenant_id: string
          photo_url: string | null
          storage_path: string | null
          captured_at: string | null
          created_at: string
          updated_at: string
          r2_key: string | null
          byte_size: number | null
          checksum: string | null
          mime_type: string | null
          archived: boolean
          archived_at: string | null
          stage: 'pledge' | 'collection'
        }
        Insert: {
          loan_id: number
          tenant_id: string
          photo_url?: string | null
          storage_path?: string | null
          captured_at?: string | null
          created_at?: string
          updated_at?: string
          r2_key?: string | null
          byte_size?: number | null
          checksum?: string | null
          mime_type?: string | null
          archived?: boolean
          archived_at?: string | null
          stage?: 'pledge' | 'collection'
        }
        Update: {
          loan_id?: number
          tenant_id?: string
          photo_url?: string | null
          storage_path?: string | null
          captured_at?: string | null
          created_at?: string
          updated_at?: string
          r2_key?: string | null
          byte_size?: number | null
          checksum?: string | null
          mime_type?: string | null
          archived?: boolean
          archived_at?: string | null
          stage?: 'pledge' | 'collection'
        }
        Relationships: [
          {
            foreignKeyName: 'loan_photos_loan_id_fkey'
            columns: ['loan_id']
            isOneToOne: false
            referencedRelation: 'loans'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'loan_photos_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      loans: {
        Row: {
          id: number
          tenant_id: string
          name: string
          father_name: string | null
          location: string | null
          address: string | null
          additional_information: string | null
          category_type: 'Gold' | 'Silver'
          detailed_type: string | null
          weight: number | null
          amount: number
          interest: number | null
          face_verified_by: string | null
          face_verification_log: Json | null
          remarks: string | null
          issue_date: string
          active_timestamp: string | null
          status: 'active' | 'closed'
          closed_date: string | null
          closed_timestamp: string | null
          created_at: string
          updated_at: string
          idempotency_key: string | null
          photo_required_missing: boolean
        }
        Insert: {
          id?: number
          tenant_id: string
          name: string
          father_name?: string | null
          location?: string | null
          address?: string | null
          additional_information?: string | null
          category_type: 'Gold' | 'Silver'
          detailed_type?: string | null
          weight?: number | null
          amount: number
          interest?: number | null
          face_verified_by?: string | null
          face_verification_log?: Json | null
          remarks?: string | null
          issue_date: string
          active_timestamp?: string | null
          status?: 'active' | 'closed'
          closed_date?: string | null
          closed_timestamp?: string | null
          created_at?: string
          updated_at?: string
          idempotency_key?: string | null
          photo_required_missing?: boolean
        }
        Update: {
          id?: number
          tenant_id?: string
          name?: string
          father_name?: string | null
          location?: string | null
          address?: string | null
          additional_information?: string | null
          category_type?: 'Gold' | 'Silver'
          detailed_type?: string | null
          weight?: number | null
          amount?: number
          interest?: number | null
          face_verified_by?: string | null
          face_verification_log?: Json | null
          remarks?: string | null
          issue_date?: string
          active_timestamp?: string | null
          status?: 'active' | 'closed'
          closed_date?: string | null
          closed_timestamp?: string | null
          created_at?: string
          updated_at?: string
          idempotency_key?: string | null
          photo_required_missing?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'loans_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      migration_jobs: {
        Row: {
          id: string
          tenant_id: string
          source_db: string | null
          source_app_version: string | null
          status: 'running' | 'completed' | 'failed'
          stats: Json
          error_log: string | null
          started_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          source_db?: string | null
          source_app_version?: string | null
          status?: 'running' | 'completed' | 'failed'
          stats?: Json
          error_log?: string | null
          started_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          source_db?: string | null
          source_app_version?: string | null
          status?: 'running' | 'completed' | 'failed'
          stats?: Json
          error_log?: string | null
          started_at?: string
          completed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'migration_jobs_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      paired_devices: {
        Row: {
          id: string
          tenant_id: string
          user_id: string
          device_name: string
          device_type: 'android' | 'ios' | 'pwa'
          fcm_token: string | null
          push_subscription: Json | null
          local_ip: string | null
          local_port: number | null
          last_seen_at: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id: string
          device_name?: string
          device_type: 'android' | 'ios' | 'pwa'
          fcm_token?: string | null
          push_subscription?: Json | null
          local_ip?: string | null
          local_port?: number | null
          last_seen_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string
          device_name?: string
          device_type?: 'android' | 'ios' | 'pwa'
          fcm_token?: string | null
          push_subscription?: Json | null
          local_ip?: string | null
          local_port?: number | null
          last_seen_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'paired_devices_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'paired_devices_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      removed_records_with_deposits: {
        Row: {
          id: number
          tenant_id: string
          loan_id: number
          name: string
          father_name: string | null
          location: string | null
          address: string | null
          amount: number
          detailed_type: string | null
          weight: number | null
          issue_date: string
          closed_date: string
          closed_timestamp: string | null
          additional_information: string | null
          total_deposits: number
          removal_date: string
          remarks: string | null
          created_at: string
        }
        Insert: {
          id?: number
          tenant_id: string
          loan_id: number
          name: string
          father_name?: string | null
          location?: string | null
          address?: string | null
          amount: number
          detailed_type?: string | null
          weight?: number | null
          issue_date: string
          closed_date: string
          closed_timestamp?: string | null
          additional_information?: string | null
          total_deposits?: number
          removal_date: string
          remarks?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          tenant_id?: string
          loan_id?: number
          name?: string
          father_name?: string | null
          location?: string | null
          address?: string | null
          amount?: number
          detailed_type?: string | null
          weight?: number | null
          issue_date?: string
          closed_date?: string
          closed_timestamp?: string | null
          additional_information?: string | null
          total_deposits?: number
          removal_date?: string
          remarks?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'removed_records_with_deposits_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      subscriptions: {
        Row: {
          id: string
          tenant_id: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_subscription_id: string | null
          plan: 'trial' | 'basic' | 'pro'
          amount: number
          currency: string
          status: 'pending' | 'active' | 'expired' | 'cancelled' | 'failed'
          starts_at: string | null
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_subscription_id?: string | null
          plan: 'trial' | 'basic' | 'pro'
          amount: number
          currency?: string
          status?: 'pending' | 'active' | 'expired' | 'cancelled' | 'failed'
          starts_at?: string | null
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_subscription_id?: string | null
          plan?: 'trial' | 'basic' | 'pro'
          amount?: number
          currency?: string
          status?: 'pending' | 'active' | 'expired' | 'cancelled' | 'failed'
          starts_at?: string | null
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'subscriptions_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      support_messages: {
        Row: {
          id: string
          ticket_id: string
          tenant_id: string
          author_id: string | null
          from_staff: boolean
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          ticket_id: string
          tenant_id: string
          author_id?: string | null
          from_staff?: boolean
          body: string
          created_at?: string
        }
        Update: {
          id?: string
          ticket_id?: string
          tenant_id?: string
          author_id?: string | null
          from_staff?: boolean
          body?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'support_messages_ticket_id_fkey'
            columns: ['ticket_id']
            isOneToOne: false
            referencedRelation: 'support_tickets'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'support_messages_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'support_messages_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      support_tickets: {
        Row: {
          id: string
          tenant_id: string
          created_by: string | null
          subject: string
          category: 'question' | 'problem' | 'billing' | 'feature' | 'other'
          priority: 'low' | 'normal' | 'high'
          status: 'open' | 'answered' | 'resolved' | 'closed'
          context: Json
          created_at: string
          updated_at: string
          resolved_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          created_by?: string | null
          subject: string
          category?: 'question' | 'problem' | 'billing' | 'feature' | 'other'
          priority?: 'low' | 'normal' | 'high'
          status?: 'open' | 'answered' | 'resolved' | 'closed'
          context?: Json
          created_at?: string
          updated_at?: string
          resolved_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          created_by?: string | null
          subject?: string
          category?: 'question' | 'problem' | 'billing' | 'feature' | 'other'
          priority?: 'low' | 'normal' | 'high'
          status?: 'open' | 'answered' | 'resolved' | 'closed'
          context?: Json
          created_at?: string
          updated_at?: string
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'support_tickets_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'support_tickets_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      tenant_settings: {
        Row: {
          tenant_id: string
          key: string
          value: Json
          updated_at: string
        }
        Insert: {
          tenant_id: string
          key: string
          value: Json
          updated_at?: string
        }
        Update: {
          tenant_id?: string
          key?: string
          value?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tenant_settings_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      tenants: {
        Row: {
          id: string
          shop_name: string
          owner_id: string
          plan: 'trial' | 'basic' | 'pro'
          plan_status: 'active' | 'expired' | 'cancelled'
          trial_ends_at: string | null
          created_at: string
          updated_at: string
          storage_bytes: number
        }
        Insert: {
          id?: string
          shop_name: string
          owner_id: string
          plan?: 'trial' | 'basic' | 'pro'
          plan_status?: 'active' | 'expired' | 'cancelled'
          trial_ends_at?: string | null
          created_at?: string
          updated_at?: string
          storage_bytes?: number
        }
        Update: {
          id?: string
          shop_name?: string
          owner_id?: string
          plan?: 'trial' | 'basic' | 'pro'
          plan_status?: 'active' | 'expired' | 'cancelled'
          trial_ends_at?: string | null
          created_at?: string
          updated_at?: string
          storage_bytes?: number
        }
        Relationships: []
      }
      user_invitations: {
        Row: {
          id: string
          tenant_id: string
          email: string
          role: 'owner' | 'staff'
          token: string
          invited_by: string | null
          expires_at: string
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          email: string
          role?: 'owner' | 'staff'
          token?: string
          invited_by?: string | null
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          email?: string
          role?: 'owner' | 'staff'
          token?: string
          invited_by?: string | null
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_invitations_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_invitations_invited_by_fkey'
            columns: ['invited_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      users: {
        Row: {
          id: string
          auth_id: string
          tenant_id: string
          full_name: string
          email: string
          role: 'owner' | 'staff'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auth_id: string
          tenant_id: string
          full_name: string
          email: string
          role?: 'owner' | 'staff'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          auth_id?: string
          tenant_id?: string
          full_name?: string
          email?: string
          role?: 'owner' | 'staff'
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'users_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      accept_invitation: {
        Args: { p_token?: string | null }
        Returns: string
      }
      access_device_limit: {
        Args: { p_plan?: string | null }
        Returns: number
      }
      account_report: {
        Args: { p_type?: string | null; p_start?: string | null; p_end?: string | null }
        Returns: { date: string | null; amount: number | null; count: number | null; avg_amount: number | null }[]
      }
      add_deposit: {
        Args: { p_loan_id?: number | null; p_amount?: number | null; p_date?: string | null }
        Returns: Json
      }
      add_deposit_idem: {
        Args: { p_loan_id?: number | null; p_amount?: number | null; p_date?: string | null; p_key?: string | null }
        Returns: Json
      }
      append_loan_remark: {
        Args: { p_loan_id?: number | null; p_text?: string | null }
        Returns: Json
      }
      assert_can_write: {
        Args: Record<string, never>
        Returns: undefined
      }
      assert_device_management_session: {
        Args: Record<string, never>
        Returns: undefined
      }
      calculate_interest: {
        Args: { p_principal?: number | null; p_issue_date?: string | null; p_as_of?: string | null }
        Returns: number
      }
      chart_data: {
        Args: { p_months?: number | null }
        Returns: { month: string | null; invested: number | null; returned: number | null; interest: number | null }[]
      }
      clear_daily_deposits: {
        Args: { p_date?: string | null }
        Returns: number
      }
      clear_photo_missing_flag: {
        Args: Record<string, never>
        Returns: unknown
      }
      clear_removed_records: {
        Args: { p_date?: string | null }
        Returns: number
      }
      close_loan: {
        Args: { p_loan_id?: number | null; p_interest?: number | null; p_closed_date?: string | null }
        Returns: Json
      }
      consume_api_rate_limit: {
        Args: { p_scope?: string | null; p_identity_hash?: string | null; p_limit?: number | null; p_window_seconds?: number | null }
        Returns: { allowed: boolean | null; remaining: number | null; retry_after: number | null }[]
      }
      create_loan: {
        Args: { p_loan?: Json | null }
        Returns: number
      }
      create_loan_idem: {
        Args: { p_loan?: Json | null; p_key?: string | null }
        Returns: number
      }
      create_ticket: {
        Args: { p_subject?: string | null; p_body?: string | null; p_category?: string | null; p_context?: Json | null }
        Returns: string
      }
      daily_deposits_report: {
        Args: { p_date?: string | null }
        Returns: { id: number | null; loan_id: number | null; loan_name: string | null; father_name: string | null; location: string | null; loan_amount: number | null; detailed_type: string | null; weight: number | null; deposit_amount: number | null; deposit_date: string | null }[]
      }
      daily_report: {
        Args: { p_date?: string | null }
        Returns: Json
      }
      dashboard_stats: {
        Args: { p_period?: string | null }
        Returns: Json
      }
      default_settings: {
        Args: Record<string, never>
        Returns: Json
      }
      delete_deposit: {
        Args: { p_deposit_id?: number | null }
        Returns: Json
      }
      delete_loan: {
        Args: { p_loan_id?: number | null }
        Returns: Json
      }
      delete_loan_remark: {
        Args: { p_loan_id?: number | null; p_index?: number | null; p_expected?: string | null }
        Returns: undefined
      }
      distinct_locations: {
        Args: Record<string, never>
        Returns: { location: string | null; loan_count: number | null; active_amount: number | null }[]
      }
      field_suggestions: {
        Args: { p_field?: string | null; p_prefix?: string | null; p_limit?: number | null }
        Returns: { value: string | null; uses: number | null }[]
      }
      get_app_user_id: {
        Args: Record<string, never>
        Returns: string
      }
      get_tenant_id: {
        Args: Record<string, never>
        Returns: string
      }
      has_photo: {
        Args: { p_loan_id?: number | null; p_stage?: string | null }
        Returns: boolean
      }
      inventory_report: {
        Args: Record<string, never>
        Returns: { category_type: string | null; item_type: string | null; item_count: number | null; total_amount: number | null; total_weight: number | null }[]
      }
      investment_report: {
        Args: { p_date?: string | null }
        Returns: { id: number | null; name: string | null; father_name: string | null; location: string | null; amount: number | null; category_type: string | null; detailed_type: string | null; weight: number | null; issue_date: string | null; status: string | null; closed_date: string | null; has_photo: boolean | null }[]
      }
      invite_staff: {
        Args: { p_email?: string | null; p_role?: string | null }
        Returns: Json
      }
      jewellery_breakdown: {
        Args: { p_category?: string | null; p_limit?: number | null }
        Returns: { name: string | null; total_amount: number | null; percentage: number | null }[]
      }
      jewellery_stock: {
        Args: Record<string, never>
        Returns: Json
      }
      lending_metrics: {
        Args: Record<string, never>
        Returns: Json
      }
      loan_detail: {
        Args: { p_loan_id?: number | null }
        Returns: Json
      }
      loan_photos_storage_delta: {
        Args: Record<string, never>
        Returns: unknown
      }
      loans_missing_photo: {
        Args: Record<string, never>
        Returns: { id: number | null; name: string | null; father_name: string | null; location: string | null; amount: number | null; issue_date: string | null }[]
      }
      location_report: {
        Args: { p_locations?: string[] | null; p_start?: string | null; p_end?: string | null }
        Returns: { location: string | null; loan_count: number | null; active_count: number | null; closed_count: number | null; total_amount: number | null; active_amount: number | null; total_weight: number | null; avg_amount: number | null }[]
      }
      my_access_devices: {
        Args: Record<string, never>
        Returns: { id: string | null; display_name: string | null; user_agent: string | null; first_seen_at: string | null; last_seen_at: string | null; revoked_at: string | null; is_current: boolean | null }[]
      }
      my_plan: {
        Args: Record<string, never>
        Returns: Json
      }
      my_settings: {
        Args: Record<string, never>
        Returns: Json
      }
      my_tickets: {
        Args: Record<string, never>
        Returns: { id: string | null; subject: string | null; category: string | null; status: string | null; created_at: string | null; updated_at: string | null; message_count: number | null; last_message_at: string | null; awaiting_you: boolean | null }[]
      }
      normalize_item_type: {
        Args: { p_type?: string | null }
        Returns: string
      }
      offline_snapshot: {
        Args: { p_limit?: number | null }
        Returns: Json
      }
      photo_required: {
        Args: { p_stage?: string | null }
        Returns: boolean
      }
      plan_storage_limit: {
        Args: { p_plan?: string | null }
        Returns: number
      }
      provision_tenant: {
        Args: { p_shop_name?: string | null; p_full_name?: string | null }
        Returns: string
      }
      prune_api_rate_limits: {
        Args: Record<string, never>
        Returns: number
      }
      prune_enquiry_ips: {
        Args: Record<string, never>
        Returns: undefined
      }
      purge_daily_working_tables: {
        Args: Record<string, never>
        Returns: undefined
      }
      recalculate_cash_summary: {
        Args: { p_tenant_id?: string | null; p_from_date?: string | null; p_to_date?: string | null }
        Returns: undefined
      }
      recalculate_my_cash_summary: {
        Args: { p_from_date?: string | null }
        Returns: undefined
      }
      recalculate_storage_bytes: {
        Args: { p_tenant?: string | null }
        Returns: { t_id: string | null; bytes_before: number | null; bytes_after: number | null }[]
      }
      record_cash_idem: {
        Args: { p_type?: string | null; p_amount?: number | null; p_reason?: string | null; p_date?: string | null; p_key?: string | null }
        Returns: Json
      }
      record_cash_transaction: {
        Args: { p_type?: string | null; p_amount?: number | null; p_reason?: string | null; p_date?: string | null }
        Returns: Json
      }
      register_access_session: {
        Args: { p_session_id?: string | null; p_display_name?: string | null; p_user_agent?: string | null }
        Returns: Json
      }
      removed_records_report: {
        Args: { p_date?: string | null }
        Returns: { id: number | null; loan_id: number | null; name: string | null; father_name: string | null; location: string | null; amount: number | null; detailed_type: string | null; weight: number | null; issue_date: string | null; closed_date: string | null; total_deposits: number | null; remarks: string | null }[]
      }
      rename_access_device: {
        Args: { p_device_id?: string | null; p_name?: string | null }
        Returns: undefined
      }
      reopen_loan: {
        Args: { p_loan_id?: number | null }
        Returns: Json
      }
      reply_to_ticket: {
        Args: { p_ticket_id?: string | null; p_body?: string | null }
        Returns: string
      }
      reset_sequences_for_tenant: {
        Args: { p_tenant_id?: string | null }
        Returns: Json
      }
      returns_report: {
        Args: { p_date?: string | null }
        Returns: { id: number | null; name: string | null; father_name: string | null; location: string | null; amount: number | null; category_type: string | null; detailed_type: string | null; weight: number | null; issue_date: string | null; closed_date: string | null; interest: number | null; total_return: number | null; deposits_collected: number | null; days_held: number | null }[]
      }
      revoke_access_device: {
        Args: { p_device_id?: string | null }
        Returns: boolean
      }
      revoke_all_access_devices: {
        Args: Record<string, never>
        Returns: number
      }
      revoke_other_access_devices: {
        Args: Record<string, never>
        Returns: number
      }
      revoke_staff: {
        Args: { p_user_id?: string | null }
        Returns: undefined
      }
      search_loans: {
        Args: { p_query?: string | null; p_status?: string | null; p_limit?: number | null }
        Returns: { id: number | null; name: string | null; father_name: string | null; location: string | null; amount: number | null; category_type: string | null; detailed_type: string | null; weight: number | null; issue_date: string | null; status: string | null; closed_date: string | null; total_deposits: number | null; has_photo: boolean | null; rank: number | null }[]
      }
      seed_default_settings: {
        Args: { p_tenant_id?: string | null }
        Returns: undefined
      }
      set_setting: {
        Args: { p_key?: string | null; p_value?: Json | null }
        Returns: undefined
      }
      shop_members: {
        Args: Record<string, never>
        Returns: { id: string | null; full_name: string | null; email: string | null; role: string | null; created_at: string | null; is_me: boolean | null }[]
      }
      tenant_totals: {
        Args: { p_tenant_id?: string | null }
        Returns: Json
      }
      ticket_detail: {
        Args: { p_ticket_id?: string | null }
        Returns: Json
      }
      trigger_set_updated_at: {
        Args: Record<string, never>
        Returns: unknown
      }
      update_active_loan: {
        Args: { p_loan_id?: number | null; p_patch?: Json | null }
        Returns: Json
      }
      update_closed_record: {
        Args: { p_loan_id?: number | null; p_patch?: Json | null }
        Returns: Json
      }
      update_deposit: {
        Args: { p_deposit_id?: number | null; p_amount?: number | null; p_date?: string | null }
        Returns: Json
      }
      validate_loan_chronology: {
        Args: Record<string, never>
        Returns: unknown
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

/** Convenience aliases. */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type Inserts<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type Updates<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
export type Funcs<T extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][T]['Returns']

export type TableName = keyof Database['public']['Tables']
