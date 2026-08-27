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
          activated_at: string | null
          activation_sequence: number | null
          ai_run_id: string | null
          canvas_id: string
          completed_at: string | null
          created_at: string
          finalization_fingerprint: string | null
          id: string
          request_id: string | null
          requested_by: string
          scope_kind: string | null
          scope_object_ids: string[]
          source_comment_id: string | null
          stage_fingerprint: string | null
          status: Database["public"]["Enums"]["ai_change_status"]
          summary: string | null
          tool_call_key: string | null
          updated_at: string
          visual_feedback_metadata: Json
        }
        Insert: {
          activated_at?: string | null
          activation_sequence?: number | null
          ai_run_id?: string | null
          canvas_id: string
          completed_at?: string | null
          created_at?: string
          finalization_fingerprint?: string | null
          id?: string
          request_id?: string | null
          requested_by: string
          scope_kind?: string | null
          scope_object_ids?: string[]
          source_comment_id?: string | null
          stage_fingerprint?: string | null
          status?: Database["public"]["Enums"]["ai_change_status"]
          summary?: string | null
          tool_call_key?: string | null
          updated_at?: string
          visual_feedback_metadata?: Json
        }
        Update: {
          activated_at?: string | null
          activation_sequence?: number | null
          ai_run_id?: string | null
          canvas_id?: string
          completed_at?: string | null
          created_at?: string
          finalization_fingerprint?: string | null
          id?: string
          request_id?: string | null
          requested_by?: string
          scope_kind?: string | null
          scope_object_ids?: string[]
          source_comment_id?: string | null
          stage_fingerprint?: string | null
          status?: Database["public"]["Enums"]["ai_change_status"]
          summary?: string | null
          tool_call_key?: string | null
          updated_at?: string
          visual_feedback_metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_change_sets_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "ai_change_sets_source_comment_id_fkey"
            columns: ["source_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
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
          conflict_metadata: Json
          created_at: string
          explanation: string
          id: string
          object_id: string
          result_sequence: number | null
          review_status: string
          what_changed: string | null
          why: string | null
        }
        Insert: {
          affected_fields: string[]
          after_state?: Json | null
          before_state?: Json | null
          change_set_id: string
          conflict_metadata?: Json
          created_at?: string
          explanation?: string
          id?: string
          object_id: string
          result_sequence?: number | null
          review_status?: string
          what_changed?: string | null
          why?: string | null
        }
        Update: {
          affected_fields?: string[]
          after_state?: Json | null
          before_state?: Json | null
          change_set_id?: string
          conflict_metadata?: Json
          created_at?: string
          explanation?: string
          id?: string
          object_id?: string
          result_sequence?: number | null
          review_status?: string
          what_changed?: string | null
          why?: string | null
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
      ai_rate_limit_windows: {
        Row: {
          canvas_id: string
          input_tokens: number
          output_tokens: number
          request_count: number
          updated_at: string
          user_id: string
          window_ends_at: string
          window_started_at: string
        }
        Insert: {
          canvas_id: string
          input_tokens?: number
          output_tokens?: number
          request_count?: number
          updated_at?: string
          user_id: string
          window_ends_at: string
          window_started_at: string
        }
        Update: {
          canvas_id?: string
          input_tokens?: number
          output_tokens?: number
          request_count?: number
          updated_at?: string
          user_id?: string
          window_ends_at?: string
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_rate_limit_windows_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_rate_limit_windows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_runs: {
        Row: {
          authority_snapshot: Database["public"]["Enums"]["ai_authority_level"]
          budget_reserved_at: string | null
          cancelled_at: string | null
          canvas_id: string
          created_at: string
          error_code: string | null
          id: string
          idempotency_key: string
          input_tokens: number | null
          invoking_comment_id: string | null
          invoking_reply_id: string | null
          latency_ms: number | null
          model: string | null
          ordered_context_ids: string[]
          output_comment_id: string | null
          output_reply_id: string | null
          output_tokens: number | null
          projection_metadata: Json
          provider_request_id: string | null
          rate_window_started_at: string | null
          requested_by: string
          reserved_input_tokens: number | null
          reserved_output_tokens: number | null
          status: Database["public"]["Enums"]["ai_run_status"]
          updated_at: string
        }
        Insert: {
          authority_snapshot: Database["public"]["Enums"]["ai_authority_level"]
          budget_reserved_at?: string | null
          cancelled_at?: string | null
          canvas_id: string
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key: string
          input_tokens?: number | null
          invoking_comment_id?: string | null
          invoking_reply_id?: string | null
          latency_ms?: number | null
          model?: string | null
          ordered_context_ids?: string[]
          output_comment_id?: string | null
          output_reply_id?: string | null
          output_tokens?: number | null
          projection_metadata?: Json
          provider_request_id?: string | null
          rate_window_started_at?: string | null
          requested_by: string
          reserved_input_tokens?: number | null
          reserved_output_tokens?: number | null
          status?: Database["public"]["Enums"]["ai_run_status"]
          updated_at?: string
        }
        Update: {
          authority_snapshot?: Database["public"]["Enums"]["ai_authority_level"]
          budget_reserved_at?: string | null
          cancelled_at?: string | null
          canvas_id?: string
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key?: string
          input_tokens?: number | null
          invoking_comment_id?: string | null
          invoking_reply_id?: string | null
          latency_ms?: number | null
          model?: string | null
          ordered_context_ids?: string[]
          output_comment_id?: string | null
          output_reply_id?: string | null
          output_tokens?: number | null
          projection_metadata?: Json
          provider_request_id?: string | null
          rate_window_started_at?: string | null
          requested_by?: string
          reserved_input_tokens?: number | null
          reserved_output_tokens?: number | null
          status?: Database["public"]["Enums"]["ai_run_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_invoking_comment_id_fkey"
            columns: ["invoking_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_invoking_reply_thread_fk"
            columns: ["invoking_reply_id", "invoking_comment_id"]
            isOneToOne: false
            referencedRelation: "comment_replies"
            referencedColumns: ["id", "comment_id"]
          },
          {
            foreignKeyName: "ai_runs_output_comment_id_fkey"
            columns: ["output_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_output_reply_thread_fk"
            columns: ["output_reply_id", "output_comment_id"]
            isOneToOne: false
            referencedRelation: "comment_replies"
            referencedColumns: ["id", "comment_id"]
          },
          {
            foreignKeyName: "ai_runs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_tool_executions: {
        Row: {
          affected_object_ids: string[]
          call_key: string
          change_set_id: string | null
          command_id: string | null
          comment_id: string | null
          created_at: string
          error_code: string | null
          id: string
          outcome: Database["public"]["Enums"]["ai_tool_outcome"]
          run_id: string
          tool_name: string
          updated_at: string
        }
        Insert: {
          affected_object_ids?: string[]
          call_key: string
          change_set_id?: string | null
          command_id?: string | null
          comment_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          outcome?: Database["public"]["Enums"]["ai_tool_outcome"]
          run_id: string
          tool_name: string
          updated_at?: string
        }
        Update: {
          affected_object_ids?: string[]
          call_key?: string
          change_set_id?: string | null
          command_id?: string | null
          comment_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          outcome?: Database["public"]["Enums"]["ai_tool_outcome"]
          run_id?: string
          tool_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tool_executions_change_set_id_fkey"
            columns: ["change_set_id"]
            isOneToOne: false
            referencedRelation: "ai_change_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tool_executions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tool_executions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_ai_settings: {
        Row: {
          authority: Database["public"]["Enums"]["ai_authority_level"]
          canvas_id: string
          changed_by: string
          created_at: string
          enabled: boolean
          updated_at: string
          version: number
        }
        Insert: {
          authority?: Database["public"]["Enums"]["ai_authority_level"]
          canvas_id: string
          changed_by: string
          created_at?: string
          enabled?: boolean
          updated_at?: string
          version?: number
        }
        Update: {
          authority?: Database["public"]["Enums"]["ai_authority_level"]
          canvas_id?: string
          changed_by?: string
          created_at?: string
          enabled?: boolean
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "canvas_ai_settings_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: true
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_ai_settings_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          client_update_id: string
          created_at: string
          id: number
          sequence: number
          update_data: string
        }
        Insert: {
          actor_id: string
          canvas_id: string
          client_update_id?: string
          created_at?: string
          id?: never
          sequence: number
          update_data: string
        }
        Update: {
          actor_id?: string
          canvas_id?: string
          client_update_id?: string
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
      comment_message_recipients: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          recipient_ai_key: string | null
          recipient_kind: Database["public"]["Enums"]["comment_author_kind"]
          recipient_user_id: string | null
          reply_id: string | null
          routing_version: number
          source: Database["public"]["Enums"]["comment_recipient_source"]
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          recipient_ai_key?: string | null
          recipient_kind: Database["public"]["Enums"]["comment_author_kind"]
          recipient_user_id?: string | null
          reply_id?: string | null
          routing_version: number
          source: Database["public"]["Enums"]["comment_recipient_source"]
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          recipient_ai_key?: string | null
          recipient_kind?: Database["public"]["Enums"]["comment_author_kind"]
          recipient_user_id?: string | null
          reply_id?: string | null
          routing_version?: number
          source?: Database["public"]["Enums"]["comment_recipient_source"]
        }
        Relationships: [
          {
            foreignKeyName: "comment_message_recipients_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_message_recipients_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_message_recipients_reply_thread_fk"
            columns: ["reply_id", "comment_id"]
            isOneToOne: false
            referencedRelation: "comment_replies"
            referencedColumns: ["id", "comment_id"]
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
          author_key: string
          author_kind: Database["public"]["Enums"]["comment_author_kind"]
          body: string
          client_command_id: string | null
          command_fingerprint: string | null
          comment_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          author_key: string
          author_kind?: Database["public"]["Enums"]["comment_author_kind"]
          body: string
          client_command_id?: string | null
          command_fingerprint?: string | null
          comment_id: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          author_key?: string
          author_kind?: Database["public"]["Enums"]["comment_author_kind"]
          body?: string
          client_command_id?: string | null
          command_fingerprint?: string | null
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
          client_command_id: string | null
          created_at: string
          id: string
          prompt_id: string
          responder_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          client_command_id?: string | null
          created_at?: string
          id?: string
          prompt_id: string
          responder_id: string
          updated_at?: string
          value: Json
        }
        Update: {
          client_command_id?: string | null
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
          target_order: number
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          target_object_id: string
          target_order: number
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          target_object_id?: string
          target_order?: number
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
      comment_thread_participants: {
        Row: {
          changed_by_reply_id: string | null
          comment_id: string
          created_at: string
          id: string
          participant_ai_key: string | null
          participant_kind: Database["public"]["Enums"]["comment_author_kind"]
          participant_user_id: string | null
          routing_version: number
          updated_at: string
        }
        Insert: {
          changed_by_reply_id?: string | null
          comment_id: string
          created_at?: string
          id?: string
          participant_ai_key?: string | null
          participant_kind: Database["public"]["Enums"]["comment_author_kind"]
          participant_user_id?: string | null
          routing_version: number
          updated_at?: string
        }
        Update: {
          changed_by_reply_id?: string | null
          comment_id?: string
          created_at?: string
          id?: string
          participant_ai_key?: string | null
          participant_kind?: Database["public"]["Enums"]["comment_author_kind"]
          participant_user_id?: string | null
          routing_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_thread_participants_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_thread_participants_participant_user_id_fkey"
            columns: ["participant_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_thread_participants_reply_thread_fk"
            columns: ["changed_by_reply_id", "comment_id"]
            isOneToOne: false
            referencedRelation: "comment_replies"
            referencedColumns: ["id", "comment_id"]
          },
        ]
      }
      comments: {
        Row: {
          anchor_x: number | null
          anchor_y: number | null
          author_id: string
          author_key: string
          author_kind: Database["public"]["Enums"]["comment_author_kind"]
          body: string
          canvas_id: string
          client_command_id: string | null
          command_fingerprint: string | null
          created_at: string
          id: string
          status: Database["public"]["Enums"]["comment_status"]
          updated_at: string
        }
        Insert: {
          anchor_x?: number | null
          anchor_y?: number | null
          author_id: string
          author_key: string
          author_kind?: Database["public"]["Enums"]["comment_author_kind"]
          body: string
          canvas_id: string
          client_command_id?: string | null
          command_fingerprint?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["comment_status"]
          updated_at?: string
        }
        Update: {
          anchor_x?: number | null
          anchor_y?: number | null
          author_id?: string
          author_key?: string
          author_kind?: Database["public"]["Enums"]["comment_author_kind"]
          body?: string
          canvas_id?: string
          client_command_id?: string | null
          command_fingerprint?: string | null
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
          child_run_id: string | null
          created_at: string
          decision: Database["public"]["Enums"]["review_decision_kind"]
          id: string
          idempotency_key: string | null
          note: string | null
          object_change_id: string
          result_sequence: number | null
          reviewer_id: string
          updated_at: string
        }
        Insert: {
          child_run_id?: string | null
          created_at?: string
          decision: Database["public"]["Enums"]["review_decision_kind"]
          id?: string
          idempotency_key?: string | null
          note?: string | null
          object_change_id: string
          result_sequence?: number | null
          reviewer_id: string
          updated_at?: string
        }
        Update: {
          child_run_id?: string | null
          created_at?: string
          decision?: Database["public"]["Enums"]["review_decision_kind"]
          id?: string
          idempotency_key?: string | null
          note?: string | null
          object_change_id?: string
          result_sequence?: number | null
          reviewer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_decisions_child_run_id_fkey"
            columns: ["child_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
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
          kind: string
          review_change_set_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          canvas_id: string
          created_at?: string
          id?: string
          kind?: string
          review_change_set_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          canvas_id?: string
          created_at?: string
          id?: string
          kind?: string
          review_change_set_id?: string | null
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
          {
            foreignKeyName: "stories_review_change_set_id_fkey"
            columns: ["review_change_set_id"]
            isOneToOne: false
            referencedRelation: "ai_change_sets"
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
          object_change_id: string | null
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
          object_change_id?: string | null
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
          object_change_id?: string | null
          position?: number
          story_id?: string
          target?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_scenes_object_change_id_fkey"
            columns: ["object_change_id"]
            isOneToOne: false
            referencedRelation: "ai_object_changes"
            referencedColumns: ["id"]
          },
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
      activate_ai_review_stage: {
        Args: {
          target_change_set_id: string
          target_expected_sequence: number
          target_requester_id: string
          target_update_data: string
        }
        Returns: {
          created: boolean
          sequence: number
        }[]
      }
      append_canvas_update:
        | {
            Args: {
              client_update_id: string
              target_canvas_id: string
              update_data: string
            }
            Returns: {
              created_at: string
              inserted: boolean
              sequence: number
            }[]
          }
        | {
            Args: { target_canvas_id: string; update_data: string }
            Returns: {
              created_at: string
              sequence: number
            }[]
          }
      cancel_ai_run: {
        Args: { target_run_id: string }
        Returns: {
          cancelled_at: string
          run_id: string
          status: Database["public"]["Enums"]["ai_run_status"]
        }[]
      }
      complete_ai_run: {
        Args: {
          target_body: string
          target_input_tokens: number
          target_latency_ms: number
          target_model: string
          target_output_tokens: number
          target_projection_metadata: Json
          target_provider_request_id: string
          target_run_id: string
        }
        Returns: {
          reply_id: string
          run_id: string
          status: Database["public"]["Enums"]["ai_run_status"]
        }[]
      }
      complete_fake_ai_run: {
        Args: {
          target_body: string
          target_projection_metadata: Json
          target_provider_request_id: string
          target_run_id: string
        }
        Returns: {
          reply_id: string
          run_id: string
          status: Database["public"]["Enums"]["ai_run_status"]
        }[]
      }
      create_comment_reply: {
        Args: {
          target_author_key?: string
          target_author_kind?: Database["public"]["Enums"]["comment_author_kind"]
          target_body: string
          target_client_command_id: string
          target_comment_id: string
          target_include_primary_ai?: boolean
          target_recipient_user_ids?: string[]
        }
        Returns: {
          ai_run_id: string
          created: boolean
          reply_id: string
        }[]
      }
      create_comment_thread: {
        Args: {
          target_anchor_x?: number
          target_anchor_y?: number
          target_author_key?: string
          target_author_kind?: Database["public"]["Enums"]["comment_author_kind"]
          target_body: string
          target_canvas_id: string
          target_client_command_id: string
          target_include_primary_ai?: boolean
          target_object_ids?: string[]
          target_ordered_context_ids?: string[]
          target_prompt_kind?: Database["public"]["Enums"]["comment_prompt_kind"]
          target_recipient_user_ids?: string[]
        }
        Returns: {
          ai_run_id: string
          comment_id: string
          created: boolean
        }[]
      }
      decide_ai_review_object: {
        Args: {
          target_conflicts?: Json
          target_decision: Database["public"]["Enums"]["review_decision_kind"]
          target_expected_sequence: number
          target_idempotency_key: string
          target_note: string
          target_object_change_id: string
          target_reviewer_id: string
          target_update_data: string
        }
        Returns: {
          created: boolean
          decision_id: string
          result_sequence: number
          review_status: string
        }[]
      }
      delete_comment_thread: {
        Args: { target_comment_id: string }
        Returns: string
      }
      execute_ai_canvas_commands: {
        Args: {
          target_affected_object_ids: string[]
          target_call_key: string
          target_command_id: string
          target_expected_sequence: number
          target_requester_id: string
          target_run_id: string
          target_update_data: string
        }
        Returns: {
          created: boolean
          sequence: number
          tool_execution_id: string
        }[]
      }
      execute_ai_contextual_comment: {
        Args: {
          target_body: string
          target_call_key: string
          target_expected_sequence: number
          target_object_ids: string[]
          target_requester_id: string
          target_run_id: string
        }
        Returns: {
          comment_id: string
          created: boolean
          tool_execution_id: string
        }[]
      }
      fail_ai_run: {
        Args: { target_error_code: string; target_run_id: string }
        Returns: {
          error_code: string
          run_id: string
          status: Database["public"]["Enums"]["ai_run_status"]
        }[]
      }
      finalize_ai_review_stage: {
        Args: {
          target_change_set_id: string
          target_explanations: Json
          target_requester_id: string
          target_scope_kind: string
          target_scope_object_ids: string[]
          target_summary: string
          target_visual_feedback_metadata?: Json
        }
        Returns: {
          change_set_id: string
          created: boolean
          object_change_count: number
        }[]
      }
      get_ai_canvas_execution_retry: {
        Args: {
          target_call_key: string
          target_command_id: string
          target_requester_id: string
          target_run_id: string
        }
        Returns: {
          affected_object_ids: string[]
          sequence: number
          update_data: string
        }[]
      }
      get_canvas_ai_access: {
        Args: { target_canvas_id: string }
        Returns: {
          can_manage: boolean
          configured_authority: Database["public"]["Enums"]["ai_authority_level"]
          effective_authority: Database["public"]["Enums"]["ai_authority_level"]
          enabled: boolean
          version: number
        }[]
      }
      link_ai_review_revision: {
        Args: {
          target_child_run_id: string
          target_decision_id: string
          target_reviewer_id: string
        }
        Returns: undefined
      }
      publish_canvas_compaction: {
        Args: {
          covered_last_sequence: number
          expected_state_hash: string
          snapshot_state: string
          target_canvas_id: string
        }
        Returns: {
          last_sequence: number
          pruned_updates: number
          state_hash: string
          version: number
        }[]
      }
      record_ai_canvas_proposal: {
        Args: {
          target_affected_object_ids: string[]
          target_call_key: string
          target_expected_sequence: number
          target_requester_id: string
          target_run_id: string
        }
        Returns: {
          created: boolean
          tool_execution_id: string
        }[]
      }
      reserve_ai_run_budget: {
        Args: {
          target_input_tokens: number
          target_output_tokens: number
          target_requester_id: string
          target_run_id: string
        }
        Returns: {
          canvas_request_count: number
          reserved: boolean
          user_request_count: number
          window_ends_at: string
        }[]
      }
      respond_to_comment_prompt: {
        Args: {
          target_client_command_id: string
          target_prompt_id: string
          target_value: Json
        }
        Returns: {
          created: boolean
          response_id: string
        }[]
      }
      retry_ai_run: {
        Args: { target_idempotency_key: string; target_run_id: string }
        Returns: {
          created: boolean
          run_id: string
          status: Database["public"]["Enums"]["ai_run_status"]
        }[]
      }
      set_canvas_ai_settings: {
        Args: {
          target_authority: Database["public"]["Enums"]["ai_authority_level"]
          target_canvas_id: string
          target_enabled: boolean
          target_expected_version?: number
        }
        Returns: {
          authority: Database["public"]["Enums"]["ai_authority_level"]
          canvas_id: string
          changed_by: string
          created_at: string
          enabled: boolean
          updated_at: string
          version: number
        }[]
      }
      set_comment_prompt: {
        Args: {
          target_comment_id: string
          target_prompt_kind?: Database["public"]["Enums"]["comment_prompt_kind"]
        }
        Returns: string
      }
      stage_ai_canvas_changes: {
        Args: {
          target_call_key: string
          target_changes: Json
          target_expected_sequence: number
          target_requester_id: string
          target_run_id: string
          target_summary: string
        }
        Returns: {
          change_set_id: string
          created: boolean
          object_change_count: number
        }[]
      }
      start_ai_run: {
        Args: { target_run_id: string }
        Returns: {
          run_id: string
          status: Database["public"]["Enums"]["ai_run_status"]
        }[]
      }
      transition_comment_status: {
        Args: {
          target_comment_id: string
          target_status: Database["public"]["Enums"]["comment_status"]
        }
        Returns: Database["public"]["Enums"]["comment_status"]
      }
      update_comment_body: {
        Args: { target_body: string; target_comment_id: string }
        Returns: string
      }
    }
    Enums: {
      ai_authority_level:
        | "comment_only"
        | "propose_changes"
        | "edit_with_review"
        | "trusted_editor"
      ai_change_status:
        | "pending"
        | "applied"
        | "partially_reviewed"
        | "complete"
        | "failed"
      ai_run_status:
        | "queued"
        | "projecting"
        | "thinking"
        | "tool_pending"
        | "applying"
        | "completed"
        | "cancelled"
        | "failed"
      ai_tool_outcome:
        | "pending"
        | "succeeded"
        | "denied"
        | "cancelled"
        | "failed"
      canvas_role: "owner" | "editor" | "commenter" | "viewer"
      comment_author_kind: "human" | "ai"
      comment_prompt_kind: "yes_no" | "review" | "rating"
      comment_recipient_source: "explicit" | "inherited"
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
      ai_authority_level: [
        "comment_only",
        "propose_changes",
        "edit_with_review",
        "trusted_editor",
      ],
      ai_change_status: [
        "pending",
        "applied",
        "partially_reviewed",
        "complete",
        "failed",
      ],
      ai_run_status: [
        "queued",
        "projecting",
        "thinking",
        "tool_pending",
        "applying",
        "completed",
        "cancelled",
        "failed",
      ],
      ai_tool_outcome: [
        "pending",
        "succeeded",
        "denied",
        "cancelled",
        "failed",
      ],
      canvas_role: ["owner", "editor", "commenter", "viewer"],
      comment_author_kind: ["human", "ai"],
      comment_prompt_kind: ["yes_no", "review", "rating"],
      comment_recipient_source: ["explicit", "inherited"],
      comment_status: ["open", "resolved", "dismissed"],
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      review_decision_kind: ["keep", "revise", "discard"],
    },
  },
} as const
