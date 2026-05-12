export type AuthRole = 'admin' | 'editor' | 'viewer';
export type AuthOutputLanguage = 'es' | 'en';
export type AuthProduct = 'sommelier' | 'cellar' | 'distributor' | 'both';
export type AuthKbPreference = 'private_first' | 'global_first' | 'show_both';

export type AuthCtx = {
  orgId: string;
  userId: string;
  email: string;
  role: AuthRole;
  product: AuthProduct;
  outputLanguage: AuthOutputLanguage;
  kbPreference: AuthKbPreference;
};

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthCtx;
  }
}
