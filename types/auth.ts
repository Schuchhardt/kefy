export interface JWTPayload {
  userId: string;
  orgId:  string;
  role:   'owner' | 'admin' | 'member';
  plan:   'starter' | 'pro' | 'business';
}
