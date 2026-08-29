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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      availability_slots: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          lat: number | null
          lng: number | null
          location_text: string | null
          meeting_url: string | null
          mode: string
          skill_id: string
          starts_at: string
          status: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_text?: string | null
          meeting_url?: string | null
          mode: string
          skill_id: string
          starts_at: string
          status?: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_text?: string | null
          meeting_url?: string | null
          mode?: string
          skill_id?: string
          starts_at?: string
          status?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_slots_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          auto_confirm_at: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          created_at: string
          held_at: string | null
          id: string
          learner_id: string
          payment_type: string
          skill_id: string
          slot_id: string
          status: string
          swap_group_id: string | null
          teacher_id: string
        }
        Insert: {
          auto_confirm_at?: string | null
          cancelled_by?: string | null
          confirmed_at?: string | null
          created_at?: string
          held_at?: string | null
          id?: string
          learner_id: string
          payment_type: string
          skill_id: string
          slot_id: string
          status?: string
          swap_group_id?: string | null
          teacher_id: string
        }
        Update: {
          auto_confirm_at?: string | null
          cancelled_by?: string | null
          confirmed_at?: string | null
          created_at?: string
          held_at?: string | null
          id?: string
          learner_id?: string
          payment_type?: string
          skill_id?: string
          slot_id?: string
          status?: string
          swap_group_id?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: true
            referencedRelation: "availability_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: true
            referencedRelation: "slots_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_followee_id_fkey"
            columns: ["followee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          booking_id: string
          caption: string | null
          created_at: string
          id: string
          partner_id: string
          photo_url: string | null
          skill_id: string | null
          status: string
        }
        Insert: {
          author_id: string
          booking_id: string
          caption?: string | null
          created_at?: string
          id?: string
          partner_id: string
          photo_url?: string | null
          skill_id?: string | null
          status?: string
        }
        Update: {
          author_id?: string
          booking_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          partner_id?: string
          photo_url?: string | null
          skill_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          country: string | null
          created_at: string
          display_name: string
          headline: string | null
          id: string
          last_grant_at: string
          lat: number | null
          lng: number | null
          timezone: string
          token_balance: number
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_name: string
          headline?: string | null
          id: string
          last_grant_at?: string
          lat?: number | null
          lng?: number | null
          timezone?: string
          token_balance?: number
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_name?: string
          headline?: string | null
          id?: string
          last_grant_at?: string
          lat?: number | null
          lng?: number | null
          timezone?: string
          token_balance?: number
        }
        Relationships: []
      }
      request_responses: {
        Row: {
          created_at: string
          id: string
          message: string | null
          request_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          request_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          request_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "skill_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_responses_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_categories: {
        Row: {
          icon: string | null
          id: string
          name: string
          slug: string
          sort: number
        }
        Insert: {
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort?: number
        }
        Update: {
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort?: number
        }
        Relationships: []
      }
      skill_requests: {
        Row: {
          ai_verdict: Json | null
          created_at: string
          description: string | null
          id: string
          requester_id: string
          resolved_skill_id: string | null
          status: string
          title: string
        }
        Insert: {
          ai_verdict?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          requester_id: string
          resolved_skill_id?: string | null
          status?: string
          title: string
        }
        Update: {
          ai_verdict?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          requester_id?: string
          resolved_skill_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_requests_resolved_skill_id_fkey"
            columns: ["resolved_skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          category_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          slug: string
          status: string
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          slug: string
          status?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "skills_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "skill_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      swap_proposals: {
        Row: {
          created_at: string
          id: string
          message: string | null
          proposer_id: string
          proposer_slot_id: string
          responder_id: string
          responder_slot_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          proposer_id: string
          proposer_slot_id: string
          responder_id: string
          responder_slot_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          proposer_id?: string
          proposer_slot_id?: string
          responder_id?: string
          responder_slot_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "swap_proposals_proposer_id_fkey"
            columns: ["proposer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_proposals_proposer_slot_id_fkey"
            columns: ["proposer_slot_id"]
            isOneToOne: false
            referencedRelation: "availability_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_proposals_proposer_slot_id_fkey"
            columns: ["proposer_slot_id"]
            isOneToOne: false
            referencedRelation: "slots_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_proposals_responder_id_fkey"
            columns: ["responder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_proposals_responder_slot_id_fkey"
            columns: ["responder_slot_id"]
            isOneToOne: false
            referencedRelation: "availability_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_proposals_responder_slot_id_fkey"
            columns: ["responder_slot_id"]
            isOneToOne: false
            referencedRelation: "slots_public"
            referencedColumns: ["id"]
          },
        ]
      }
      token_ledger: {
        Row: {
          booking_id: string | null
          created_at: string
          delta: number
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          delta: number
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          delta?: number
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_ledger_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_skills: {
        Row: {
          blurb: string | null
          created_at: string
          id: string
          kind: string
          proficiency: string | null
          skill_id: string
          user_id: string
        }
        Insert: {
          blurb?: string | null
          created_at?: string
          id?: string
          kind: string
          proficiency?: string | null
          skill_id: string
          user_id: string
        }
        Update: {
          blurb?: string | null
          created_at?: string
          id?: string
          kind?: string
          proficiency?: string | null
          skill_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_skills_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      slots_public: {
        Row: {
          created_at: string | null
          ends_at: string | null
          id: string | null
          lat: number | null
          lng: number | null
          location_text: string | null
          meeting_url: string | null
          mode: string | null
          skill_id: string | null
          starts_at: string | null
          status: string | null
          teacher_id: string | null
        }
        Insert: {
          created_at?: string | null
          ends_at?: string | null
          id?: string | null
          lat?: number | null
          lng?: number | null
          location_text?: never
          meeting_url?: never
          mode?: string | null
          skill_id?: string | null
          starts_at?: string | null
          status?: string | null
          teacher_id?: string | null
        }
        Update: {
          created_at?: string | null
          ends_at?: string | null
          id?: string | null
          lat?: number | null
          lng?: number | null
          location_text?: never
          meeting_url?: never
          mode?: string | null
          skill_id?: string | null
          starts_at?: string | null
          status?: string | null
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_slots_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      book_slot_with_token: { Args: { p_slot_id: string }; Returns: string }
      cancel_booking: { Args: { p_booking_id: string }; Returns: undefined }
      claim_weekly_grant: { Args: never; Returns: number }
      complete_booking: { Args: { p_booking_id: string }; Returns: undefined }
      force_complete_booking: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      get_or_create_conversation: { Args: { p_other: string }; Returns: string }
      mark_session_held: { Args: { p_booking_id: string }; Returns: undefined }
      perfect_swaps: {
        Args: { p_user: string }
        Returns: {
          partner_id: string
          they_teach_id: string
          they_want_id: string
        }[]
      }
      propose_swap: {
        Args: {
          p_message?: string
          p_proposer_slot_id: string
          p_responder_slot_id: string
        }
        Returns: string
      }
      respond_to_swap: {
        Args: { p_accept: boolean; p_proposal_id: string }
        Returns: string
      }
      viewer_may_see_slot_details: {
        Args: { p_slot: string; p_teacher: string }
        Returns: boolean
      }
      withdraw_swap: { Args: { p_proposal_id: string }; Returns: undefined }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
