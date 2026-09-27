/**
 * Database types for `supabase-js`.
 * Regenerate after schema changes:
 *   npx supabase gen types typescript --local > src/core/network/database.types.ts
 * (Hand-maintained mirror of supabase/migrations until the first generation.)
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { user_id: string; display_name: string; created_at: string; updated_at: string };
        Insert: { user_id: string; display_name?: string };
        Update: { display_name?: string };
        Relationships: [];
      };
      wallets: {
        Row: { user_id: string; coins: number; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      inventory: {
        Row: { user_id: string; item_id: string; equipped: boolean; acquired_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      game_state: {
        Row: {
          user_id: string;
          energy: number;
          hunger: number;
          hygiene: number;
          fun: number;
          activity: string;
          activity_since: string | null;
          simulated_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      catalog_items: {
        Row: { id: string; slot: string; price: number; kind: string; active: boolean };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      server_now: { Args: Record<string, never>; Returns: string };
      purchase_item: { Args: { p_op_id: string; p_item_id: string }; Returns: Json };
      buy_food: { Args: { p_op_id: string; p_food_id: string }; Returns: Json };
      equip_item: { Args: { p_item_id: string }; Returns: Json };
      sync_game_state: {
        Args: {
          p_energy: number;
          p_hunger: number;
          p_hygiene: number;
          p_fun: number;
          p_activity: string;
          p_activity_since: string | null;
          p_simulated_at: string;
        };
        Returns: Json;
      };
      get_player_snapshot: { Args: Record<string, never>; Returns: Json };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
