export interface Brand {
  id:          string;
  org_id:      string;
  name:        string;
  slug:        string;
  avatar_url:  string | null;
  /** Logo del Brand Kit de la marca. Respaldo cuando no hay `avatar_url`. */
  kit_logo_url?: string | null;
  archived:    boolean;
  created_at:  string;
  updated_at:  string;
}
