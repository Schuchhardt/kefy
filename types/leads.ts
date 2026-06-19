export type LeadStage =
  | 'frio'
  | 'tibio'
  | 'caliente'
  | 'contactado'
  | 'convertido';

export interface Lead {
  id:                   string;
  username:             string;
  display_name:         string | null;
  avatar_url:           string | null;
  channel:              string;
  stage:                LeadStage;
  score:                number;
  notes:                string | null;
  tags:                 string[];
  contacted:            boolean;
  converted:            boolean;
  first_interaction_at: string | null;
  last_interaction_at:  string | null;
  created_at:           string;
}
