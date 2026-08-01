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
 * What it cannot know, because it reads DDL and not a live catalogue:
 *   - Relationships[] is empty, so nested `.select('*, loans(*)')` embeds are
 *     not typed. The queries still work; they are just not checked.
 *   - Views, enums and composite types are empty (this schema uses none).
 *   - A function returning `record` without an OUT/TABLE list becomes Json.
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
        Relationships: []
      }
      camera_sessions: {
        Row: {
          id: string
          tenant_id: string
          loan_id: number | null
          session_key: string
          status: string
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
          status?: string
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
          status?: string
          photo_url?: string | null
          expires_at?: string
          created_at?: string
          r2_key?: string | null
        }
        Relationships: []
      }
      cash_transactions: {
        Row: {
          id: number
          tenant_id: string
          transaction_date: string
          type: string
          amount: number
          reason: string
          created_at: string
          idempotency_key: string | null
        }
        Insert: {
          id?: number
          tenant_id: string
          transaction_date: string
          type: string
          amount: number
          reason: string
          created_at?: string
          idempotency_key?: string | null
        }
        Update: {
          id?: number
          tenant_id?: string
          transaction_date?: string
          type?: string
          amount?: number
          reason?: string
          created_at?: string
          idempotency_key?: string | null
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      enquiries: {
        Row: {
          id: string
          name: string
          email: string | null
          phone: string | null
          shop_name: string | null
          reason: string
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
          reason?: string
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
          reason?: string
          message?: string
          ip?: string | null
          handled_at?: string | null
          handled_by?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      loan_photos: {
        Row: {
          loan_id: number
          tenant_id: string
          photo_url: string
          storage_path: string
          captured_at: string | null
          created_at: string
          updated_at: string
          r2_key: string | null
          byte_size: number | null
          checksum: string | null
          mime_type: string | null
          archived: boolean
          archived_at: string | null
        }
        Insert: {
          loan_id: number
          tenant_id: string
          photo_url: string
          storage_path: string
          captured_at?: string | null
          created_at?: string
          updated_at?: string
          r2_key?: string | null
          byte_size?: number | null
          checksum?: string | null
          mime_type?: string | null
          archived?: boolean
          archived_at?: string | null
        }
        Update: {
          loan_id?: number
          tenant_id?: string
          photo_url?: string
          storage_path?: string
          captured_at?: string | null
          created_at?: string
          updated_at?: string
          r2_key?: string | null
          byte_size?: number | null
          checksum?: string | null
          mime_type?: string | null
          archived?: boolean
          archived_at?: string | null
        }
        Relationships: []
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
          category_type: string
          detailed_type: string | null
          weight: number | null
          amount: number
          interest: number | null
          face_verified_by: string | null
          face_verification_log: Json | null
          remarks: string | null
          issue_date: string
          active_timestamp: string | null
          status: string
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
          category_type: string
          detailed_type?: string | null
          weight?: number | null
          amount: number
          interest?: number | null
          face_verified_by?: string | null
          face_verification_log?: Json | null
          remarks?: string | null
          issue_date: string
          active_timestamp?: string | null
          status?: string
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
          category_type?: string
          detailed_type?: string | null
          weight?: number | null
          amount?: number
          interest?: number | null
          face_verified_by?: string | null
          face_verification_log?: Json | null
          remarks?: string | null
          issue_date?: string
          active_timestamp?: string | null
          status?: string
          closed_date?: string | null
          closed_timestamp?: string | null
          created_at?: string
          updated_at?: string
          idempotency_key?: string | null
          photo_required_missing?: boolean
        }
        Relationships: []
      }
      migration_jobs: {
        Row: {
          id: string
          tenant_id: string
          source_db: string | null
          source_app_version: string | null
          status: string
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
          status?: string
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
          status?: string
          stats?: Json
          error_log?: string | null
          started_at?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      paired_devices: {
        Row: {
          id: string
          tenant_id: string
          user_id: string
          device_name: string
          device_type: string
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
          device_type: string
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
          device_type?: string
          fcm_token?: string | null
          push_subscription?: Json | null
          local_ip?: string | null
          local_port?: number | null
          last_seen_at?: string
          created_at?: string
        }
        Relationships: []
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
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          tenant_id: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_subscription_id: string | null
          plan: string
          amount: number
          currency: string
          status: string
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
          plan: string
          amount: number
          currency?: string
          status?: string
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
          plan?: string
          amount?: number
          currency?: string
          status?: string
          starts_at?: string | null
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
      }
      support_tickets: {
        Row: {
          id: string
          tenant_id: string
          created_by: string | null
          subject: string
          category: string
          priority: string
          status: string
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
          category?: string
          priority?: string
          status?: string
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
          category?: string
          priority?: string
          status?: string
          context?: Json
          created_at?: string
          updated_at?: string
          resolved_at?: string | null
        }
        Relationships: []
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
        Relationships: []
      }
      tenants: {
        Row: {
          id: string
          shop_name: string
          owner_id: string
          plan: string
          plan_status: string
          trial_ends_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          shop_name: string
          owner_id: string
          plan?: string
          plan_status?: string
          trial_ends_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          shop_name?: string
          owner_id?: string
          plan?: string
          plan_status?: string
          trial_ends_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_invitations: {
        Row: {
          id: string
          tenant_id: string
          email: string
          role: string
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
          role?: string
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
          role?: string
          token?: string
          invited_by?: string | null
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          auth_id: string
          tenant_id: string
          full_name: string
          email: string
          role: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auth_id: string
          tenant_id: string
          full_name: string
          email: string
          role?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          auth_id?: string
          tenant_id?: string
          full_name?: string
          email?: string
          role?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      accept_invitation: {
        Args: { p_token?: string }
        Returns: string
      }
      account_report: {
        Args: { p_type?: string; p_start?: string; p_end?: string }
        Returns: { date: string | null; amount: number | null; count: number | null; avg_amount: number | null }[]
      }
      add_deposit: {
        Args: { p_loan_id?: number; p_amount?: number; p_date?: string }
        Returns: Json
      }
      add_deposit_idem: {
        Args: { p_loan_id?: number; p_amount?: number; p_date?: string; p_key?: string }
        Returns: Json
      }
      assert_can_write: {
        Args: Record<string, never>
        Returns: undefined
      }
      calculate_interest: {
        Args: { p_principal?: number; p_issue_date?: string; p_as_of?: string }
        Returns: number
      }
      chart_data: {
        Args: { p_months?: number }
        Returns: { month: string | null; invested: number | null; returned: number | null; interest: number | null }[]
      }
      clear_daily_deposits: {
        Args: { p_date?: string }
        Returns: number
      }
      clear_photo_missing_flag: {
        Args: Record<string, never>
        Returns: unknown
      }
      clear_removed_records: {
        Args: { p_date?: string }
        Returns: number
      }
      close_loan: {
        Args: { p_loan_id?: number; p_interest?: number; p_closed_date?: string }
        Returns: Json
      }
      create_loan: {
        Args: { p_loan?: Json }
        Returns: number
      }
      create_loan_idem: {
        Args: { p_loan?: Json; p_key?: string }
        Returns: number
      }
      create_ticket: {
        Args: { p_subject?: string; p_body?: string; p_category?: string; p_context?: Json }
        Returns: string
      }
      daily_deposits_report: {
        Args: { p_date?: string }
        Returns: { id: number | null; loan_id: number | null; loan_name: string | null; father_name: string | null; location: string | null; loan_amount: number | null; detailed_type: string | null; weight: number | null; deposit_amount: number | null; deposit_date: string | null }[]
      }
      daily_report: {
        Args: { p_date?: string }
        Returns: Json
      }
      dashboard_stats: {
        Args: { p_period?: string }
        Returns: Json
      }
      default_settings: {
        Args: Record<string, never>
        Returns: Json
      }
      delete_deposit: {
        Args: { p_deposit_id?: number }
        Returns: Json
      }
      distinct_locations: {
        Args: Record<string, never>
        Returns: { location: string | null; loan_count: number | null; active_amount: number | null }[]
      }
      field_suggestions: {
        Args: { p_field?: string; p_prefix?: string; p_limit?: number }
        Returns: { value: string | null; uses: number | null }[]
      }
      get_tenant_id: {
        Args: Record<string, never>
        Returns: string
      }
      inventory_report: {
        Args: Record<string, never>
        Returns: { category_type: string | null; item_type: string | null; item_count: number | null; total_amount: number | null; total_weight: number | null }[]
      }
      investment_report: {
        Args: { p_date?: string }
        Returns: { id: number | null; name: string | null; father_name: string | null; location: string | null; amount: number | null; category_type: string | null; detailed_type: string | null; weight: number | null; issue_date: string | null; status: string | null; closed_date: string | null; has_photo: boolean | null }[]
      }
      invite_staff: {
        Args: { p_email?: string; p_role?: string }
        Returns: Json
      }
      jewellery_breakdown: {
        Args: { p_category?: string; p_limit?: number }
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
        Args: { p_loan_id?: number }
        Returns: Json
      }
      loans_missing_photo: {
        Args: Record<string, never>
        Returns: { id: number | null; name: string | null; father_name: string | null; location: string | null; amount: number | null; issue_date: string | null }[]
      }
      location_report: {
        Args: { p_locations?: string[]; p_start?: string; p_end?: string }
        Returns: { location: string | null; loan_count: number | null; active_count: number | null; closed_count: number | null; total_amount: number | null; active_amount: number | null; total_weight: number | null; avg_amount: number | null }[]
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
        Args: { p_type?: string }
        Returns: string
      }
      offline_snapshot: {
        Args: { p_limit?: number }
        Returns: Json
      }
      photo_required: {
        Args: { p_stage?: string }
        Returns: boolean
      }
      provision_tenant: {
        Args: { p_shop_name?: string; p_full_name?: string }
        Returns: string
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
        Args: { p_tenant_id?: string; p_from_date?: string; p_to_date?: string }
        Returns: undefined
      }
      recalculate_my_cash_summary: {
        Args: { p_from_date?: string }
        Returns: undefined
      }
      record_cash_idem: {
        Args: { p_type?: string; p_amount?: number; p_reason?: string; p_date?: string; p_key?: string }
        Returns: Json
      }
      record_cash_transaction: {
        Args: { p_type?: string; p_amount?: number; p_reason?: string; p_date?: string }
        Returns: Json
      }
      removed_records_report: {
        Args: { p_date?: string }
        Returns: { id: number | null; loan_id: number | null; name: string | null; father_name: string | null; location: string | null; amount: number | null; detailed_type: string | null; weight: number | null; issue_date: string | null; closed_date: string | null; total_deposits: number | null; remarks: string | null }[]
      }
      reopen_loan: {
        Args: { p_loan_id?: number }
        Returns: Json
      }
      reply_to_ticket: {
        Args: { p_ticket_id?: string; p_body?: string }
        Returns: string
      }
      reset_sequences_for_tenant: {
        Args: { p_tenant_id?: string }
        Returns: Json
      }
      returns_report: {
        Args: { p_date?: string }
        Returns: { id: number | null; name: string | null; father_name: string | null; location: string | null; amount: number | null; category_type: string | null; detailed_type: string | null; weight: number | null; issue_date: string | null; closed_date: string | null; interest: number | null; total_return: number | null; deposits_collected: number | null; days_held: number | null }[]
      }
      revoke_staff: {
        Args: { p_user_id?: string }
        Returns: undefined
      }
      search_loans: {
        Args: { p_query?: string; p_status?: string; p_limit?: number }
        Returns: { id: number | null; name: string | null; father_name: string | null; location: string | null; amount: number | null; category_type: string | null; detailed_type: string | null; weight: number | null; issue_date: string | null; status: string | null; closed_date: string | null; total_deposits: number | null; has_photo: boolean | null; rank: number | null }[]
      }
      seed_default_settings: {
        Args: { p_tenant_id?: string }
        Returns: undefined
      }
      set_setting: {
        Args: { p_key?: string; p_value?: Json }
        Returns: undefined
      }
      shop_members: {
        Args: Record<string, never>
        Returns: { id: string | null; full_name: string | null; email: string | null; role: string | null; created_at: string | null; is_me: boolean | null }[]
      }
      tenant_totals: {
        Args: { p_tenant_id?: string }
        Returns: Json
      }
      ticket_detail: {
        Args: { p_ticket_id?: string }
        Returns: Json
      }
      trigger_set_updated_at: {
        Args: Record<string, never>
        Returns: unknown
      }
      update_closed_record: {
        Args: { p_loan_id?: number; p_patch?: Json }
        Returns: Json
      }
      update_deposit: {
        Args: { p_deposit_id?: number; p_amount?: number; p_date?: string }
        Returns: Json
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
