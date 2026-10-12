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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      booking_seats: {
        Row: {
          booking_id: string
          id: string
          seat_id: string
        }
        Insert: {
          booking_id: string
          id?: string
          seat_id: string
        }
        Update: {
          booking_id?: string
          id?: string
          seat_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_seats_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_seats_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          created_at: string
          id: string
          qr_code: string | null
          screening_id: string
          status: Database["public"]["Enums"]["booking_status"]
          total_amount: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          qr_code?: string | null
          screening_id: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_amount?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          qr_code?: string | null
          screening_id?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_screening_id_fkey"
            columns: ["screening_id"]
            isOneToOne: false
            referencedRelation: "screenings"
            referencedColumns: ["id"]
          },
        ]
      }
      cinema_staff: {
        Row: {
          cinema_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          cinema_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          cinema_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cinema_staff_cinema_id_fkey"
            columns: ["cinema_id"]
            isOneToOne: false
            referencedRelation: "cinemas"
            referencedColumns: ["id"]
          },
        ]
      }
      cinemas: {
        Row: {
          address: string | null
          city_id: string
          created_at: string
          description: string | null
          id: string
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          name: string
        }
        Insert: {
          address?: string | null
          city_id: string
          created_at?: string
          description?: string | null
          id?: string
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name: string
        }
        Update: {
          address?: string | null
          city_id?: string
          created_at?: string
          description?: string | null
          id?: string
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "cinemas_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      halls: {
        Row: {
          capacity: number
          cinema_id: string
          created_at: string
          id: string
          name: string
          type: Database["public"]["Enums"]["hall_type"]
        }
        Insert: {
          capacity?: number
          cinema_id: string
          created_at?: string
          id?: string
          name: string
          type?: Database["public"]["Enums"]["hall_type"]
        }
        Update: {
          capacity?: number
          cinema_id?: string
          created_at?: string
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["hall_type"]
        }
        Relationships: [
          {
            foreignKeyName: "halls_cinema_id_fkey"
            columns: ["cinema_id"]
            isOneToOne: false
            referencedRelation: "cinemas"
            referencedColumns: ["id"]
          },
        ]
      }
      movies: {
        Row: {
          age_rating: string | null
          created_at: string
          duration_minutes: number
          genre: string | null
          id: string
          poster_url: string | null
          synopsis: string | null
          title: string
          title_ar: string | null
        }
        Insert: {
          age_rating?: string | null
          created_at?: string
          duration_minutes?: number
          genre?: string | null
          id?: string
          poster_url?: string | null
          synopsis?: string | null
          title: string
          title_ar?: string | null
        }
        Update: {
          age_rating?: string | null
          created_at?: string
          duration_minutes?: number
          genre?: string | null
          id?: string
          poster_url?: string | null
          synopsis?: string | null
          title?: string
          title_ar?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      program_weeks: {
        Row: {
          cinema_id: string
          created_at: string
          id: string
          published_at: string | null
          published_by: string | null
          status: Database["public"]["Enums"]["publish_status"]
          submitted_by: string | null
          week_start: string
        }
        Insert: {
          cinema_id: string
          created_at?: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["publish_status"]
          submitted_by?: string | null
          week_start: string
        }
        Update: {
          cinema_id?: string
          created_at?: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["publish_status"]
          submitted_by?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_weeks_cinema_id_fkey"
            columns: ["cinema_id"]
            isOneToOne: false
            referencedRelation: "cinemas"
            referencedColumns: ["id"]
          },
        ]
      }
      screenings: {
        Row: {
          audio_language: Database["public"]["Enums"]["audio_language"]
          created_at: string
          created_by: string | null
          hall_id: string
          id: string
          movie_id: string
          price: number
          starts_at: string
          status: Database["public"]["Enums"]["publish_status"]
        }
        Insert: {
          audio_language?: Database["public"]["Enums"]["audio_language"]
          created_at?: string
          created_by?: string | null
          hall_id: string
          id?: string
          movie_id: string
          price?: number
          starts_at: string
          status?: Database["public"]["Enums"]["publish_status"]
        }
        Update: {
          audio_language?: Database["public"]["Enums"]["audio_language"]
          created_at?: string
          created_by?: string | null
          hall_id?: string
          id?: string
          movie_id?: string
          price?: number
          starts_at?: string
          status?: Database["public"]["Enums"]["publish_status"]
        }
        Relationships: [
          {
            foreignKeyName: "screenings_hall_id_fkey"
            columns: ["hall_id"]
            isOneToOne: false
            referencedRelation: "halls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenings_movie_id_fkey"
            columns: ["movie_id"]
            isOneToOne: false
            referencedRelation: "movies"
            referencedColumns: ["id"]
          },
        ]
      }
      seats: {
        Row: {
          hall_id: string
          id: string
          row_label: string
          seat_number: number
          seat_type: string
        }
        Insert: {
          hall_id: string
          id?: string
          row_label: string
          seat_number: number
          seat_type?: string
        }
        Update: {
          hall_id?: string
          id?: string
          row_label?: string
          seat_number?: number
          seat_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "seats_hall_id_fkey"
            columns: ["hall_id"]
            isOneToOne: false
            referencedRelation: "halls"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          qr_code: string
          scanned: boolean
          scanned_at: string | null
          scanned_by: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          qr_code: string
          scanned?: boolean
          scanned_at?: string | null
          scanned_by?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          qr_code?: string
          scanned?: boolean
          scanned_at?: string | null
          scanned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_seats_for_hall: {
        Args: { _hall_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_cinema_staff: {
        Args: { _cinema_id: string; _user_id: string }
        Returns: boolean
      }
      is_staff_of_hall: {
        Args: { _hall_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "client" | "contributeur" | "admin" | "agent_guichet"
      audio_language: "VO" | "VF" | "VOSTFR" | "VOSTAR" | "AR_DUB"
      booking_status: "en_attente_paiement" | "confirme" | "annule"
      hall_type: "standard" | "vip"
      publish_status: "brouillon" | "en_revue" | "publie"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["client", "contributeur", "admin", "agent_guichet"],
      audio_language: ["VO", "VF", "VOSTFR", "VOSTAR", "AR_DUB"],
      booking_status: ["en_attente_paiement", "confirme", "annule"],
      hall_type: ["standard", "vip"],
      publish_status: ["brouillon", "en_revue", "publie"],
    },
  },
} as const
