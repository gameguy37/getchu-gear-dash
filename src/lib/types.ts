export type UserRole = "manager" | "operator";

export interface User {
  id: string;
  name: string;
  user_type: UserRole;
  points: number;
  avatar_url?: string;
  email?: string;
  phone?: string;
  status?: "active" | "inactive";
}

export type JobStatus = "needs_prep" | "ready_for_takeoff" | "launched" | "pending_sign_off" | "completed" | "cancelled";

export interface Job {
  id: string;
  job_number: string;
  client_name: string;
  job_date: string;
  status: JobStatus;
  location_type: string;
  notes?: string;
  call_time?: string;
  address?: string;
  guaranteed_hours?: string;
  distance_miles?: number;
  mileage_reimbursement?: number;
}

export type AssetStatus = "available" | "checked_out" | "in_transit" | "missing" | "broken" | "iffy";

/** Statuses that prevent an asset from being checked out */
export const BLOCKED_ASSET_STATUSES: AssetStatus[] = ["iffy", "missing", "broken"];

export interface ComputerSpec {
  login_name?: string;
  macbook_type?: string;
  year?: string;
  os_version?: string;
  last_os_update?: string;
  prompter_version?: string;
  ms_word_installed?: boolean;
  remote_desktop_installed?: boolean;
  desktop_background_url?: string;
}

export interface Asset {
  id: string;
  asset_name: string;
  category: string;
  status: AssetStatus;
  color_code: string;
  serial?: string;
  parent_asset_id?: string;
  damage_notes?: string;
  quantity: number;
  original_value?: number;
  replacement_cost?: number;
  replaced_at?: string;
  metadata?: ComputerSpec;
  cover_image_url?: string;
  gallery_urls?: string[];
  damage_photo_url?: string;
  home_parent_id?: string;
  original_parent_id?: string;
  is_borrowed?: boolean;
  tracking_id?: string;
}

export interface LostItem {
  id: string;
  item_name: string;
  missing_quantity: number;
  condition: string;
  parent_rig_name?: string;
  parent_asset_id?: string;
  job_id?: string;
  operator_id?: string;
  reported_at: string;
  notes?: string;
  // Joined fields
  job?: Job;
  operator_name?: string;
}

export interface MissingAssetNote {
  asset_id: string;
  asset_name: string;
  parent_name: string;
}

export interface Assignment {
  id: string;
  job_id: string;
  operator_id: string;
  asset_ids: string[];
  actual_start_time?: string;
  actual_end_time?: string;
  lunch_check_response?: string;
  lunch_check_time?: string;
  time_manually_edited?: boolean;
  end_of_day_notes?: string;
  receipt_urls?: string[];
  expense_amount?: number;
  mileage_amount?: number;
  mission_accepted?: boolean;
  missing_asset_notes?: MissingAssetNote[];
}

export interface PointActivity {
  id: string;
  user_id: string;
  points: number;
  reason: string;
  timestamp: string;
}

export interface Client {
  id: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
}
