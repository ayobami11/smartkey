export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          actor_id: string;
          actor_role: Database['public']['Enums']['user_role'];
          event: string;
          id: string;
          occurred_at: string;
          payload: Json;
          target_id: string;
          target_type: string;
        };
        Insert: {
          actor_id: string;
          actor_role: Database['public']['Enums']['user_role'];
          event: string;
          id?: string;
          occurred_at?: string;
          payload?: Json;
          target_id: string;
          target_type: string;
        };
        Update: {
          actor_id?: string;
          actor_role?: Database['public']['Enums']['user_role'];
          event?: string;
          id?: string;
          occurred_at?: string;
          payload?: Json;
          target_id?: string;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_log_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      authorisations: {
        Row: {
          authorised_at: string;
          authorised_by: string;
          key_id: string;
          profile_id: string;
        };
        Insert: {
          authorised_at?: string;
          authorised_by: string;
          key_id: string;
          profile_id: string;
        };
        Update: {
          authorised_at?: string;
          authorised_by?: string;
          key_id?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'authorisations_authorised_by_fkey';
            columns: ['authorised_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'authorisations_key_id_fkey';
            columns: ['key_id'];
            isOneToOne: false;
            referencedRelation: 'keys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'authorisations_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      departments: {
        Row: {
          faculty: string;
          hod_id: string | null;
          id: string;
          name: string;
        };
        Insert: {
          faculty?: string;
          hod_id?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          faculty?: string;
          hod_id?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'departments_hod_id_fkey';
            columns: ['hod_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      hod_decisions: {
        Row: {
          decided_at: string;
          decision: Database['public']['Enums']['hod_decision'];
          hod_id: string;
          id: string;
          note: string | null;
          request_id: string;
          signature_mismatch_pct: number | null;
          signature_verified: boolean;
        };
        Insert: {
          decided_at?: string;
          decision: Database['public']['Enums']['hod_decision'];
          hod_id: string;
          id?: string;
          note?: string | null;
          request_id: string;
          signature_mismatch_pct?: number | null;
          signature_verified?: boolean;
        };
        Update: {
          decided_at?: string;
          decision?: Database['public']['Enums']['hod_decision'];
          hod_id?: string;
          id?: string;
          note?: string | null;
          request_id?: string;
          signature_mismatch_pct?: number | null;
          signature_verified?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'hod_decisions_hod_id_fkey';
            columns: ['hod_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'hod_decisions_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'requests';
            referencedColumns: ['id'];
          },
        ];
      };
      incidents: {
        Row: {
          description: string;
          id: string;
          logged_at: string;
          logged_by: string;
          occurred_at: string;
          photo_url: string | null;
          reference: string;
          related_key_id: string | null;
          related_person_id: string | null;
          severity: Database['public']['Enums']['incident_severity'];
          shift_id: string | null;
          status: Database['public']['Enums']['incident_status'];
          type: Database['public']['Enums']['incident_type'];
        };
        Insert: {
          description: string;
          id?: string;
          logged_at?: string;
          logged_by: string;
          occurred_at: string;
          photo_url?: string | null;
          reference?: string;
          related_key_id?: string | null;
          related_person_id?: string | null;
          severity: Database['public']['Enums']['incident_severity'];
          shift_id?: string | null;
          status?: Database['public']['Enums']['incident_status'];
          type: Database['public']['Enums']['incident_type'];
        };
        Update: {
          description?: string;
          id?: string;
          logged_at?: string;
          logged_by?: string;
          occurred_at?: string;
          photo_url?: string | null;
          reference?: string;
          related_key_id?: string | null;
          related_person_id?: string | null;
          severity?: Database['public']['Enums']['incident_severity'];
          shift_id?: string | null;
          status?: Database['public']['Enums']['incident_status'];
          type?: Database['public']['Enums']['incident_type'];
        };
        Relationships: [
          {
            foreignKeyName: 'incidents_logged_by_fkey';
            columns: ['logged_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'incidents_related_key_id_fkey';
            columns: ['related_key_id'];
            isOneToOne: false;
            referencedRelation: 'keys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'incidents_related_person_id_fkey';
            columns: ['related_person_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'incidents_shift_id_fkey';
            columns: ['shift_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id'];
          },
        ];
      };
      keys: {
        Row: {
          code: string;
          department_id: string;
          id: string;
          retired_at: string | null;
          room_name: string;
          status: Database['public']['Enums']['key_status'];
          zone: Database['public']['Enums']['zone'];
        };
        Insert: {
          code: string;
          department_id: string;
          id?: string;
          retired_at?: string | null;
          room_name: string;
          status?: Database['public']['Enums']['key_status'];
          zone: Database['public']['Enums']['zone'];
        };
        Update: {
          code?: string;
          department_id?: string;
          id?: string;
          retired_at?: string | null;
          room_name?: string;
          status?: Database['public']['Enums']['key_status'];
          zone?: Database['public']['Enums']['zone'];
        };
        Relationships: [
          {
            foreignKeyName: 'keys_department_id_fkey';
            columns: ['department_id'];
            isOneToOne: false;
            referencedRelation: 'departments';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          activation_token: string | null;
          created_at: string;
          department_id: string | null;
          full_name: string;
          id: string;
          institutional_email: string;
          photo_url: string | null;
          role: Database['public']['Enums']['user_role'];
          signature_ref_url: string | null;
          stamp_ref_url: string | null;
          status: Database['public']['Enums']['user_status'];
          updated_at: string;
        };
        Insert: {
          activation_token?: string | null;
          created_at?: string;
          department_id?: string | null;
          full_name: string;
          id: string;
          institutional_email: string;
          photo_url?: string | null;
          role: Database['public']['Enums']['user_role'];
          signature_ref_url?: string | null;
          stamp_ref_url?: string | null;
          status?: Database['public']['Enums']['user_status'];
          updated_at?: string;
        };
        Update: {
          activation_token?: string | null;
          created_at?: string;
          department_id?: string | null;
          full_name?: string;
          id?: string;
          institutional_email?: string;
          photo_url?: string | null;
          role?: Database['public']['Enums']['user_role'];
          signature_ref_url?: string | null;
          stamp_ref_url?: string | null;
          status?: Database['public']['Enums']['user_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_department_id_fkey';
            columns: ['department_id'];
            isOneToOne: false;
            referencedRelation: 'departments';
            referencedColumns: ['id'];
          },
        ];
      };
      requests: {
        Row: {
          code: string | null;
          code_expires_at: string | null;
          created_at: string;
          hod_decision_id: string | null;
          id: string;
          issued_at: string | null;
          issued_by: string | null;
          key_id: string;
          requested_for: string;
          requester_id: string;
          return_deadline: string | null;
          returned_at: string | null;
          risk_factors: Json | null;
          risk_tier: Database['public']['Enums']['risk_tier'] | null;
          status: Database['public']['Enums']['request_status'];
          type: Database['public']['Enums']['request_type'];
        };
        Insert: {
          code?: string | null;
          code_expires_at?: string | null;
          created_at?: string;
          hod_decision_id?: string | null;
          id?: string;
          issued_at?: string | null;
          issued_by?: string | null;
          key_id: string;
          requested_for: string;
          requester_id: string;
          return_deadline?: string | null;
          returned_at?: string | null;
          risk_factors?: Json | null;
          risk_tier?: Database['public']['Enums']['risk_tier'] | null;
          status?: Database['public']['Enums']['request_status'];
          type: Database['public']['Enums']['request_type'];
        };
        Update: {
          code?: string | null;
          code_expires_at?: string | null;
          created_at?: string;
          hod_decision_id?: string | null;
          id?: string;
          issued_at?: string | null;
          issued_by?: string | null;
          key_id?: string;
          requested_for?: string;
          requester_id?: string;
          return_deadline?: string | null;
          returned_at?: string | null;
          risk_factors?: Json | null;
          risk_tier?: Database['public']['Enums']['risk_tier'] | null;
          status?: Database['public']['Enums']['request_status'];
          type?: Database['public']['Enums']['request_type'];
        };
        Relationships: [
          {
            foreignKeyName: 'requests_hod_decision_id_fkey';
            columns: ['hod_decision_id'];
            isOneToOne: false;
            referencedRelation: 'hod_decisions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'requests_issued_by_fkey';
            columns: ['issued_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'requests_key_id_fkey';
            columns: ['key_id'];
            isOneToOne: false;
            referencedRelation: 'keys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'requests_requester_id_fkey';
            columns: ['requester_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      shift_handovers: {
        Row: {
          acknowledged_at: string;
          acknowledged_keys: Json;
          bulk_acknowledged: boolean;
          id: string;
          incoming_officer_id: string;
          incoming_shift_id: string;
          outgoing_shift_id: string;
        };
        Insert: {
          acknowledged_at?: string;
          acknowledged_keys?: Json;
          bulk_acknowledged?: boolean;
          id?: string;
          incoming_officer_id: string;
          incoming_shift_id: string;
          outgoing_shift_id: string;
        };
        Update: {
          acknowledged_at?: string;
          acknowledged_keys?: Json;
          bulk_acknowledged?: boolean;
          id?: string;
          incoming_officer_id?: string;
          incoming_shift_id?: string;
          outgoing_shift_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shift_handovers_incoming_officer_id_fkey';
            columns: ['incoming_officer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shift_handovers_incoming_shift_id_fkey';
            columns: ['incoming_shift_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shift_handovers_outgoing_shift_id_fkey';
            columns: ['outgoing_shift_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id'];
          },
        ];
      };
      shift_report_comments: {
        Row: {
          author_id: string;
          created_at: string;
          id: string;
          report_id: string;
          text: string;
        };
        Insert: {
          author_id: string;
          created_at?: string;
          id?: string;
          report_id: string;
          text: string;
        };
        Update: {
          author_id?: string;
          created_at?: string;
          id?: string;
          report_id?: string;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shift_report_comments_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shift_report_comments_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: false;
            referencedRelation: 'shift_reports';
            referencedColumns: ['id'];
          },
        ];
      };
      shift_reports: {
        Row: {
          generated_at: string;
          id: string;
          markdown: string;
          metadata: Json;
          shift_id: string;
          timeline: Json;
        };
        Insert: {
          generated_at?: string;
          id?: string;
          markdown: string;
          metadata?: Json;
          shift_id: string;
          timeline?: Json;
        };
        Update: {
          generated_at?: string;
          id?: string;
          markdown?: string;
          metadata?: Json;
          shift_id?: string;
          timeline?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'shift_reports_shift_id_fkey';
            columns: ['shift_id'];
            isOneToOne: true;
            referencedRelation: 'shifts';
            referencedColumns: ['id'];
          },
        ];
      };
      shifts: {
        Row: {
          ended_at: string | null;
          id: string;
          primary_officer_id: string;
          secondary_officer_id: string | null;
          shift_number: number;
          started_at: string;
        };
        Insert: {
          ended_at?: string | null;
          id?: string;
          primary_officer_id: string;
          secondary_officer_id?: string | null;
          shift_number: number;
          started_at: string;
        };
        Update: {
          ended_at?: string | null;
          id?: string;
          primary_officer_id?: string;
          secondary_officer_id?: string | null;
          shift_number?: number;
          started_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shifts_primary_officer_id_fkey';
            columns: ['primary_officer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shifts_secondary_officer_id_fkey';
            columns: ['secondary_officer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      _write_audit: {
        Args: {
          p_actor_id: string;
          p_actor_role: Database['public']['Enums']['user_role'];
          p_event: string;
          p_payload?: Json;
          p_target_id: string;
          p_target_type: string;
        };
        Returns: undefined;
      };
      acknowledge_shift_handover: {
        Args: {
          p_bulk: boolean;
          p_key_ids: string[];
          p_outgoing_shift_id: string;
        };
        Returns: {
          acknowledged_count: number;
          handover_id: string;
        }[];
      };
      add_report_comment: {
        Args: { p_report_id: string; p_text: string };
        Returns: {
          comment_id: string;
          created_at: string;
        }[];
      };
      approve_weekend: {
        Args: {
          p_hod_id: string;
          p_note?: string;
          p_request_id: string;
          p_signature_mismatch_pct?: number;
          p_signature_verified?: boolean;
        };
        Returns: {
          code: string;
          decision_id: string;
          request_id: string;
        }[];
      };
      create_request: {
        Args: {
          p_key_id: string;
          p_return_deadline: string;
          p_type: string;
          p_weekend_date?: string;
        };
        Returns: {
          code: string;
          code_expires_at: string;
          request_id: string;
          status: string;
        }[];
      };
      decline_weekend: {
        Args: { p_hod_id: string; p_note?: string; p_request_id: string };
        Returns: {
          decision_id: string;
          request_id: string;
        }[];
      };
      generate_shift_report: {
        Args: { p_shift_id: string };
        Returns: {
          report_id: string;
        }[];
      };
      issue_key: {
        Args: { p_request_id: string; p_verifier_id: string };
        Returns: {
          issued_at: string;
          request_id: string;
        }[];
      };
      mark_key_overdue: {
        Args: never;
        Returns: {
          updated_count: number;
        }[];
      };
      nominate_collector: {
        Args: { p_key_id: string; p_requester_id: string };
        Returns: {
          slot_number: number;
        }[];
      };
      provision_user: {
        Args: {
          p_department_id?: string;
          p_email: string;
          p_full_name: string;
          p_role: string;
        };
        Returns: {
          activation_token: string;
          profile_id: string;
        }[];
      };
      remove_collector: {
        Args: { p_key_id: string; p_requester_id: string };
        Returns: undefined;
      };
      return_key: {
        Args: {
          p_request_id: string;
          p_returner_id?: string;
          p_verifier_id: string;
        };
        Returns: {
          request_id: string;
          returned_at: string;
        }[];
      };
      user_department_id: { Args: never; Returns: string };
      user_role: { Args: never; Returns: string };
    };
    Enums: {
      hod_decision: 'APPROVED' | 'DECLINED';
      incident_severity: 'LOW' | 'MEDIUM' | 'HIGH';
      incident_status: 'OPEN' | 'RESOLVED' | 'ESCALATED';
      incident_type:
        | 'MISSING_KEY'
        | 'SUSPICIOUS_ACTIVITY'
        | 'EQUIPMENT_FAULT'
        | 'PROCEDURAL'
        | 'OTHER';
      key_status: 'AVAILABLE' | 'ISSUED' | 'OVERDUE' | 'RETIRED';
      request_status:
        | 'PENDING_HOD'
        | 'CODE_ISSUED'
        | 'KEY_ISSUED'
        | 'KEY_RETURNED'
        | 'EXPIRED'
        | 'CANCELLED'
        | 'DECLINED';
      request_type: 'WEEKDAY' | 'WEEKEND';
      risk_tier: 'LOW' | 'MEDIUM' | 'HIGH';
      user_role: 'CSO' | 'HOD' | 'VERIFIER' | 'REQUESTER';
      user_status: 'PENDING_ACTIVATION' | 'ACTIVE' | 'DEACTIVATED';
      zone: 'NEW_SENATE' | 'OLD_SENATE';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

// Convenience type aliases derived from the Database type.
// Import these instead of the raw enum strings where a named type is needed.
export type UserRole = Database['public']['Enums']['user_role'];
export type ProfileStatus = Database['public']['Enums']['user_status'];
export type IncidentType = Database['public']['Enums']['incident_type'];
export type IncidentSeverity = Database['public']['Enums']['incident_severity'];
export type IncidentStatus = Database['public']['Enums']['incident_status'];
export type KeyStatus = Database['public']['Enums']['key_status'];
export type RequestStatus = Database['public']['Enums']['request_status'];
export type RiskTier = Database['public']['Enums']['risk_tier'];
export type Zone = Database['public']['Enums']['zone'];

export const Constants = {
  public: {
    Enums: {
      hod_decision: ['APPROVED', 'DECLINED'],
      incident_severity: ['LOW', 'MEDIUM', 'HIGH'],
      incident_status: ['OPEN', 'RESOLVED', 'ESCALATED'],
      incident_type: [
        'MISSING_KEY',
        'SUSPICIOUS_ACTIVITY',
        'EQUIPMENT_FAULT',
        'PROCEDURAL',
        'OTHER',
      ],
      key_status: ['AVAILABLE', 'ISSUED', 'OVERDUE', 'RETIRED'],
      request_status: [
        'PENDING_HOD',
        'CODE_ISSUED',
        'KEY_ISSUED',
        'KEY_RETURNED',
        'EXPIRED',
        'CANCELLED',
        'DECLINED',
      ],
      request_type: ['WEEKDAY', 'WEEKEND'],
      risk_tier: ['LOW', 'MEDIUM', 'HIGH'],
      user_role: ['CSO', 'HOD', 'VERIFIER', 'REQUESTER'],
      user_status: ['PENDING_ACTIVATION', 'ACTIVE', 'DEACTIVATED'],
      zone: ['NEW_SENATE', 'OLD_SENATE'],
    },
  },
} as const;
