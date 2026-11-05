import type { Session } from '@supabase/supabase-js';

export interface SessionClaims {
    role?: string;
    tenant_id?: string;
}

/**
 * Role and tenant for the signed-in user. custom_access_token_hook adds these
 * to the JWT from tenant_users, while session.user reflects the stored auth
 * metadata, which can be empty, so the token wins. For display and routing
 * only: RLS and Edge Functions enforce access on the server.
 */
export function sessionClaims(session: Session | null | undefined): SessionClaims {
    const stored = (session?.user?.app_metadata ?? {}) as SessionClaims;
    if (!session?.access_token) return stored;

    try {
        const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const claims = JSON.parse(atob(payload)) as { app_metadata?: SessionClaims };
        return { ...stored, ...claims.app_metadata };
    } catch {
        return stored;
    }
}
