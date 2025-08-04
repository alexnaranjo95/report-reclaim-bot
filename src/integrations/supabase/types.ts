export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      admin_example_documents: {
        Row: {
          category: string
          edited_height: number | null
          edited_width: number | null
          file_name: string
          file_url: string
          has_edits: boolean | null
          id: string
          last_edited_at: string | null
          original_file_name: string | null
          original_file_url: string | null
          original_height: number | null
          original_width: number | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          category: string
          edited_height?: number | null
          edited_width?: number | null
          file_name: string
          file_url: string
          has_edits?: boolean | null
          id?: string
          last_edited_at?: string | null
          original_file_name?: string | null
          original_file_url?: string | null
          original_height?: number | null
          original_width?: number | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          edited_height?: number | null
          edited_width?: number | null
          file_name?: string
          file_url?: string
          has_edits?: boolean | null
          id?: string
          last_edited_at?: string | null
          original_file_name?: string | null
          original_file_url?: string | null
          original_height?: number | null
          original_width?: number | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      admin_prompts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          prompt_text: string
          updated_at: string
          updated_by: string | null
          version_name: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          prompt_text: string
          updated_at?: string
          updated_by?: string | null
          version_name?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          prompt_text?: string
          updated_at?: string
          updated_by?: string | null
          version_name?: string | null
        }
        Relationships: []
      }
      admin_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_encrypted: boolean | null
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_encrypted?: boolean | null
          setting_key: string
          setting_value: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_encrypted?: boolean | null
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_analysis_results: {
        Row: {
          analysis_summary: Json | null
          analysis_timestamp: string | null
          created_at: string | null
          id: string
          model_version: string | null
          recommendations: Json | null
          report_id: string
          total_negative_items: number | null
          updated_at: string | null
        }
        Insert: {
          analysis_summary?: Json | null
          analysis_timestamp?: string | null
          created_at?: string | null
          id?: string
          model_version?: string | null
          recommendations?: Json | null
          report_id: string
          total_negative_items?: number | null
          updated_at?: string | null
        }
        Update: {
          analysis_summary?: Json | null
          analysis_timestamp?: string | null
          created_at?: string | null
          id?: string
          model_version?: string | null
          recommendations?: Json | null
          report_id?: string
          total_negative_items?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_analysis_results_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_versions: {
        Row: {
          additional_rules: string | null
          base_prompt: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          version_name: string
        }
        Insert: {
          additional_rules?: string | null
          base_prompt: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          version_name: string
        }
        Update: {
          additional_rules?: string | null
          base_prompt?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          version_name?: string
        }
        Relationships: []
      }
      collections: {
        Row: {
          account_number: string | null
          amount: number | null
          collection_agency: string | null
          created_at: string | null
          date_assigned: string | null
          id: string
          original_creditor: string | null
          report_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          account_number?: string | null
          amount?: number | null
          collection_agency?: string | null
          created_at?: string | null
          date_assigned?: string | null
          id?: string
          original_creditor?: string | null
          report_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          account_number?: string | null
          amount?: number | null
          collection_agency?: string | null
          created_at?: string | null
          date_assigned?: string | null
          id?: string
          original_creditor?: string | null
          report_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collections_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_accounts: {
        Row: {
          account_number: string | null
          account_status: string | null
          account_type: string | null
          created_at: string | null
          credit_limit: number | null
          creditor_name: string
          current_balance: number | null
          date_closed: string | null
          date_opened: string | null
          high_credit: number | null
          id: string
          is_negative: boolean | null
          past_due_amount: number | null
          payment_history: Json | null
          payment_status: string | null
          report_id: string
          updated_at: string | null
        }
        Insert: {
          account_number?: string | null
          account_status?: string | null
          account_type?: string | null
          created_at?: string | null
          credit_limit?: number | null
          creditor_name: string
          current_balance?: number | null
          date_closed?: string | null
          date_opened?: string | null
          high_credit?: number | null
          id?: string
          is_negative?: boolean | null
          past_due_amount?: number | null
          payment_history?: Json | null
          payment_status?: string | null
          report_id: string
          updated_at?: string | null
        }
        Update: {
          account_number?: string | null
          account_status?: string | null
          account_type?: string | null
          created_at?: string | null
          credit_limit?: number | null
          creditor_name?: string
          current_balance?: number | null
          date_closed?: string | null
          date_opened?: string | null
          high_credit?: number | null
          id?: string
          is_negative?: boolean | null
          past_due_amount?: number | null
          payment_history?: Json | null
          payment_status?: string | null
          report_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_accounts_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_inquiries: {
        Row: {
          created_at: string | null
          id: string
          inquirer_name: string
          inquiry_date: string | null
          inquiry_type: string | null
          report_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          inquirer_name: string
          inquiry_date?: string | null
          inquiry_type?: string | null
          report_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          inquirer_name?: string
          inquiry_date?: string | null
          inquiry_type?: string | null
          report_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_inquiries_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_reports: {
        Row: {
          bureau_name: string
          created_at: string | null
          extraction_status: string | null
          file_name: string | null
          file_path: string | null
          id: string
          processing_errors: string | null
          raw_text: string | null
          report_date: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          bureau_name: string
          created_at?: string | null
          extraction_status?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          processing_errors?: string | null
          raw_text?: string | null
          report_date?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          bureau_name?: string
          created_at?: string | null
          extraction_status?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          processing_errors?: string | null
          raw_text?: string | null
          report_date?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      creditor_addresses: {
        Row: {
          bureau: string | null
          city: string | null
          created_at: string | null
          created_by: string | null
          creditor: string
          id: string
          state: string | null
          street: string | null
          updated_at: string | null
          zip: string | null
        }
        Insert: {
          bureau?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          creditor: string
          id?: string
          state?: string | null
          street?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Update: {
          bureau?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          creditor?: string
          id?: string
          state?: string | null
          street?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      dispute_templates: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          file_type: string
          id: string
          is_active: boolean | null
          name: string
          preference_weight: number | null
          similarity_score: number | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          file_type: string
          id?: string
          is_active?: boolean | null
          name: string
          preference_weight?: number | null
          similarity_score?: number | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          file_type?: string
          id?: string
          is_active?: boolean | null
          name?: string
          preference_weight?: number | null
          similarity_score?: number | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      letters: {
        Row: {
          bureau: string
          content: string
          created_at: string
          creditor: string
          id: string
          items: string[]
          round_id: string
          sent_at: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bureau: string
          content: string
          created_at?: string
          creditor: string
          id?: string
          items?: string[]
          round_id: string
          sent_at?: string | null
          status?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bureau?: string
          content?: string
          created_at?: string
          creditor?: string
          id?: string
          items?: string[]
          round_id?: string
          sent_at?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_letters_round_id"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letters_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      negative_items: {
        Row: {
          account_id: string | null
          ai_confidence_score: number | null
          amount: number | null
          created_at: string | null
          date_occurred: string | null
          description: string | null
          dispute_eligible: boolean | null
          human_verified: boolean | null
          id: string
          negative_type: string
          report_id: string
          severity_score: number | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          ai_confidence_score?: number | null
          amount?: number | null
          created_at?: string | null
          date_occurred?: string | null
          description?: string | null
          dispute_eligible?: boolean | null
          human_verified?: boolean | null
          id?: string
          negative_type: string
          report_id: string
          severity_score?: number | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          ai_confidence_score?: number | null
          amount?: number | null
          created_at?: string | null
          date_occurred?: string | null
          description?: string | null
          dispute_eligible?: boolean | null
          human_verified?: boolean | null
          id?: string
          negative_type?: string
          report_id?: string
          severity_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "negative_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negative_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      personal_information: {
        Row: {
          created_at: string | null
          current_address: Json | null
          date_of_birth: string | null
          employer_info: Json | null
          full_name: string | null
          id: string
          previous_addresses: Json | null
          report_id: string
          ssn_partial: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_address?: Json | null
          date_of_birth?: string | null
          employer_info?: Json | null
          full_name?: string | null
          id?: string
          previous_addresses?: Json | null
          report_id: string
          ssn_partial?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_address?: Json | null
          date_of_birth?: string | null
          employer_info?: Json | null
          full_name?: string | null
          id?: string
          previous_addresses?: Json | null
          report_id?: string
          ssn_partial?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personal_information_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_metrics: {
        Row: {
          active_users: number
          created_at: string
          date: string
          disputes_drafted: number
          disputes_resolved: number
          id: string
          letters_sent: number
          platform_fee: number
          postage_cost: number
          total_revenue: number
          updated_at: string
        }
        Insert: {
          active_users?: number
          created_at?: string
          date?: string
          disputes_drafted?: number
          disputes_resolved?: number
          id?: string
          letters_sent?: number
          platform_fee?: number
          postage_cost?: number
          total_revenue?: number
          updated_at?: string
        }
        Update: {
          active_users?: number
          created_at?: string
          date?: string
          disputes_drafted?: number
          disputes_resolved?: number
          id?: string
          letters_sent?: number
          platform_fee?: number
          postage_cost?: number
          total_revenue?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address_line1: string | null
          city: string | null
          created_at: string
          display_name: string | null
          email: string | null
          email_notifications: boolean | null
          full_name: string | null
          id: string
          organization_id: string | null
          organization_name: string | null
          phone_number: string | null
          postal_code: string | null
          state: string | null
          status: string | null
          text_notifications: boolean | null
          updated_at: string
          uploaded_documents: Json | null
          user_id: string
          verification_documents: Json | null
        }
        Insert: {
          address_line1?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          email_notifications?: boolean | null
          full_name?: string | null
          id?: string
          organization_id?: string | null
          organization_name?: string | null
          phone_number?: string | null
          postal_code?: string | null
          state?: string | null
          status?: string | null
          text_notifications?: boolean | null
          updated_at?: string
          uploaded_documents?: Json | null
          user_id: string
          verification_documents?: Json | null
        }
        Update: {
          address_line1?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          email_notifications?: boolean | null
          full_name?: string | null
          id?: string
          organization_id?: string | null
          organization_name?: string | null
          phone_number?: string | null
          postal_code?: string | null
          state?: string | null
          status?: string | null
          text_notifications?: boolean | null
          updated_at?: string
          uploaded_documents?: Json | null
          user_id?: string
          verification_documents?: Json | null
        }
        Relationships: []
      }
      public_records: {
        Row: {
          amount: number | null
          case_number: string | null
          court_name: string | null
          created_at: string | null
          filing_date: string | null
          id: string
          record_type: string
          report_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          case_number?: string | null
          court_name?: string | null
          created_at?: string | null
          filing_date?: string | null
          id?: string
          record_type: string
          report_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          case_number?: string | null
          court_name?: string | null
          created_at?: string | null
          filing_date?: string | null
          id?: string
          record_type?: string
          report_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_records_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      response_logs: {
        Row: {
          created_at: string
          creditor: string
          documents: string[] | null
          id: string
          received_response: boolean
          response_content: string | null
          response_summary: string | null
          round_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          creditor: string
          documents?: string[] | null
          id?: string
          received_response?: boolean
          response_content?: string | null
          response_summary?: string | null
          round_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          creditor?: string
          documents?: string[] | null
          id?: string
          received_response?: boolean
          response_content?: string | null
          response_summary?: string | null
          round_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_response_logs_round_id"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_logs_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_templates: {
        Row: {
          append_documents: Json | null
          content_template: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean | null
          layout_id: string | null
          round_number: number
          tone_settings: Json | null
          updated_at: string
        }
        Insert: {
          append_documents?: Json | null
          content_template: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          layout_id?: string | null
          round_number: number
          tone_settings?: Json | null
          updated_at?: string
        }
        Update: {
          append_documents?: Json | null
          content_template?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          layout_id?: string | null
          round_number?: number
          tone_settings?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_templates_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "template_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          append_settings: Json | null
          can_start_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          last_regeneration_date: string | null
          regeneration_count: number | null
          round_number: number
          session_id: string
          snapshot_data: Json | null
          status: string
          user_id: string
        }
        Insert: {
          append_settings?: Json | null
          can_start_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          last_regeneration_date?: string | null
          regeneration_count?: number | null
          round_number: number
          session_id: string
          snapshot_data?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          append_settings?: Json | null
          can_start_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          last_regeneration_date?: string | null
          regeneration_count?: number | null
          round_number?: number
          session_id?: string
          snapshot_data?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_rounds_session_id"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          analysis_data: Json | null
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_data?: Json | null
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_data?: Json | null
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      template_layouts: {
        Row: {
          body_html: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean | null
          name: string
          placeholders: string[] | null
          preview_pdf_url: string | null
          updated_at: string
          version: number | null
        }
        Insert: {
          body_html?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          placeholders?: string[] | null
          preview_pdf_url?: string | null
          updated_at?: string
          version?: number | null
        }
        Update: {
          body_html?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          placeholders?: string[] | null
          preview_pdf_url?: string | null
          updated_at?: string
          version?: number | null
        }
        Relationships: []
      }
      template_versions: {
        Row: {
          body_html: string
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          template_id: string | null
          version_number: number
        }
        Insert: {
          body_html: string
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          template_id?: string | null
          version_number: number
        }
        Update: {
          body_html?: string
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          template_id?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "template_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      extraction_health_monitor: {
        Row: {
          avg_processing_time_seconds: number | null
          count: number | null
          extraction_status: string | null
          newest_record: string | null
          oldest_record: string | null
          recent_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_old_failed_reports: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      ensure_round_templates: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      get_user_profile: {
        Args: { profile_user_id: string }
        Returns: {
          id: string
          user_id: string
          email: string
          phone_number: string
          email_notifications: boolean
          text_notifications: boolean
          display_name: string
          verification_documents: Json
          created_at: string
          updated_at: string
          full_name: string
          address_line1: string
          city: string
          state: string
          postal_code: string
        }[]
      }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: {
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      get_user_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          user_id: string
          display_name: string
          email: string
          total_sessions: number
          total_letters: number
          letters_sent: number
          last_activity: string
          status: string
          active_rounds: number
          user_created_at: string
        }[]
      }
      has_role: {
        Args: {
          _user_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      upsert_user_profile: {
        Args: {
          profile_user_id: string
          profile_email: string
          profile_phone_number: string
          profile_email_notifications: boolean
          profile_text_notifications: boolean
          profile_display_name: string
          profile_verification_documents?: Json
          profile_full_name?: string
          profile_address_line1?: string
          profile_city?: string
          profile_state?: string
          profile_postal_code?: string
          profile_organization_id?: string
          profile_organization_name?: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "user" | "admin" | "superadmin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["user", "admin", "superadmin"],
    },
  },
} as const
