export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      ai_change_sets: {
        Row: {
          canvas_id: string
          created_at: string
          id: string
          request_id: string | null
          requested_by: string
          status: Database["public"]["Enums"]["ai_change_status"]
          updated_at: string
        }
        Insert: {
          canvas_id: string
          created_at?: string
          id?: string
          request_id?: string | null
          requested_by: string
          status?: Database["public"]["Enums"]["ai_change_status"]
          updated_at?: string
        }
        Update: {
          canvas_id?: string
          created_at?: string
          id?: string
          request_id?: string | null
          requested_by?: string
          status?: Database["public"]["Enums"]["ai_change_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_change_sets_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_change_sets_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_object_changes: {
        Row: {
          affected_fields: string[]
          after_state: Json | null
          before_state: Json | null
          change_set_id: string
          created_at: string
          explanation: string
          id: string
          object_id: string
        }
        Insert: {
          affected_fields: string[]
          after_state?: Json | null
          before_state?: Json | null
          change_set_id: string
          created_at?: string
          explanation?: string
          id?: string
          object_id: string
        }
        Update: {
          affected_fields?: string[]
          after_state?: Json | null
          before_state?: Json | null
          change_set_id?: string
          created_at?: string
          explanation?: string
          id?: string
          object_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_object_changes_change_set_id_fkey"
            columns: ["change_set_id"]
            isOneToOne: false
            referencedRelation: "ai_change_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_invitations: {
        Row: {
          canvas_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["canvas_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          updated_at: string
        }
        Insert: {
          canvas_id: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          role: Database["public"]["Enums"]["canvas_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
        }
        Update: {
          canvas_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["canvas_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_invitations_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_members: {
        Row: {
          canvas_id: string
          created_at: string
          role: Database["public"]["Enums"]["canvas_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          canvas_id: string
          created_at?: string
          role: Database["public"]["Enums"]["canvas_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          canvas_id?: string
          created_at?: string
          role?: Database["public"]["Enums"]["canvas_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_members_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_snapshots: {
        Row: {
          canvas_id: string
          created_at: string
          created_by: string
          id: string
          last_sequence: number
          state: string
          state_hash: string
          version: number
        }
        Insert: {
          canvas_id: string
          created_at?: string
          created_by: string
          id?: string
          last_sequence: number
          state: string
          state_hash: string
          version: number
        }
        Update: {
          canvas_id?: string
          created_at?: string
          created_by?: string
          id?: string
          last_sequence?: number
          state?: string
          state_hash?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "canvas_snapshots_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_updates: {
        Row: {
          actor_id: string
          canvas_id: string
          created_at: string
          id: number
          sequence: number
          update_data: string
        }
        Insert: {
          actor_id: string
          canvas_id: string
          created_at?: string
          id?: never
          sequence: number
          update_data: string
        }
        Update: {
          actor_id?: string
          canvas_id?: string
          created_at?: string
          id?: never
          sequence?: number
          update_data?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_updates_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_updates_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
        ]
      }
      canvases: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvases_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_prompts: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["comment_prompt_kind"]
          maximum: number | null
          minimum: number | null
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["comment_prompt_kind"]
          maximum?: number | null
          minimum?: number | null
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["comment_prompt_kind"]
          maximum?: number | null
          minimum?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "comment_prompts_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: true
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_replies: {
        Row: {
          author_id: string
          body: string
          comment_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          comment_id: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          comment_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_replies_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_replies_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_responses: {
        Row: {
          created_at: string
          id: string
          prompt_id: string
          responder_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          prompt_id: string
          responder_id: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          id?: string
          prompt_id?: string
          responder_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "comment_responses_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "comment_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_responses_responder_id_fkey"
            columns: ["responder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_targets: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          target_object_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          target_object_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          target_object_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_targets_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body: string
          canvas_id: string
          created_at: string
          id: string
          status: Database["public"]["Enums"]["comment_status"]
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          canvas_id: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["comment_status"]
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          canvas_id?: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["comment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      review_decisions: {
        Row: {
          created_at: string
          decision: Database["public"]["Enums"]["review_decision_kind"]
          id: string
          note: string | null
          object_change_id: string
          reviewer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decision: Database["public"]["Enums"]["review_decision_kind"]
          id?: string
          note?: string | null
          object_change_id: string
          reviewer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decision?: Database["public"]["Enums"]["review_decision_kind"]
          id?: string
          note?: string | null
          object_change_id?: string
          reviewer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_decisions_object_change_id_fkey"
            columns: ["object_change_id"]
            isOneToOne: false
            referencedRelation: "ai_object_changes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_decisions_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      starter_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          snapshot: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          snapshot: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          snapshot?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "starter_templates_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          author_id: string
          canvas_id: string
          created_at: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          canvas_id: string
          created_at?: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          canvas_id?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
        ]
      }
      story_scenes: {
        Row: {
          camera: Json
          created_at: string
          id: string
          narration: string | null
          position: number
          story_id: string
          target: Json
          updated_at: string
        }
        Insert: {
          camera: Json
          created_at?: string
          id?: string
          narration?: string | null
          position: number
          story_id: string
          target: Json
          updated_at?: string
        }
        Update: {
          camera?: Json
          created_at?: string
          id?: string
          narration?: string | null
          position?: number
          story_id?: string
          target?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_scenes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      ai_change_status:
        | "pending"
        | "applied"
        | "partially_reviewed"
        | "complete"
        | "failed"
      canvas_role: "owner" | "editor" | "commenter" | "viewer"
      comment_prompt_kind: "yes_no" | "review" | "rating"
      comment_status: "open" | "resolved" | "dismissed"
      invitation_status: "pending" | "accepted" | "revoked" | "expired"
      review_decision_kind: "keep" | "revise" | "discard"
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
    Enums: {
      ai_change_status: [
        "pending",
        "applied",
        "partially_reviewed",
        "complete",
        "failed",
      ],
      canvas_role: ["owner", "editor", "commenter", "viewer"],
      comment_prompt_kind: ["yes_no", "review", "rating"],
      comment_status: ["open", "resolved", "dismissed"],
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      review_decision_kind: ["keep", "revise", "discard"],
    },
  },
} as const

