export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_profiles: {
        Row: {
          color: string
          name: string
          pin_hash: string
          updated_at: string
        }
        Insert: {
          color?: string
          name: string
          pin_hash?: string
          updated_at?: string
        }
        Update: {
          color?: string
          name?: string
          pin_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      cantor_melodies: {
        Row: {
          cantor_id: string
          created_at: string
          id: string
          key: string | null
          melody_name: string
          musicxml_path: string | null
          notes: string | null
          psalm_title: string | null
        }
        Insert: {
          cantor_id: string
          created_at?: string
          id?: string
          key?: string | null
          melody_name: string
          musicxml_path?: string | null
          notes?: string | null
          psalm_title?: string | null
        }
        Update: {
          cantor_id?: string
          created_at?: string
          id?: string
          key?: string | null
          melody_name?: string
          musicxml_path?: string | null
          notes?: string | null
          psalm_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cantor_melodies_cantor_id_fkey"
            columns: ["cantor_id"]
            isOneToOne: false
            referencedRelation: "cantors"
            referencedColumns: ["id"]
          },
        ]
      }
      cantor_melody_assignments: {
        Row: {
          cantor_id: string
          created_at: string
          id: string
          key: string | null
          liturgical_period: string | null
          melody_id: string
          notes: string | null
        }
        Insert: {
          cantor_id: string
          created_at?: string
          id?: string
          key?: string | null
          liturgical_period?: string | null
          melody_id: string
          notes?: string | null
        }
        Update: {
          cantor_id?: string
          created_at?: string
          id?: string
          key?: string | null
          liturgical_period?: string | null
          melody_id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cantor_melody_assignments_cantor_id_fkey"
            columns: ["cantor_id"]
            isOneToOne: false
            referencedRelation: "cantors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cantor_melody_assignments_melody_id_fkey"
            columns: ["melody_id"]
            isOneToOne: false
            referencedRelation: "melodies"
            referencedColumns: ["id"]
          },
        ]
      }
      cantor_selections: {
        Row: {
          cantor_id: string
          created_at: string
          custom_key: string | null
          custom_melody: string | null
          id: string
          mass_date: string
          mass_time: string | null
          melody_id: string | null
          psalm_title: string | null
          status: string
        }
        Insert: {
          cantor_id: string
          created_at?: string
          custom_key?: string | null
          custom_melody?: string | null
          id?: string
          mass_date: string
          mass_time?: string | null
          melody_id?: string | null
          psalm_title?: string | null
          status?: string
        }
        Update: {
          cantor_id?: string
          created_at?: string
          custom_key?: string | null
          custom_melody?: string | null
          id?: string
          mass_date?: string
          mass_time?: string | null
          melody_id?: string | null
          psalm_title?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cantor_selections_cantor_id_fkey"
            columns: ["cantor_id"]
            isOneToOne: false
            referencedRelation: "cantors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cantor_selections_melody_id_fkey"
            columns: ["melody_id"]
            isOneToOne: false
            referencedRelation: "melodies"
            referencedColumns: ["id"]
          },
        ]
      }
      cantors: {
        Row: {
          created_at: string
          id: string
          name: string
          pin: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          pin: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          pin?: string
        }
        Relationships: []
      }
      devotions: {
        Row: {
          created_at: string
          day_of_month: number | null
          day_of_week: number | null
          description: string | null
          id: string
          is_active: boolean
          liturgical_periods: string[] | null
          name: string
          nth_occurrence: number | null
          recurrence_type: string
          songbook_links: Json | null
          start_time: string | null
        }
        Insert: {
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          liturgical_periods?: string[] | null
          name: string
          nth_occurrence?: number | null
          recurrence_type?: string
          songbook_links?: Json | null
          start_time?: string | null
        }
        Update: {
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          liturgical_periods?: string[] | null
          name?: string
          nth_occurrence?: number | null
          recurrence_type?: string
          songbook_links?: Json | null
          start_time?: string | null
        }
        Relationships: []
      }
      harmonograms: {
        Row: {
          created_at: string
          id: string
          liturgical_day: string | null
          mass_date: string
          notes: string | null
          organist: string
          playlist: Json
        }
        Insert: {
          created_at?: string
          id?: string
          liturgical_day?: string | null
          mass_date: string
          notes?: string | null
          organist: string
          playlist?: Json
        }
        Update: {
          created_at?: string
          id?: string
          liturgical_day?: string | null
          mass_date?: string
          notes?: string | null
          organist?: string
          playlist?: Json
        }
        Relationships: []
      }
      liturgy_cache: {
        Row: {
          data: Json
          id: string
          lit_date: string
          tab: string
          updated_at: string
        }
        Insert: {
          data: Json
          id?: string
          lit_date: string
          tab: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          lit_date?: string
          tab?: string
          updated_at?: string
        }
        Relationships: []
      }
      melodies: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          melody_name: string
          musicxml_path: string | null
          notes: string | null
          psalm_title: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          melody_name: string
          musicxml_path?: string | null
          notes?: string | null
          psalm_title?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          melody_name?: string
          musicxml_path?: string | null
          notes?: string | null
          psalm_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "melodies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "cantors"
            referencedColumns: ["id"]
          },
        ]
      }
      projector_presets: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          room_code: string | null
          settings: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          room_code?: string | null
          settings?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          room_code?: string | null
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      projector_rooms: {
        Row: {
          created_at: string
          id: string
          last_active_at: string
          name: string
          pin_hash: string | null
          room_code: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_active_at?: string
          name: string
          pin_hash?: string | null
          room_code: string
        }
        Update: {
          created_at?: string
          id?: string
          last_active_at?: string
          name?: string
          pin_hash?: string | null
          room_code?: string
        }
        Relationships: []
      }
      settlement_history: {
        Row: {
          created_at: string
          id: string
          month_key: string
          month_label: string
          organist_data: Json
          total_amount: number
          total_masses: number
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          month_key: string
          month_label: string
          organist_data?: Json
          total_amount?: number
          total_masses?: number
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          month_key?: string
          month_label?: string
          organist_data?: Json
          total_amount?: number
          total_masses?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      song_backups: {
        Row: {
          created_at: string
          id: string
          label: string | null
          song_count: number
          songs_data: Json
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          song_count?: number
          songs_data: Json
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          song_count?: number
          songs_data?: Json
        }
        Relationships: []
      }
      songbook_pages: {
        Row: {
          created_at: string
          id: string
          image_path: string
          page_number: number
          song_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_path: string
          page_number?: number
          song_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_path?: string
          page_number?: number
          song_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "songbook_pages_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songbook_songs"
            referencedColumns: ["id"]
          },
        ]
      }
      songbook_songs: {
        Row: {
          category: string | null
          created_at: string
          id: string
          sort_order: number | null
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          sort_order?: number | null
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          sort_order?: number | null
          title?: string
        }
        Relationships: []
      }
      songs: {
        Row: {
          data: Json
          id: string
          room_code: string | null
          updated_at: string
        }
        Insert: {
          data: Json
          id: string
          room_code?: string | null
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          room_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
