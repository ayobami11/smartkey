// Auto-generated placeholder — run `npm run db:types` after applying migrations

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: Database['public']['Enums']['user_role'];
          full_name: string;
          institutional_email: string;
          department_id: string | null;
          photo_url: string | null;
          signature_ref_url: string | null;
          stamp_ref_url: string | null;
          status: Database['public']['Enums']['profile_status'];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          role: Database['public']['Enums']['user_role'];
          full_name: string;
          institutional_email: string;
          department_id?: string | null;
          photo_url?: string | null;
          signature_ref_url?: string | null;
          stamp_ref_url?: string | null;
          status?: Database['public']['Enums']['profile_status'];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: Database['public']['Enums']['user_role'];
          full_name?: string;
          institutional_email?: string;
          department_id?: string | null;
          photo_url?: string | null;
          signature_ref_url?: string | null;
          stamp_ref_url?: string | null;
          status?: Database['public']['Enums']['profile_status'];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      departments: {
        Row: {
          id: string;
          name: string;
          hod_id: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          hod_id?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          hod_id?: string | null;
        };
        Relationships: [];
      };
      keys: {
        Row: {
          id: string;
          code: string;
          zone: Database['public']['Enums']['zone'];
          room_name: string;
          department_id: string;
          status: Database['public']['Enums']['key_status'];
          retired_at: string | null;
        };
        Insert: {
          id?: string;
          code: string;
          zone: Database['public']['Enums']['zone'];
          room_name: string;
          department_id: string;
          status?: Database['public']['Enums']['key_status'];
          retired_at?: string | null;
        };
        Update: {
          id?: string;
          code?: string;
          zone?: Database['public']['Enums']['zone'];
          room_name?: string;
          department_id?: string;
          status?: Database['public']['Enums']['key_status'];
          retired_at?: string | null;
        };
        Relationships: [];
      };
      authorisations: {
        Row: {
          key_id: string;
          profile_id: string;
          authorised_by: string;
          authorised_at: string;
        };
        Insert: {
          key_id: string;
          profile_id: string;
          authorised_by: string;
          authorised_at?: string;
        };
        Update: {
          key_id?: string;
          profile_id?: string;
          authorised_by?: string;
          authorised_at?: string;
        };
        Relationships: [];
      };
      requests: {
        Row: {
          id: string;
          requester_id: string;
          key_id: string;
          type: Database['public']['Enums']['request_type'];
          requested_for: string;
          status: Database['public']['Enums']['request_status'];
          code: string | null;
          code_expires_at: string | null;
          return_deadline: string;
          risk_tier: Database['public']['Enums']['risk_tier'];
          risk_factors: Json;
          hod_decision_id: string | null;
          issued_by: string | null;
          issued_at: string | null;
          returned_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          key_id: string;
          type: Database['public']['Enums']['request_type'];
          requested_for: string;
          status?: Database['public']['Enums']['request_status'];
          code?: string | null;
          code_expires_at?: string | null;
          return_deadline: string;
          risk_tier?: Database['public']['Enums']['risk_tier'];
          risk_factors?: Json;
          hod_decision_id?: string | null;
          issued_by?: string | null;
          issued_at?: string | null;
          returned_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          requester_id?: string;
          key_id?: string;
          type?: Database['public']['Enums']['request_type'];
          requested_for?: string;
          status?: Database['public']['Enums']['request_status'];
          code?: string | null;
          code_expires_at?: string | null;
          return_deadline?: string;
          risk_tier?: Database['public']['Enums']['risk_tier'];
          risk_factors?: Json;
          hod_decision_id?: string | null;
          issued_by?: string | null;
          issued_at?: string | null;
          returned_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      hod_decisions: {
        Row: {
          id: string;
          request_id: string;
          hod_id: string;
          decision: Database['public']['Enums']['hod_decision'];
          note: string | null;
          signature_verified: boolean;
          signature_mismatch_pct: number | null;
          decided_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          hod_id: string;
          decision: Database['public']['Enums']['hod_decision'];
          note?: string | null;
          signature_verified?: boolean;
          signature_mismatch_pct?: number | null;
          decided_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          hod_id?: string;
          decision?: Database['public']['Enums']['hod_decision'];
          note?: string | null;
          signature_verified?: boolean;
          signature_mismatch_pct?: number | null;
          decided_at?: string;
        };
        Relationships: [];
      };
      shifts: {
        Row: {
          id: string;
          shift_number: number;
          started_at: string;
          ended_at: string | null;
          primary_officer_id: string;
          secondary_officer_id: string | null;
        };
        Insert: {
          id?: string;
          shift_number: number;
          started_at?: string;
          ended_at?: string | null;
          primary_officer_id: string;
          secondary_officer_id?: string | null;
        };
        Update: {
          id?: string;
          shift_number?: number;
          started_at?: string;
          ended_at?: string | null;
          primary_officer_id?: string;
          secondary_officer_id?: string | null;
        };
        Relationships: [];
      };
      shift_handovers: {
        Row: {
          id: string;
          outgoing_shift_id: string;
          incoming_shift_id: string;
          incoming_officer_id: string;
          acknowledged_keys: Json;
          bulk_acknowledged: boolean;
          acknowledged_at: string;
        };
        Insert: {
          id?: string;
          outgoing_shift_id: string;
          incoming_shift_id: string;
          incoming_officer_id: string;
          acknowledged_keys?: Json;
          bulk_acknowledged?: boolean;
          acknowledged_at?: string;
        };
        Update: {
          id?: string;
          outgoing_shift_id?: string;
          incoming_shift_id?: string;
          incoming_officer_id?: string;
          acknowledged_keys?: Json;
          bulk_acknowledged?: boolean;
          acknowledged_at?: string;
        };
        Relationships: [];
      };
      shift_reports: {
        Row: {
          id: string;
          shift_id: string;
          markdown: string;
          timeline: Json;
          metadata: Json;
          generated_at: string;
        };
        Insert: {
          id?: string;
          shift_id: string;
          markdown: string;
          timeline?: Json;
          metadata?: Json;
          generated_at?: string;
        };
        Update: {
          id?: string;
          shift_id?: string;
          markdown?: string;
          timeline?: Json;
          metadata?: Json;
          generated_at?: string;
        };
        Relationships: [];
      };
      shift_report_comments: {
        Row: {
          id: string;
          report_id: string;
          author_id: string;
          text: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          report_id: string;
          author_id: string;
          text: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          report_id?: string;
          author_id?: string;
          text?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      incidents: {
        Row: {
          id: string;
          reference: string;
          shift_id: string | null;
          logged_by: string;
          type: Database['public']['Enums']['incident_type'];
          severity: Database['public']['Enums']['incident_severity'];
          description: string;
          related_key_id: string | null;
          related_person_id: string | null;
          photo_url: string | null;
          status: Database['public']['Enums']['incident_status'];
          occurred_at: string;
          logged_at: string;
        };
        Insert: {
          id?: string;
          reference?: string;
          shift_id?: string | null;
          logged_by: string;
          type: Database['public']['Enums']['incident_type'];
          severity: Database['public']['Enums']['incident_severity'];
          description: string;
          related_key_id?: string | null;
          related_person_id?: string | null;
          photo_url?: string | null;
          status?: Database['public']['Enums']['incident_status'];
          occurred_at: string;
          logged_at?: string;
        };
        Update: {
          id?: string;
          reference?: string;
          shift_id?: string | null;
          logged_by?: string;
          type?: Database['public']['Enums']['incident_type'];
          severity?: Database['public']['Enums']['incident_severity'];
          description?: string;
          related_key_id?: string | null;
          related_person_id?: string | null;
          photo_url?: string | null;
          status?: Database['public']['Enums']['incident_status'];
          occurred_at?: string;
          logged_at?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          event: string;
          actor_id: string;
          actor_role: Database['public']['Enums']['user_role'];
          target_type: string;
          target_id: string;
          payload: Json;
          occurred_at: string;
        };
        Insert: {
          id?: string;
          event: string;
          actor_id: string;
          actor_role: Database['public']['Enums']['user_role'];
          target_type: string;
          target_id: string;
          payload: Json;
          occurred_at?: string;
        };
        Update: {
          id?: string;
          event?: string;
          actor_id?: string;
          actor_role?: Database['public']['Enums']['user_role'];
          target_type?: string;
          target_id?: string;
          payload?: Json;
          occurred_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_request: {
        Args: {
          p_key_id: string;
          p_type: string;
          p_return_deadline: string;
          p_weekend_date?: string | null;
        };
        Returns: {
          request_id: string;
          code: string;
          code_expires_at: string;
          status: string;
        }[];
      };
      issue_key: {
        Args: { p_request_id: string; p_verifier_id: string };
        Returns: { request_id: string; issued_at: string }[];
      };
      return_key: {
        Args: {
          p_request_id: string;
          p_verifier_id: string;
          p_returner_id?: string | null;
        };
        Returns: { request_id: string; returned_at: string }[];
      };
      approve_weekend: {
        Args: {
          p_request_id: string;
          p_hod_id: string;
          p_note?: string | null;
          p_signature_verified?: boolean;
          p_signature_mismatch_pct?: number | null;
        };
        Returns: { request_id: string; code: string; decision_id: string }[];
      };
      decline_weekend: {
        Args: {
          p_request_id: string;
          p_hod_id: string;
          p_note?: string | null;
        };
        Returns: { request_id: string; decision_id: string }[];
      };
      acknowledge_shift_handover: {
        Args: {
          p_outgoing_shift_id: string;
          p_key_ids: string[];
          p_bulk: boolean;
        };
        Returns: { handover_id: string; acknowledged_count: number }[];
      };
      generate_shift_report: {
        Args: { p_shift_id: string };
        Returns: { report_id: string }[];
      };
      add_report_comment: {
        Args: { p_report_id: string; p_text: string };
        Returns: { comment_id: string; created_at: string }[];
      };
      provision_user: {
        Args: {
          p_full_name: string;
          p_email: string;
          p_role: string;
          p_department_id?: string | null;
        };
        Returns: { profile_id: string; activation_token: string }[];
      };
      mark_key_overdue: {
        Args: Record<string, never>;
        Returns: { updated_count: number }[];
      };
    };
    Enums: {
      user_role: 'CSO' | 'HOD' | 'VERIFIER' | 'REQUESTER';
      profile_status: 'PENDING_ACTIVATION' | 'ACTIVE' | 'DEACTIVATED';
      zone: 'NEW_SENATE' | 'OLD_SENATE';
      key_status: 'AVAILABLE' | 'ISSUED' | 'OVERDUE' | 'RETIRED';
      request_type: 'WEEKDAY' | 'WEEKEND';
      request_status:
        | 'PENDING_HOD'
        | 'CODE_ISSUED'
        | 'KEY_ISSUED'
        | 'KEY_RETURNED'
        | 'EXPIRED'
        | 'CANCELLED'
        | 'DECLINED';
      risk_tier: 'LOW' | 'MEDIUM' | 'HIGH';
      hod_decision: 'APPROVED' | 'DECLINED';
      incident_type:
        | 'MISSING_KEY'
        | 'SUSPICIOUS_ACTIVITY'
        | 'EQUIPMENT_FAULT'
        | 'PROCEDURAL'
        | 'OTHER';
      incident_severity: 'LOW' | 'MEDIUM' | 'HIGH';
      incident_status: 'OPEN' | 'RESOLVED' | 'ESCALATED';
    };
    CompositeTypes: Record<string, never>;
  };
};

// Convenience aliases
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];

export type UserRole = Enums<'user_role'>;
export type ProfileStatus = Enums<'profile_status'>;
export type Zone = Enums<'zone'>;
export type KeyStatus = Enums<'key_status'>;
export type RequestType = Enums<'request_type'>;
export type RequestStatus = Enums<'request_status'>;
export type RiskTier = Enums<'risk_tier'>;
export type HodDecision = Enums<'hod_decision'>;
export type IncidentType = Enums<'incident_type'>;
export type IncidentSeverity = Enums<'incident_severity'>;
export type IncidentStatus = Enums<'incident_status'>;
