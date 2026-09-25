export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      archers: {
        Row: {
          age_class: string
          bale_number: number | null
          bow_style: string
          club: string | null
          created_at: string
          created_via: string
          deleted_at: string | null
          division_id: string | null
          full_name: string
          gender: string
          id: string
          import_batch_id: string | null
          membership_id: string | null
          registration_locked: boolean
          seed_rank: number | null
          slot_index: number | null
          state: string | null
          tournament_id: string
        }
        Insert: {
          age_class: string
          bale_number?: number | null
          bow_style: string
          club?: string | null
          created_at?: string
          created_via?: string
          deleted_at?: string | null
          division_id?: string | null
          full_name: string
          gender: string
          id?: string
          import_batch_id?: string | null
          membership_id?: string | null
          registration_locked?: boolean
          seed_rank?: number | null
          slot_index?: number | null
          state?: string | null
          tournament_id: string
        }
        Update: {
          age_class?: string
          bale_number?: number | null
          bow_style?: string
          club?: string | null
          created_at?: string
          created_via?: string
          deleted_at?: string | null
          division_id?: string | null
          full_name?: string
          gender?: string
          id?: string
          import_batch_id?: string | null
          membership_id?: string | null
          registration_locked?: boolean
          seed_rank?: number | null
          slot_index?: number | null
          state?: string | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "archers_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archers_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "public_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archers_import_fk"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archers_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archers_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archers_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          division_id: string | null
          entity: string | null
          entity_id: string | null
          id: number
          reason: string | null
          tournament_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          division_id?: string | null
          entity?: string | null
          entity_id?: string | null
          id?: number
          reason?: string | null
          tournament_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          division_id?: string | null
          entity?: string | null
          entity_id?: string | null
          id?: number
          reason?: string | null
          tournament_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "public_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          age_class: string
          bow_style: string
          display_name: string
          gender: string
          id: string
          match_format_code: string
          round_code: string
          sort_order: number
          tournament_id: string
        }
        Insert: {
          age_class: string
          bow_style: string
          display_name: string
          gender: string
          id?: string
          match_format_code: string
          round_code: string
          sort_order?: number
          tournament_id: string
        }
        Update: {
          age_class?: string
          bow_style?: string
          display_name?: string
          gender?: string
          id?: string
          match_format_code?: string
          round_code?: string
          sort_order?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      divisions: {
        Row: {
          bracket_size: number | null
          category_id: string
          event_kind: string
          id: string
          phase: string
          phase_changed_at: string
          phase_changed_by: string | null
          tournament_id: string
        }
        Insert: {
          bracket_size?: number | null
          category_id: string
          event_kind?: string
          id?: string
          phase?: string
          phase_changed_at?: string
          phase_changed_by?: string | null
          tournament_id: string
        }
        Update: {
          bracket_size?: number | null
          category_id?: string
          event_kind?: string
          id?: string
          phase?: string
          phase_changed_at?: string
          phase_changed_by?: string | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "divisions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "divisions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "divisions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      ends: {
        Row: {
          archer_id: string | null
          arrows: Json
          created_at: string
          distance_index: number
          division_id: string
          end_number: number
          entered_by: string | null
          id: string
          match_id: string | null
          stage: string
          team_id: string | null
          ten_count: number
          total: number
          tournament_id: string
          verified_at: string | null
          verified_by: string | null
          x_count: number
        }
        Insert: {
          archer_id?: string | null
          arrows: Json
          created_at?: string
          distance_index?: number
          division_id: string
          end_number: number
          entered_by?: string | null
          id?: string
          match_id?: string | null
          stage: string
          team_id?: string | null
          ten_count?: number
          total: number
          tournament_id: string
          verified_at?: string | null
          verified_by?: string | null
          x_count?: number
        }
        Update: {
          archer_id?: string | null
          arrows?: Json
          created_at?: string
          distance_index?: number
          division_id?: string
          end_number?: number
          entered_by?: string | null
          id?: string
          match_id?: string | null
          stage?: string
          team_id?: string | null
          ten_count?: number
          total?: number
          tournament_id?: string
          verified_at?: string | null
          verified_by?: string | null
          x_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "ends_archer_id_fkey"
            columns: ["archer_id"]
            isOneToOne: false
            referencedRelation: "archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_archer_id_fkey"
            columns: ["archer_id"]
            isOneToOne: false
            referencedRelation: "public_archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "public_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_match_fk"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_match_fk"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "public_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          committed_at: string | null
          created_at: string
          error: string | null
          id: string
          membership_id: string
          original_filename: string | null
          row_count: number
          source: string
          status: string
          storage_path: string | null
          tournament_id: string
        }
        Insert: {
          committed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          membership_id: string
          original_filename?: string | null
          row_count?: number
          source: string
          status?: string
          storage_path?: string | null
          tournament_id: string
        }
        Update: {
          committed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          membership_id?: string
          original_filename?: string | null
          row_count?: number
          source?: string
          status?: string
          storage_path?: string | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          action: string
          archer_id: string | null
          batch_id: string
          errors: string[]
          id: string
          parsed: Json | null
          raw: Json
          row_index: number
        }
        Insert: {
          action?: string
          archer_id?: string | null
          batch_id: string
          errors?: string[]
          id?: string
          parsed?: Json | null
          raw: Json
          row_index: number
        }
        Update: {
          action?: string
          archer_id?: string | null
          batch_id?: string
          errors?: string[]
          id?: string
          parsed?: Json | null
          raw?: Json
          row_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_archer_id_fkey"
            columns: ["archer_id"]
            isOneToOne: false
            referencedRelation: "archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_archer_id_fkey"
            columns: ["archer_id"]
            isOneToOne: false
            referencedRelation: "public_archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_assignments: {
        Row: {
          bale_number: number
          created_at: string
          id: string
          membership_id: string
          tournament_id: string
        }
        Insert: {
          bale_number: number
          created_at?: string
          id?: string
          membership_id: string
          tournament_id: string
        }
        Update: {
          bale_number?: number
          created_at?: string
          id?: string
          membership_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "judge_assignments_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          archer1_id: string | null
          archer2_id: string | null
          bale_number: number | null
          closest_to_centre: number | null
          created_at: string
          decided_by: string | null
          division_id: string
          id: string
          match_number: number
          round: string
          seed1: number | null
          seed2: number | null
          set_points_1: number
          set_points_2: number
          status: string
          team1_id: string | null
          team2_id: string | null
          total_1: number
          total_2: number
          tournament_id: string
          winner_archer_id: string | null
          winner_team_id: string | null
        }
        Insert: {
          archer1_id?: string | null
          archer2_id?: string | null
          bale_number?: number | null
          closest_to_centre?: number | null
          created_at?: string
          decided_by?: string | null
          division_id: string
          id?: string
          match_number: number
          round: string
          seed1?: number | null
          seed2?: number | null
          set_points_1?: number
          set_points_2?: number
          status?: string
          team1_id?: string | null
          team2_id?: string | null
          total_1?: number
          total_2?: number
          tournament_id: string
          winner_archer_id?: string | null
          winner_team_id?: string | null
        }
        Update: {
          archer1_id?: string | null
          archer2_id?: string | null
          bale_number?: number | null
          closest_to_centre?: number | null
          created_at?: string
          decided_by?: string | null
          division_id?: string
          id?: string
          match_number?: number
          round?: string
          seed1?: number | null
          seed2?: number | null
          set_points_1?: number
          set_points_2?: number
          status?: string
          team1_id?: string | null
          team2_id?: string | null
          total_1?: number
          total_2?: number
          tournament_id?: string
          winner_archer_id?: string | null
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_archer1_id_fkey"
            columns: ["archer1_id"]
            isOneToOne: false
            referencedRelation: "archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_archer1_id_fkey"
            columns: ["archer1_id"]
            isOneToOne: false
            referencedRelation: "public_archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_archer2_id_fkey"
            columns: ["archer2_id"]
            isOneToOne: false
            referencedRelation: "archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_archer2_id_fkey"
            columns: ["archer2_id"]
            isOneToOne: false
            referencedRelation: "public_archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "public_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team1_id_fkey"
            columns: ["team1_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team2_id_fkey"
            columns: ["team2_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_archer_id_fkey"
            columns: ["winner_archer_id"]
            isOneToOne: false
            referencedRelation: "archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_archer_id_fkey"
            columns: ["winner_archer_id"]
            isOneToOne: false
            referencedRelation: "public_archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          accepted_at: string | null
          club: string | null
          expires_at: string
          id: string
          invited_at: string
          invited_by: string | null
          invited_email: string
          revoked_at: string | null
          role: string
          status: string
          tournament_id: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          club?: string | null
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          invited_email: string
          revoked_at?: string | null
          role: string
          status?: string
          tournament_id: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          club?: string | null
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          invited_email?: string
          revoked_at?: string | null
          role?: string
          status?: string
          tournament_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      results: {
        Row: {
          archer_id: string | null
          division_id: string
          final_rank: number | null
          id: string
          medal: string | null
          needs_shoot_off: boolean
          qualification_rank: number | null
          qualification_tens: number
          qualification_total: number
          qualification_xs: number
          shoot_off_position: number | null
          team_id: string | null
          tournament_id: string
          updated_at: string
        }
        Insert: {
          archer_id?: string | null
          division_id: string
          final_rank?: number | null
          id?: string
          medal?: string | null
          needs_shoot_off?: boolean
          qualification_rank?: number | null
          qualification_tens?: number
          qualification_total?: number
          qualification_xs?: number
          shoot_off_position?: number | null
          team_id?: string | null
          tournament_id: string
          updated_at?: string
        }
        Update: {
          archer_id?: string | null
          division_id?: string
          final_rank?: number | null
          id?: string
          medal?: string | null
          needs_shoot_off?: boolean
          qualification_rank?: number | null
          qualification_tens?: number
          qualification_total?: number
          qualification_xs?: number
          shoot_off_position?: number | null
          team_id?: string | null
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "results_archer_id_fkey"
            columns: ["archer_id"]
            isOneToOne: false
            referencedRelation: "archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_archer_id_fkey"
            columns: ["archer_id"]
            isOneToOne: false
            referencedRelation: "public_archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "public_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          archer_id: string
          position: number
          team_id: string
        }
        Insert: {
          archer_id: string
          position: number
          team_id: string
        }
        Update: {
          archer_id?: string
          position?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_archer_id_fkey"
            columns: ["archer_id"]
            isOneToOne: false
            referencedRelation: "archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_archer_id_fkey"
            columns: ["archer_id"]
            isOneToOne: false
            referencedRelation: "public_archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          club: string | null
          created_at: string
          division_id: string
          id: string
          name: string
          seed_rank: number | null
          tournament_id: string
        }
        Insert: {
          club?: string | null
          created_at?: string
          division_id: string
          id?: string
          name: string
          seed_rank?: number | null
          tournament_id: string
        }
        Update: {
          club?: string | null
          created_at?: string
          division_id?: string
          id?: string
          name?: string
          seed_rank?: number | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "public_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_published: boolean
          name: string
          owner_id: string
          rules_reference: string | null
          start_date: string
          venue: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_published?: boolean
          name: string
          owner_id: string
          rules_reference?: string | null
          start_date: string
          venue?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_published?: boolean
          name?: string
          owner_id?: string
          rules_reference?: string | null
          start_date?: string
          venue?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      public_archers: {
        Row: {
          bale_number: number | null
          club: string | null
          division_id: string | null
          full_name: string | null
          id: string | null
          slot_index: number | null
          tournament_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "archers_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archers_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "public_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archers_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archers_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      public_divisions: {
        Row: {
          age_class: string | null
          bow_style: string | null
          bracket_size: number | null
          category_id: string | null
          display_name: string | null
          event_kind: string | null
          gender: string | null
          id: string | null
          match_format_code: string | null
          phase: string | null
          round_code: string | null
          sort_order: number | null
          tournament_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "divisions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "divisions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "divisions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      public_ends: {
        Row: {
          archer_id: string | null
          arrows: Json | null
          distance_index: number | null
          division_id: string | null
          end_number: number | null
          id: string | null
          match_id: string | null
          stage: string | null
          team_id: string | null
          ten_count: number | null
          total: number | null
          tournament_id: string | null
          x_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ends_archer_id_fkey"
            columns: ["archer_id"]
            isOneToOne: false
            referencedRelation: "archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_archer_id_fkey"
            columns: ["archer_id"]
            isOneToOne: false
            referencedRelation: "public_archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "public_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_match_fk"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_match_fk"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "public_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ends_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      public_matches: {
        Row: {
          archer1_id: string | null
          archer2_id: string | null
          bale_number: number | null
          decided_by: string | null
          division_id: string | null
          id: string | null
          match_number: number | null
          round: string | null
          seed1: number | null
          seed2: number | null
          set_points_1: number | null
          set_points_2: number | null
          status: string | null
          team1_id: string | null
          team2_id: string | null
          total_1: number | null
          total_2: number | null
          tournament_id: string | null
          winner_archer_id: string | null
          winner_team_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_archer1_id_fkey"
            columns: ["archer1_id"]
            isOneToOne: false
            referencedRelation: "archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_archer1_id_fkey"
            columns: ["archer1_id"]
            isOneToOne: false
            referencedRelation: "public_archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_archer2_id_fkey"
            columns: ["archer2_id"]
            isOneToOne: false
            referencedRelation: "archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_archer2_id_fkey"
            columns: ["archer2_id"]
            isOneToOne: false
            referencedRelation: "public_archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "public_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team1_id_fkey"
            columns: ["team1_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team2_id_fkey"
            columns: ["team2_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_archer_id_fkey"
            columns: ["winner_archer_id"]
            isOneToOne: false
            referencedRelation: "archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_archer_id_fkey"
            columns: ["winner_archer_id"]
            isOneToOne: false
            referencedRelation: "public_archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      public_results: {
        Row: {
          archer_id: string | null
          division_id: string | null
          final_rank: number | null
          id: string | null
          medal: string | null
          needs_shoot_off: boolean | null
          qualification_rank: number | null
          qualification_tens: number | null
          qualification_total: number | null
          qualification_xs: number | null
          team_id: string | null
          tournament_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "results_archer_id_fkey"
            columns: ["archer_id"]
            isOneToOne: false
            referencedRelation: "archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_archer_id_fkey"
            columns: ["archer_id"]
            isOneToOne: false
            referencedRelation: "public_archers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "public_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      public_tournaments: {
        Row: {
          end_date: string | null
          id: string | null
          name: string | null
          start_date: string | null
          venue: string | null
        }
        Insert: {
          end_date?: string | null
          id?: string | null
          name?: string | null
          start_date?: string | null
          venue?: string | null
        }
        Update: {
          end_date?: string | null
          id?: string | null
          name?: string | null
          start_date?: string | null
          venue?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_membership: {
        Args: { p_membership: string }
        Returns: {
          role: string
          tournament_id: string
          tournament_name: string
        }[]
      }
      apply_match: {
        Args: { p_match: string; p_patches?: Json; p_state: Json }
        Returns: undefined
      }
      commit_import: { Args: { p_batch: string }; Returns: number }
      create_tournament: {
        Args: {
          p_end_date?: string
          p_name: string
          p_start_date: string
          p_venue?: string
        }
        Returns: string
      }
      current_role_in: {
        Args: { p_roles: string[]; p_tournament: string }
        Returns: boolean
      }
      division_phase: { Args: { p_division: string }; Returns: string }
      invite_member: {
        Args: {
          p_club?: string
          p_email: string
          p_role: string
          p_tournament: string
        }
        Returns: string
      }
      judge_owns_bale: {
        Args: { p_bale: number; p_tournament: string }
        Returns: boolean
      }
      record_closest_to_centre: {
        Args: { p_match: string; p_side: number }
        Returns: undefined
      }
      revoke_member: { Args: { p_membership: string }; Returns: undefined }
      transition_division: {
        Args: {
          p_actor: string
          p_division: string
          p_payload?: Json
          p_reason?: string
          p_to: string
        }
        Returns: undefined
      }
      write_results: {
        Args: { p_division: string; p_rows: Json }
        Returns: undefined
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
    Enums: {},
  },
} as const

