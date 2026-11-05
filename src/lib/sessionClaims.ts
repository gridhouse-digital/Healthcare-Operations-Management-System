import type { Session } from '@supabase/supabase-js';

export interface SessionClaims {
    role?: string;
    tenant_id?: string;
}

function tokenClaims(session: Session | null | undefined): SessionClaims {
    if (!session?.access_token) return {};

    try {
        const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const claims = JSON.parse(atob(payload)) as { app_metadata?: SessionClaims };
        return claims.app_metadata ?? {};
    } catch {
        return {};
    }
}

/**
 * Role and tenant for the signed-in user. custom_access_token_hook adds these
 * to the JWT from tenant_users, while session.user reflects stored auth
 * metadata, which can be empty.
 *
 * tenant_id comes only from the token, because callers use it to scope reads
 * and writes. role may fall back to stored metadata, as it only drives routing
 * and display: RLS and Edge Functions enforce access on the server.
 */
export function sessionClaims(session: Session | null | undefined): SessionClaims {
    const token = tokenClaims(session);
    const storedRole = (session?.user?.app_metadata as SessionClaims | undefined)?.role;
    return { role: token.role ?? storedRole, tenant_id: token.tenant_id };
}
