export interface JwtPayload {
  sub: string;
  organizationId: string;
  role: 'admin' | 'member';
  email: string;
}

export interface AuthUser {
  userId: string;
  organizationId: string;
  role: 'admin' | 'member';
  email: string;
}
