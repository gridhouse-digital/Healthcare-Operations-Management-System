import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { sessionClaims } from '@/lib/sessionClaims';

export type UserRole = 'platform_admin' | 'tenant_admin' | 'hr_admin';

export function useUserRole() {
    const [role, setRole] = useState<UserRole | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRole = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    setLoading(false);
                    return;
                }

                const appMetaRole = sessionClaims(session).role as UserRole | undefined;
                if (appMetaRole) {
                    setRole(appMetaRole);
                }
            } catch (error) {
                console.error('Failed to fetch role:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchRole();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const appMetaRole = sessionClaims(session).role as UserRole | undefined;
            setRole(appMetaRole ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    const isAdmin = role === 'platform_admin' || role === 'tenant_admin';

    return {
        role,
        loading,
        isAdmin,
        isPlatformAdmin: role === 'platform_admin',
        isTenantAdmin: role === 'tenant_admin',
        isHRAdmin: role === 'hr_admin',
    };
}
