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
        }
        Relationships: [
          {
            foreignKeyName: "letters_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          email_notifications: boolean | null
          id: string
          phone_number: string | null
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
        }
        Relationships: [
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
          status: string
        }
        Insert: {
          can_start_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          round_number: number
          session_id: string
          status?: string
        }
        Update: {
          can_start_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          round_number?: number
          session_id?: string
          status?: string
        }
        Relationships: [
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
        }
        Insert: {
          analysis_data?: Json | null
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          analysis_data?: Json | null
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
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
      upsert_user_profile: {
        Args: {
          profile_user_id: string
          profile_email: string
          profile_phone_number: string
          profile_email_notifications: boolean
          profile_text_notifications: boolean
          profile_display_name: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
