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
      creditor_addresses: {
        Row: {
          bureau: string
          city: string
          created_at: string | null
          created_by: string | null
          creditor: string
          id: string
          state: string
          street: string
          updated_at: string | null
          zip: string
        }
        Insert: {
          bureau: string
          city: string
          created_at?: string | null
          created_by?: string | null
          creditor: string
          id?: string
          state: string
          street: string
          updated_at?: string | null
          zip: string
        }
        Update: {
          bureau?: string
          city?: string
          created_at?: string | null
          created_by?: string | null
          creditor?: string
          id?: string
          state?: string
          street?: string
          updated_at?: string | null
          zip?: string
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
          created_at: string
          display_name: string | null
          email: string | null
          email_notifications: boolean | null
          id: string
          phone_number: string | null
          status: string | null
          text_notifications: boolean | null
          updated_at: string
          uploaded_documents: Json | null
          user_id: string
          verification_documents: Json | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          email_notifications?: boolean | null
          id?: string
          phone_number?: string | null
          status?: string | null
          text_notifications?: boolean | null
          updated_at?: string
          uploaded_documents?: Json | null
          user_id: string
          verification_documents?: Json | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          email_notifications?: boolean | null
          id?: string
          phone_number?: string | null
          status?: string | null
          text_notifications?: boolean | null
          updated_at?: string
          uploaded_documents?: Json | null
          user_id?: string
          verification_documents?: Json | null
        }
        Relationships: []
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
      rounds: {
        Row: {
          can_start_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          round_number: number
          session_id: string
          snapshot_data: Json | null
          status: string
          user_id: string
        }
        Insert: {
          can_start_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          round_number: number
          session_id: string
          snapshot_data?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          can_start_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
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
      [_ in never]: never
    }
    Functions: {
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
        Args:
          | {
              profile_user_id: string
              profile_email: string
              profile_phone_number: string
              profile_email_notifications: boolean
              profile_text_notifications: boolean
              profile_display_name: string
            }
          | {
              profile_user_id: string
              profile_email: string
              profile_phone_number: string
              profile_email_notifications: boolean
              profile_text_notifications: boolean
              profile_display_name: string
              profile_verification_documents?: Json
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
