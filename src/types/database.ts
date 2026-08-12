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
      audit_log: {
        Row: {
          actor_department: string | null
          actor_id: string | null
          actor_name: string | null
          actor_role: Database["public"]["Enums"]["user_role"] | null
          event: string
          id: string
          occurred_at: string
          payload: Json
          target_id: string
          target_type: string
        }
        Insert: {
          actor_department?: string | null
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          event: string
          id?: string
          occurred_at?: string
          payload?: Json
          target_id: string
          target_type: string
        }
        Update: {
          actor_department?: string | null
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          event?: string
          id?: string
          occurred_at?: string
          payload?: Json
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      authorisations: {
        Row: {
          authorised_at: string
          authorised_by: string
          key_id: string
          profile_id: string
        }
        Insert: {
          authorised_at?: string
          authorised_by: string
          key_id: string
          profile_id: string
        }
        Update: {
          authorised_at?: string
          authorised_by?: string
          key_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "authorisations_authorised_by_fkey"
            columns: ["authorised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorisations_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorisations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_requesters: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          id_document_number: string
          id_document_type: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          id_document_number: string
          id_document_type: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          id_document_number?: string
          id_document_type?: string
          phone?: string | null
        }
        Relationships: []
      }
      hod_decisions: {
        Row: {
          decided_at: string
          decision: Database["public"]["Enums"]["hod_decision"]
          hod_id: string
          id: string
          note: string | null
          request_id: string
          signature_mismatch_pct: number | null
          signature_verified: boolean
        }
        Insert: {
          decided_at?: string
          decision: Database["public"]["Enums"]["hod_decision"]
          hod_id: string
          id?: string
          note?: string | null
          request_id: string
          signature_mismatch_pct?: number | null
          signature_verified?: boolean
        }
        Update: {
          decided_at?: string
          decision?: Database["public"]["Enums"]["hod_decision"]
          hod_id?: string
          id?: string
          note?: string | null
          request_id?: string
          signature_mismatch_pct?: number | null
          signature_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "hod_decisions_hod_id_fkey"
            columns: ["hod_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hod_decisions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          description: string
          id: string
          logged_at: string
          logged_by: string
          occurred_at: string
          photo_url: string | null
          reference: string
          related_key_id: string | null
          related_person_id: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          shift_id: string | null
          status: Database["public"]["Enums"]["incident_status"]
          type: Database["public"]["Enums"]["incident_type"]
        }
        Insert: {
          description: string
          id?: string
          logged_at?: string
          logged_by: string
          occurred_at: string
          photo_url?: string | null
          reference?: string
          related_key_id?: string | null
          related_person_id?: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          shift_id?: string | null
          status?: Database["public"]["Enums"]["incident_status"]
          type: Database["public"]["Enums"]["incident_type"]
        }
        Update: {
          description?: string
          id?: string
          logged_at?: string
          logged_by?: string
          occurred_at?: string
          photo_url?: string | null
          reference?: string
          related_key_id?: string | null
          related_person_id?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          shift_id?: string | null
          status?: Database["public"]["Enums"]["incident_status"]
          type?: Database["public"]["Enums"]["incident_type"]
        }
        Relationships: [
          {
            foreignKeyName: "incidents_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_related_key_id_fkey"
            columns: ["related_key_id"]
            isOneToOne: false
            referencedRelation: "keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_related_person_id_fkey"
            columns: ["related_person_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      keys: {
        Row: {
          code: string
          id: string
          key_count: number
          retired_at: string | null
          room_name: string
          status: Database["public"]["Enums"]["key_status"]
          unit_id: string
          zone: Database["public"]["Enums"]["zone"]
        }
        Insert: {
          code: string
          id?: string
          key_count?: number
          retired_at?: string | null
          room_name: string
          status?: Database["public"]["Enums"]["key_status"]
          unit_id: string
          zone: Database["public"]["Enums"]["zone"]
        }
        Update: {
          code?: string
          id?: string
          key_count?: number
          retired_at?: string | null
          room_name?: string
          status?: Database["public"]["Enums"]["key_status"]
          unit_id?: string
          zone?: Database["public"]["Enums"]["zone"]
        }
        Relationships: [
          {
            foreignKeyName: "keys_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_config: {
        Row: {
          code_expiry_minutes: number
          id: string
          return_deadline_time: string
          updated_at: string
        }
        Insert: {
          code_expiry_minutes?: number
          id?: string
          return_deadline_time?: string
          updated_at?: string
        }
        Update: {
          code_expiry_minutes?: number
          id?: string
          return_deadline_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activation_token: string | null
          created_at: string
          full_name: string
          id: string
          institutional_email: string
          photo_url: string | null
          role: Database["public"]["Enums"]["user_role"]
          signature_ref_url: string | null
          stamp_ref_url: string | null
          status: Database["public"]["Enums"]["user_status"]
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          activation_token?: string | null
          created_at?: string
          full_name: string
          id: string
          institutional_email: string
          photo_url?: string | null
          role: Database["public"]["Enums"]["user_role"]
          signature_ref_url?: string | null
          stamp_ref_url?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          activation_token?: string | null
          created_at?: string
          full_name?: string
          id?: string
          institutional_email?: string
          photo_url?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          signature_ref_url?: string | null
          stamp_ref_url?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          access_token: string | null
          code: string | null
          code_expires_at: string | null
          created_at: string
          guest_id: string | null
          hod_decision_id: string | null
          id: string
          issued_at: string | null
          issued_by: string | null
          key_id: string | null
          letter_url: string | null
          reminder_sent_at: string | null
          requested_for: string
          requested_room: string | null
          requested_unit_id: string | null
          requester_id: string | null
          return_code: string | null
          return_code_expires_at: string | null
          return_deadline: string | null
          returned_at: string | null
          risk_factors: Json | null
          risk_tier: Database["public"]["Enums"]["risk_tier"] | null
          status: Database["public"]["Enums"]["request_status"]
          type: Database["public"]["Enums"]["request_type"]
        }
        Insert: {
          access_token?: string | null
          code?: string | null
          code_expires_at?: string | null
          created_at?: string
          guest_id?: string | null
          hod_decision_id?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          key_id?: string | null
          letter_url?: string | null
          reminder_sent_at?: string | null
          requested_for: string
          requested_room?: string | null
          requested_unit_id?: string | null
          requester_id?: string | null
          return_code?: string | null
          return_code_expires_at?: string | null
          return_deadline?: string | null
          returned_at?: string | null
          risk_factors?: Json | null
          risk_tier?: Database["public"]["Enums"]["risk_tier"] | null
          status?: Database["public"]["Enums"]["request_status"]
          type: Database["public"]["Enums"]["request_type"]
        }
        Update: {
          access_token?: string | null
          code?: string | null
          code_expires_at?: string | null
          created_at?: string
          guest_id?: string | null
          hod_decision_id?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          key_id?: string | null
          letter_url?: string | null
          reminder_sent_at?: string | null
          requested_for?: string
          requested_room?: string | null
          requested_unit_id?: string | null
          requester_id?: string | null
          return_code?: string | null
          return_code_expires_at?: string | null
          return_deadline?: string | null
          returned_at?: string | null
          risk_factors?: Json | null
          risk_tier?: Database["public"]["Enums"]["risk_tier"] | null
          status?: Database["public"]["Enums"]["request_status"]
          type?: Database["public"]["Enums"]["request_type"]
        }
        Relationships: [
          {
            foreignKeyName: "requests_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_requesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_hod_decision_id_fkey"
            columns: ["hod_decision_id"]
            isOneToOne: false
            referencedRelation: "hod_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_requested_unit_id_fkey"
            columns: ["requested_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_rule_config: {
        Row: {
          enabled: boolean
          rule_key: Database["public"]["Enums"]["risk_rule_key"]
          updated_at: string
          weight: number
        }
        Insert: {
          enabled?: boolean
          rule_key: Database["public"]["Enums"]["risk_rule_key"]
          updated_at?: string
          weight: number
        }
        Update: {
          enabled?: boolean
          rule_key?: Database["public"]["Enums"]["risk_rule_key"]
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      risk_tier_config: {
        Row: {
          high_min: number
          id: string
          medium_min: number
          updated_at: string
        }
        Insert: {
          high_min: number
          id?: string
          medium_min: number
          updated_at?: string
        }
        Update: {
          high_min?: number
          id?: string
          medium_min?: number
          updated_at?: string
        }
        Relationships: []
      }
      shift_handovers: {
        Row: {
          acknowledged_at: string
          acknowledged_keys: Json
          bulk_acknowledged: boolean
          id: string
          incoming_officer_id: string
          incoming_shift_id: string
          outgoing_shift_id: string
        }
        Insert: {
          acknowledged_at?: string
          acknowledged_keys?: Json
          bulk_acknowledged?: boolean
          id?: string
          incoming_officer_id: string
          incoming_shift_id: string
          outgoing_shift_id: string
        }
        Update: {
          acknowledged_at?: string
          acknowledged_keys?: Json
          bulk_acknowledged?: boolean
          id?: string
          incoming_officer_id?: string
          incoming_shift_id?: string
          outgoing_shift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_handovers_incoming_officer_id_fkey"
            columns: ["incoming_officer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handovers_incoming_shift_id_fkey"
            columns: ["incoming_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handovers_outgoing_shift_id_fkey"
            columns: ["outgoing_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_report_comments: {
        Row: {
          author_id: string
          created_at: string
          id: string
          report_id: string
          text: string
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          report_id: string
          text: string
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          report_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_report_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_report_comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "shift_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_reports: {
        Row: {
          generated_at: string
          id: string
          markdown: string
          metadata: Json
          shift_id: string
          timeline: Json
        }
        Insert: {
          generated_at?: string
          id?: string
          markdown: string
          metadata?: Json
          shift_id: string
          timeline?: Json
        }
        Update: {
          generated_at?: string
          id?: string
          markdown?: string
          metadata?: Json
          shift_id?: string
          timeline?: Json
        }
        Relationships: [
          {
            foreignKeyName: "shift_reports_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: true
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          ended_at: string | null
          id: string
          primary_officer_id: string
          secondary_officer_id: string | null
          shift_number: number
          started_at: string
        }
        Insert: {
          ended_at?: string | null
          id?: string
          primary_officer_id: string
          secondary_officer_id?: string | null
          shift_number: number
          started_at: string
        }
        Update: {
          ended_at?: string | null
          id?: string
          primary_officer_id?: string
          secondary_officer_id?: string | null
          shift_number?: number
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_primary_officer_id_fkey"
            columns: ["primary_officer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_secondary_officer_id_fkey"
            columns: ["secondary_officer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          authoriser: Database["public"]["Enums"]["department_authoriser"]
          faculty: string
          hod_id: string | null
          id: string
          name: string
        }
        Insert: {
          authoriser?: Database["public"]["Enums"]["department_authoriser"]
          faculty?: string
          hod_id?: string | null
          id?: string
          name: string
        }
        Update: {
          authoriser?: Database["public"]["Enums"]["department_authoriser"]
          faculty?: string
          hod_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_hod_id_fkey"
            columns: ["hod_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      zone_hours: {
        Row: {
          updated_at: string
          weekday_close: string
          weekday_open: string
          weekend_close: string | null
          weekend_closed: boolean
          weekend_open: string | null
          zone: Database["public"]["Enums"]["zone"]
        }
        Insert: {
          updated_at?: string
          weekday_close?: string
          weekday_open?: string
          weekend_close?: string | null
          weekend_closed?: boolean
          weekend_open?: string | null
          zone: Database["public"]["Enums"]["zone"]
        }
        Update: {
          updated_at?: string
          weekday_close?: string
          weekday_open?: string
          weekend_close?: string | null
          weekend_closed?: boolean
          weekend_open?: string | null
          zone?: Database["public"]["Enums"]["zone"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _write_audit: {
        Args: {
          p_actor_id: string
          p_actor_role: Database["public"]["Enums"]["user_role"]
          p_event: string
          p_payload?: Json
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      _write_audit_guest: {
        Args: {
          p_actor_name: string
          p_event: string
          p_payload?: Json
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      acknowledge_shift_handover: {
        Args: {
          p_bulk: boolean
          p_key_ids: string[]
          p_outgoing_shift_id: string
        }
        Returns: {
          acknowledged_count: number
          handover_id: string
        }[]
      }
      add_report_comment: {
        Args: { p_report_id: string; p_text: string }
        Returns: {
          comment_id: string
          created_at: string
        }[]
      }
      approve_guest_weekend: {
        Args: {
          p_hod_id: string
          p_key_id: string
          p_note?: string
          p_request_id: string
        }
        Returns: {
          decision_id: string
          request_id: string
        }[]
      }
      approve_weekend: {
        Args: {
          p_cso_override?: boolean
          p_hod_id: string
          p_note?: string
          p_request_id: string
          p_signature_mismatch_pct?: number
          p_signature_verified?: boolean
        }
        Returns: {
          code: string
          decision_id: string
          request_id: string
        }[]
      }
      create_guest_weekend_request: {
        Args: {
          p_department_id: string
          p_email: string
          p_full_name: string
          p_id_number: string
          p_id_type: string
          p_letter_url: string
          p_phone: string
          p_requested_room: string
          p_return_deadline: string
          p_weekend_date: string
        }
        Returns: {
          access_token: string
          request_id: string
        }[]
      }
      create_request: {
        Args: {
          p_key_id: string
          p_return_deadline: string
          p_type: string
          p_weekend_date?: string
        }
        Returns: {
          code: string
          code_expires_at: string
          request_id: string
          status: string
        }[]
      }
      decline_weekend: {
        Args: {
          p_cso_override?: boolean
          p_hod_id: string
          p_note?: string
          p_request_id: string
        }
        Returns: {
          decision_id: string
          request_id: string
        }[]
      }
      dismiss_expired_request: {
        Args: { p_actor_id: string; p_request_id: string }
        Returns: {
          request_id: string
          status: string
        }[]
      }
      expire_guest_request: {
        Args: { p_access_token: string }
        Returns: {
          request_id: string
          status: string
        }[]
      }
      expire_lapsed_codes: {
        Args: never
        Returns: {
          expired_count: number
        }[]
      }
      expire_request: {
        Args: { p_request_id: string; p_requester_id: string }
        Returns: {
          request_id: string
          status: string
        }[]
      }
      expire_stale_weekend_requests: {
        Args: never
        Returns: {
          expired_count: number
        }[]
      }
      generate_guest_weekend_code: {
        Args: { p_access_token: string }
        Returns: {
          code: string
          code_expires_at: string
          request_id: string
        }[]
      }
      generate_shift_report: {
        Args: { p_shift_id: string }
        Returns: {
          report_id: string
        }[]
      }
      generate_weekend_code: {
        Args: { p_request_id: string; p_requester_id: string }
        Returns: {
          code: string
          code_expires_at: string
          request_id: string
        }[]
      }
      issue_key: {
        Args: { p_request_id: string; p_verifier_id: string }
        Returns: {
          issued_at: string
          request_id: string
        }[]
      }
      mark_key_overdue: {
        Args: never
        Returns: {
          updated_count: number
        }[]
      }
      nominate_collector: {
        Args: { p_key_id: string; p_requester_id: string }
        Returns: {
          slot_number: number
        }[]
      }
      provision_user: {
        Args: {
          p_department_id?: string
          p_email: string
          p_full_name: string
          p_role: string
        }
        Returns: {
          activation_token: string
          profile_id: string
        }[]
      }
      remove_collector: {
        Args: { p_key_id: string; p_requester_id: string }
        Returns: undefined
      }
      request_return: {
        Args: { p_request_id: string; p_requester_id: string }
        Returns: {
          request_id: string
          return_code: string
          return_code_expires_at: string
        }[]
      }
      request_return_guest: {
        Args: { p_access_token: string }
        Returns: {
          request_id: string
          return_code: string
          return_code_expires_at: string
        }[]
      }
      return_key: {
        Args: {
          p_code?: string
          p_override_reason?: string
          p_request_id: string
          p_returner_id?: string
          p_verifier_id: string
        }
        Returns: {
          request_id: string
          returned_at: string
          verified: boolean
        }[]
      }
      schedule_pending_shift_report: {
        Args: never
        Returns: {
          report_id: string
          shift_id: string
        }[]
      }
      update_operational_config: {
        Args: {
          p_code_expiry_minutes: number
          p_return_deadline_time: string
          p_zone_hours: Json
        }
        Returns: undefined
      }
      update_risk_config: {
        Args: { p_high_min: number; p_medium_min: number; p_rules: Json }
        Returns: undefined
      }
      user_department_id: { Args: never; Returns: string }
      user_role: { Args: never; Returns: string }
      user_unit_id: { Args: never; Returns: string }
    }
    Enums: {
      department_authoriser: "DEAN" | "CSO"
      hod_decision: "APPROVED" | "DECLINED"
      incident_severity: "LOW" | "MEDIUM" | "HIGH"
      incident_status: "OPEN" | "RESOLVED" | "ESCALATED"
      incident_type:
        | "MISSING_KEY"
        | "SUSPICIOUS_ACTIVITY"
        | "EQUIPMENT_FAULT"
        | "PROCEDURAL"
        | "OTHER"
      key_status: "AVAILABLE" | "ISSUED" | "OVERDUE" | "RETIRED"
      request_status:
        | "PENDING_HOD"
        | "CODE_ISSUED"
        | "KEY_ISSUED"
        | "KEY_RETURNED"
        | "EXPIRED"
        | "CANCELLED"
        | "DECLINED"
        | "APPROVED"
      request_type: "WEEKDAY" | "WEEKEND"
      risk_rule_key:
        | "outside_operational_hours"
        | "outstanding_key_not_returned"
        | "weekend_without_memo"
        | "excess_request_frequency"
        | "collector_not_whitelisted"
      risk_tier: "LOW" | "MEDIUM" | "HIGH"
      user_role: "CSO" | "DEAN" | "VERIFIER" | "REQUESTER"
      user_status: "PENDING_ACTIVATION" | "ACTIVE" | "DEACTIVATED"
      zone: "NEW_SENATE" | "OLD_SENATE"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
      department_authoriser: ["DEAN", "CSO"],
      hod_decision: ["APPROVED", "DECLINED"],
      incident_severity: ["LOW", "MEDIUM", "HIGH"],
      incident_status: ["OPEN", "RESOLVED", "ESCALATED"],
      incident_type: [
        "MISSING_KEY",
        "SUSPICIOUS_ACTIVITY",
        "EQUIPMENT_FAULT",
        "PROCEDURAL",
        "OTHER",
      ],
      key_status: ["AVAILABLE", "ISSUED", "OVERDUE", "RETIRED"],
      request_status: [
        "PENDING_HOD",
        "CODE_ISSUED",
        "KEY_ISSUED",
        "KEY_RETURNED",
        "EXPIRED",
        "CANCELLED",
        "DECLINED",
        "APPROVED",
      ],
      request_type: ["WEEKDAY", "WEEKEND"],
      risk_rule_key: [
        "outside_operational_hours",
        "outstanding_key_not_returned",
        "weekend_without_memo",
        "excess_request_frequency",
        "collector_not_whitelisted",
      ],
      risk_tier: ["LOW", "MEDIUM", "HIGH"],
      user_role: ["CSO", "DEAN", "VERIFIER", "REQUESTER"],
      user_status: ["PENDING_ACTIVATION", "ACTIVE", "DEACTIVATED"],
      zone: ["NEW_SENATE", "OLD_SENATE"],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const

