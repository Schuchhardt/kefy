import type { MessagingPlatform, SocialAccount } from '@/types/social';

export type { MessagingPlatform } from '@/types/social';

export type FilterType = 'dms' | 'comments' | 'reviews';

export interface ThreadPreview {
  id:                   string;
  platform:             MessagingPlatform;
  platform_thread_id:   string;
  platform_message_id:  string;
  sender_id:            string;
  sender_name:          string | null;
  sender_avatar:        string | null;
  body:                 string;
  direction:            'inbound' | 'outbound';
  read_at:              string | null;
  created_at:           string;
  kefy_social_accounts: SocialAccount;
}

export interface Message {
  id:             string;
  sender_id:      string;
  sender_name:    string | null;
  sender_avatar:  string | null;
  body:           string;
  direction:      'inbound' | 'outbound';
  read_at:        string | null;
  created_at:     string;
}

export interface CommentItem {
  id:                   string;
  platform:             MessagingPlatform;
  platform_post_id:     string;
  platform_comment_id:  string;
  author_id:            string;
  author_name:          string | null;
  author_avatar:        string | null;
  body:                 string;
  replied_at:           string | null;
  reply_body:           string | null;
  created_at:           string;
  kefy_social_accounts: SocialAccount;
}

export interface ReviewItem {
  id:                   string;
  platform:             MessagingPlatform;
  reviewer_id:          string;
  reviewer_name:        string | null;
  reviewer_avatar:      string | null;
  rating:               number;
  body:                 string | null;
  replied_at:           string | null;
  reply_body:           string | null;
  published_at:         string | null;
  created_at:           string;
  kefy_social_accounts: SocialAccount;
}
