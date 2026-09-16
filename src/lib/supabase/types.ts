/**
 * Database types, written in the same shape `supabase gen types` produces.
 *
 * Kept in sync with supabase/migrations/*.sql. The canonical shape matters:
 * supabase-js resolves row/insert/update types (and embedded joins) from it,
 * and a near-miss silently degrades every query result to `never`.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type PrintPriorityDb = 'urgent' | 'standard' | 'fun';
export type ReservationStatusDb =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'preempted';
export type MemberRoleDb = 'member' | 'admin';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          role: MemberRoleDb;
          is_blocked: boolean;
          color_index: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          role?: MemberRoleDb;
          is_blocked?: boolean;
          color_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          role?: MemberRoleDb;
          is_blocked?: boolean;
          color_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      printers: {
        Row: {
          id: string;
          name: string;
          model: string | null;
          notes: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          model?: string | null;
          notes?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          model?: string | null;
          notes?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      reservations: {
        Row: {
          id: string;
          printer_id: string;
          user_id: string;
          title: string;
          notes: string | null;
          priority: PrintPriorityDb;
          status: ReservationStatusDb;
          starts_at: string;
          ends_at: string;
          justification: string | null;
          preempted_by: string | null;
          preempted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          printer_id: string;
          user_id: string;
          title: string;
          notes?: string | null;
          priority?: PrintPriorityDb;
          status?: ReservationStatusDb;
          starts_at: string;
          ends_at: string;
          justification?: string | null;
          preempted_by?: string | null;
          preempted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          printer_id?: string;
          user_id?: string;
          title?: string;
          notes?: string | null;
          priority?: PrintPriorityDb;
          status?: ReservationStatusDb;
          starts_at?: string;
          ends_at?: string;
          justification?: string | null;
          preempted_by?: string | null;
          preempted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reservations_printer_id_fkey';
            columns: ['printer_id'];
            isOneToOne: false;
            referencedRelation: 'printers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reservations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reservations_preempted_by_fkey';
            columns: ['preempted_by'];
            isOneToOne: false;
            referencedRelation: 'reservations';
            referencedColumns: ['id'];
          },
        ];
      };
      reservation_events: {
        Row: {
          id: string;
          reservation_id: string;
          actor_id: string | null;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          reservation_id: string;
          actor_id?: string | null;
          event_type: string;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          reservation_id?: string;
          actor_id?: string | null;
          event_type?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reservation_events_reservation_id_fkey';
            columns: ['reservation_id'];
            isOneToOne: false;
            referencedRelation: 'reservations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reservation_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      policy_settings: {
        Row: {
          id: boolean;
          policy: Json;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: boolean;
          policy?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: boolean;
          policy?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'policy_settings_updated_by_fkey';
            columns: ['updated_by'];
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
      book_reservation: {
        Args: {
          p_printer_id: string;
          p_user_id: string;
          p_title: string;
          p_notes: string | null;
          p_priority: PrintPriorityDb;
          p_starts_at: string;
          p_ends_at: string;
          p_justification: string | null;
          p_preempt_ids: string[];
        };
        Returns: Database['public']['Tables']['reservations']['Row'];
      };
    };
    Enums: {
      print_priority: PrintPriorityDb;
      reservation_status: ReservationStatusDb;
      member_role: MemberRoleDb;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database['public'];

export type ProfileRow = PublicSchema['Tables']['profiles']['Row'];
export type PrinterRow = PublicSchema['Tables']['printers']['Row'];
export type ReservationRow = PublicSchema['Tables']['reservations']['Row'];
export type ReservationEventRow = PublicSchema['Tables']['reservation_events']['Row'];
export type PolicySettingsRow = PublicSchema['Tables']['policy_settings']['Row'];

/** A reservation joined with the member who booked it. */
export type ReservationWithProfile = ReservationRow & {
  profile: Pick<
    ProfileRow,
    'id' | 'full_name' | 'email' | 'phone' | 'avatar_url' | 'color_index'
  > | null;
};
