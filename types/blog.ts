export interface BlogPost {
  id:           string;
  slug:         string;
  lang:         string;
  title:        string;
  excerpt:      string;
  content:      string;
  author:       string;
  published_at: string;
  cover_url:    string | null;
}
