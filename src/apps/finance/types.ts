export type Database = {
  public: {
    Tables: {
      households: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          household_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          household_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          household_id?: string | null;
          created_at?: string;
        };
      };
      accounts: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          name: string;
          iban: string | null;
          type: "checking" | "savings" | "creditcard";
          bank: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          name: string;
          iban?: string | null;
          type: "checking" | "savings" | "creditcard";
          bank: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
          name?: string;
          iban?: string | null;
          type?: "checking" | "savings";
          bank?: string;
          is_active?: boolean;
          created_at?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          parent_id: string | null;
          icon: string | null;
          color: string | null;
          is_default: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          parent_id?: string | null;
          icon?: string | null;
          color?: string | null;
          is_default?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          parent_id?: string | null;
          icon?: string | null;
          color?: string | null;
          is_default?: boolean;
          sort_order?: number;
          created_at?: string;
        };
      };
      transactions: {
        Row: {
          id: string;
          account_id: string;
          date: string;
          amount: number;
          description: string;
          counterparty_name: string | null;
          counterparty_iban: string | null;
          category_id: string | null;
          is_categorized: boolean;
          is_transfer: boolean;
          import_hash: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          date: string;
          amount: number;
          description: string;
          counterparty_name?: string | null;
          counterparty_iban?: string | null;
          category_id?: string | null;
          is_categorized?: boolean;
          is_transfer?: boolean;
          import_hash: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          date?: string;
          amount?: number;
          description?: string;
          counterparty_name?: string | null;
          counterparty_iban?: string | null;
          category_id?: string | null;
          is_categorized?: boolean;
          is_transfer?: boolean;
          import_hash?: string;
          created_at?: string;
        };
      };
      categorization_rules: {
        Row: {
          id: string;
          household_id: string;
          match_type: "iban" | "name_contains" | "description_contains";
          match_value: string;
          category_id: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          match_type: "iban" | "name_contains" | "description_contains";
          match_value: string;
          category_id: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          match_type?: "iban" | "name_contains" | "description_contains";
          match_value?: string;
          category_id?: string;
          is_active?: boolean;
          created_at?: string;
        };
      };
      budgets: {
        Row: {
          id: string;
          household_id: string;
          category_id: string;
          amount: number;
          period: "monthly" | "quarterly" | "yearly";
          cost_type: "fixed" | "semi_fixed" | "variable";
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          category_id: string;
          amount: number;
          period: "monthly" | "quarterly" | "yearly";
          cost_type?: "fixed" | "semi_fixed" | "variable";
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          category_id?: string;
          amount?: number;
          period?: "monthly" | "quarterly" | "yearly";
          cost_type?: "fixed" | "semi_fixed" | "variable";
          created_at?: string;
        };
      };
      savings_goals: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          target_amount: number;
          current_amount: number;
          monthly_contribution: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          target_amount: number;
          current_amount?: number;
          monthly_contribution?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          target_amount?: number;
          current_amount?: number;
          monthly_contribution?: number;
          created_at?: string;
        };
      };
      saved_views: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          name: string;
          filters: {
            period_type?: "month" | "quarter" | "year" | "custom";
            start_date?: string;
            end_date?: string;
            account_ids?: string[];
            sections?: string[];
          };
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          name: string;
          filters: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
          name?: string;
          filters?: Record<string, unknown>;
          created_at?: string;
        };
      };
      invites: {
        Row: {
          id: string;
          household_id: string;
          token: string;
          created_by: string;
          used_by: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          token: string;
          created_by: string;
          used_by?: string | null;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          token?: string;
          created_by?: string;
          used_by?: string | null;
          expires_at?: string;
          created_at?: string;
        };
      };
    };
    Views: {
      account_balances: {
        Row: {
          account_id: string;
          balance: number;
        };
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
