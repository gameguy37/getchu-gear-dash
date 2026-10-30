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
      admin_notifications: {
        Row: {
          acknowledged: boolean
          channel: string | null
          created_at: string
          id: string
          job_id: string
          message: string | null
          metadata: Json | null
          notification_type: string
          operator_id: string
          read_at: string | null
          recipient_id: string | null
          recipient_role: string | null
          title: string | null
        }
        Insert: {
          acknowledged?: boolean
          channel?: string | null
          created_at?: string
          id?: string
          job_id: string
          message?: string | null
          metadata?: Json | null
          notification_type?: string
          operator_id: string
          read_at?: string | null
          recipient_id?: string | null
          recipient_role?: string | null
          title?: string | null
        }
        Update: {
          acknowledged?: boolean
          channel?: string | null
          created_at?: string
          id?: string
          job_id?: string
          message?: string | null
          metadata?: Json | null
          notification_type?: string
          operator_id?: string
          read_at?: string | null
          recipient_id?: string | null
          recipient_role?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notifications_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          id: number
          send_client_emails: boolean | null
          send_operator_emails: boolean | null
          send_operator_sms: boolean | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          send_client_emails?: boolean | null
          send_operator_emails?: boolean | null
          send_operator_sms?: boolean | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          send_client_emails?: boolean | null
          send_operator_emails?: boolean | null
          send_operator_sms?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      asset_history_logs: {
        Row: {
          asset_id: string
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          id: string
          job_id: string | null
          new_status: string | null
          notes: string | null
          previous_status: string | null
        }
        Insert: {
          asset_id: string
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          new_status?: string | null
          notes?: string | null
          previous_status?: string | null
        }
        Update: {
          asset_id?: string
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          new_status?: string | null
          notes?: string | null
          previous_status?: string | null
        }
        Relationships: []
      }
      asset_logs: {
        Row: {
          action: string
          asset_id: string
          created_at: string
          created_by: string | null
          details: string | null
          id: string
        }
        Insert: {
          action: string
          asset_id: string
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
        }
        Update: {
          action?: string
          asset_id?: string
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_logs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_name: string | null
          brand: string | null
          cable_length: string | null
          category: string | null
          color_code: string | null
          condition: string | null
          cover_image_url: string | null
          damage_notes: string | null
          damage_photo_url: string | null
          gallery_urls: string[] | null
          home_parent_id: string | null
          id: string
          is_borrowed: boolean
          manufacturer: string | null
          metadata: Json | null
          original_parent_id: string | null
          original_value: number | null
          parent_asset_id: string | null
          purchase_date: string | null
          purchase_receipt_notes: string | null
          purchase_receipt_url: string | null
          purchased_from: string | null
          quantity: number
          replaced_at: string | null
          replacement_cost: number | null
          serial_number: string | null
          status: string | null
          tracking_id: string | null
        }
        Insert: {
          asset_name?: string | null
          brand?: string | null
          cable_length?: string | null
          category?: string | null
          color_code?: string | null
          condition?: string | null
          cover_image_url?: string | null
          damage_notes?: string | null
          damage_photo_url?: string | null
          gallery_urls?: string[] | null
          home_parent_id?: string | null
          id?: string
          is_borrowed?: boolean
          manufacturer?: string | null
          metadata?: Json | null
          original_parent_id?: string | null
          original_value?: number | null
          parent_asset_id?: string | null
          purchase_date?: string | null
          purchase_receipt_notes?: string | null
          purchase_receipt_url?: string | null
          purchased_from?: string | null
          quantity?: number
          replaced_at?: string | null
          replacement_cost?: number | null
          serial_number?: string | null
          status?: string | null
          tracking_id?: string | null
        }
        Update: {
          asset_name?: string | null
          brand?: string | null
          cable_length?: string | null
          category?: string | null
          color_code?: string | null
          condition?: string | null
          cover_image_url?: string | null
          damage_notes?: string | null
          damage_photo_url?: string | null
          gallery_urls?: string[] | null
          home_parent_id?: string | null
          id?: string
          is_borrowed?: boolean
          manufacturer?: string | null
          metadata?: Json | null
          original_parent_id?: string | null
          original_value?: number | null
          parent_asset_id?: string | null
          purchase_date?: string | null
          purchase_receipt_notes?: string | null
          purchase_receipt_url?: string | null
          purchased_from?: string | null
          quantity?: number
          replaced_at?: string | null
          replacement_cost?: number | null
          serial_number?: string | null
          status?: string | null
          tracking_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_home_parent_id_fkey"
            columns: ["home_parent_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_original_parent_id_fkey"
            columns: ["original_parent_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          actual_end_time: string | null
          actual_start_time: string | null
          asset_ids: string[] | null
          checkin_location_url: string | null
          checkout_location_url: string | null
          end_of_day_notes: string | null
          expense_amount: number | null
          geofence_distance_miles: number | null
          geofence_flagged: boolean
          id: string
          job_id: string | null
          lunch_check_response: string | null
          lunch_check_time: string | null
          mileage_amount: number | null
          missing_asset_notes: Json | null
          mission_accepted: boolean
          operator_id: string | null
          receipt_urls: string[] | null
          time_manually_edited: boolean
        }
        Insert: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          asset_ids?: string[] | null
          checkin_location_url?: string | null
          checkout_location_url?: string | null
          end_of_day_notes?: string | null
          expense_amount?: number | null
          geofence_distance_miles?: number | null
          geofence_flagged?: boolean
          id?: string
          job_id?: string | null
          lunch_check_response?: string | null
          lunch_check_time?: string | null
          mileage_amount?: number | null
          missing_asset_notes?: Json | null
          mission_accepted?: boolean
          operator_id?: string | null
          receipt_urls?: string[] | null
          time_manually_edited?: boolean
        }
        Update: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          asset_ids?: string[] | null
          checkin_location_url?: string | null
          checkout_location_url?: string | null
          end_of_day_notes?: string | null
          expense_amount?: number | null
          geofence_distance_miles?: number | null
          geofence_flagged?: boolean
          id?: string
          job_id?: string | null
          lunch_check_response?: string | null
          lunch_check_time?: string | null
          mileage_amount?: number | null
          missing_asset_notes?: Json | null
          mission_accepted?: boolean
          operator_id?: string | null
          receipt_urls?: string[] | null
          time_manually_edited?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          city: string | null
          company_name: string
          contact_name: string | null
          country: string | null
          created_at: string | null
          email: string | null
          id: string
          on_site_contact: string | null
          on_site_contact_name: string | null
          on_site_contact_phone: string | null
          phone: string | null
          state: string | null
          street_address: string | null
          zip: string | null
        }
        Insert: {
          city?: string | null
          company_name: string
          contact_name?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          on_site_contact?: string | null
          on_site_contact_name?: string | null
          on_site_contact_phone?: string | null
          phone?: string | null
          state?: string | null
          street_address?: string | null
          zip?: string | null
        }
        Update: {
          city?: string | null
          company_name?: string
          contact_name?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          on_site_contact?: string | null
          on_site_contact_name?: string | null
          on_site_contact_phone?: string | null
          phone?: string | null
          state?: string | null
          street_address?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          email: string | null
          id: string
          name: string | null
          phone: string | null
          points: number
          role: string | null
          sms_opt_in: boolean
          sms_opt_in_timestamp: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          points?: number
          role?: string | null
          sms_opt_in?: boolean
          sms_opt_in_timestamp?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          points?: number
          role?: string | null
          sms_opt_in?: boolean
          sms_opt_in_timestamp?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      jobs: {
        Row: {
          address: string | null
          call_time: string | null
          cancelled_by_client_at: string | null
          client_name: string | null
          distance_miles: number | null
          guaranteed_hours: string | null
          id: string
          job_date: string | null
          job_number: string | null
          location_type: string | null
          mileage_reimbursement: number | null
          notes: string | null
          portal_token: string | null
          status: string
        }
        Insert: {
          address?: string | null
          call_time?: string | null
          cancelled_by_client_at?: string | null
          client_name?: string | null
          distance_miles?: number | null
          guaranteed_hours?: string | null
          id?: string
          job_date?: string | null
          job_number?: string | null
          location_type?: string | null
          mileage_reimbursement?: number | null
          notes?: string | null
          portal_token?: string | null
          status?: string
        }
        Update: {
          address?: string | null
          call_time?: string | null
          cancelled_by_client_at?: string | null
          client_name?: string | null
          distance_miles?: number | null
          guaranteed_hours?: string | null
          id?: string
          job_date?: string | null
          job_number?: string | null
          location_type?: string | null
          mileage_reimbursement?: number | null
          notes?: string | null
          portal_token?: string | null
          status?: string
        }
        Relationships: []
      }
      meemaw_kit_members: {
        Row: {
          added_at: string
          asset_id: string
          id: string
          kit_id: string
          position: number
          shared_at: string | null
          shared_job_id: string | null
          shared_notes: string | null
          shared_out: boolean
          shared_with_employee_id: string | null
        }
        Insert: {
          added_at?: string
          asset_id: string
          id?: string
          kit_id: string
          position?: number
          shared_at?: string | null
          shared_job_id?: string | null
          shared_notes?: string | null
          shared_out?: boolean
          shared_with_employee_id?: string | null
        }
        Update: {
          added_at?: string
          asset_id?: string
          id?: string
          kit_id?: string
          position?: number
          shared_at?: string | null
          shared_job_id?: string | null
          shared_notes?: string | null
          shared_out?: boolean
          shared_with_employee_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meemaw_kit_members_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "meemaw_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      meemaw_kits: {
        Row: {
          case_count: number
          cover_image_url: string | null
          created_at: string
          description: string | null
          emoji: string | null
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          case_count?: number
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          case_count?: number
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      point_activities: {
        Row: {
          award_slug: string | null
          created_at: string | null
          employee_id: string | null
          id: string
          points: number
          reason: string
        }
        Insert: {
          award_slug?: string | null
          created_at?: string | null
          employee_id?: string | null
          id?: string
          points: number
          reason: string
        }
        Update: {
          award_slug?: string | null
          created_at?: string | null
          employee_id?: string | null
          id?: string
          points?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_activities_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string | null
          employee_id: string
          id: string
          subscription: Json
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          id?: string
          subscription: Json
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          id?: string
          subscription?: Json
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      relay_messages: {
        Row: {
          created_at: string | null
          id: string
          job_id: string
          message: string
          read_by_client: boolean | null
          read_by_operator: boolean | null
          sender_id: string | null
          sender_name: string
          sender_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          job_id: string
          message: string
          read_by_client?: boolean | null
          read_by_operator?: boolean | null
          sender_id?: string | null
          sender_name: string
          sender_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          job_id?: string
          message?: string
          read_by_client?: boolean | null
          read_by_operator?: boolean | null
          sender_id?: string | null
          sender_name?: string
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "relay_messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relay_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_redemptions: {
        Row: {
          employee_id: string
          fulfilled_at: string | null
          id: string
          notes: string | null
          points_spent: number
          redeemed_at: string
          reward_id: string
          status: string
        }
        Insert: {
          employee_id: string
          fulfilled_at?: string | null
          id?: string
          notes?: string | null
          points_spent: number
          redeemed_at?: string
          reward_id: string
          status?: string
        }
        Update: {
          employee_id?: string
          fulfilled_at?: string | null
          id?: string
          notes?: string | null
          points_spent?: number
          redeemed_at?: string
          reward_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemptions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          emoji: string
          id: string
          name: string
          points_cost: number
          quantity_available: number | null
          quantity_redeemed: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          emoji?: string
          id?: string
          name: string
          points_cost?: number
          quantity_available?: number | null
          quantity_redeemed?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          emoji?: string
          id?: string
          name?: string
          points_cost?: number
          quantity_available?: number | null
          quantity_redeemed?: number
        }
        Relationships: [
          {
            foreignKeyName: "rewards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      sea_of_lost_items: {
        Row: {
          condition: string
          id: string
          item_name: string
          job_id: string | null
          missing_quantity: number
          notes: string | null
          operator_id: string | null
          parent_asset_id: string | null
          parent_rig_name: string | null
          replacement_cost: number | null
          reported_at: string
        }
        Insert: {
          condition?: string
          id?: string
          item_name: string
          job_id?: string | null
          missing_quantity?: number
          notes?: string | null
          operator_id?: string | null
          parent_asset_id?: string | null
          parent_rig_name?: string | null
          replacement_cost?: number | null
          reported_at?: string
        }
        Update: {
          condition?: string
          id?: string
          item_name?: string
          job_id?: string | null
          missing_quantity?: number
          notes?: string | null
          operator_id?: string | null
          parent_asset_id?: string | null
          parent_rig_name?: string | null
          replacement_cost?: number | null
          reported_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sea_of_lost_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sea_of_lost_items_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sea_of_lost_items_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auto_register_employee: {
        Args: { _email: string; _name: string; _user_id: string }
        Returns: undefined
      }
      calculate_total_asset_value: {
        Args: { base_asset_id: string }
        Returns: number
      }
      cancel_job_by_portal_token: {
        Args: { _token: string }
        Returns: undefined
      }
      get_employee_role: { Args: { _user_id: string }; Returns: string }
      get_job_by_portal_token: {
        Args: { _token: string }
        Returns: {
          address: string
          call_time: string
          cancelled_by_client_at: string
          client_name: string
          guaranteed_hours: string
          id: string
          job_date: string
          job_number: string
          location_type: string
          notes: string
          portal_token: string
          status: string
        }[]
      }
      operator_set_job_status: {
        Args: { _job_id: string; _status: string }
        Returns: undefined
      }
      operator_update_own_profile:
        | { Args: { _name?: string; _phone?: string }; Returns: undefined }
        | {
            Args: { _name?: string; _phone?: string; _sms_opt_in?: boolean }
            Returns: undefined
          }
      redeem_reward: {
        Args: { _employee_id: string; _reward_id: string }
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
