import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { useUserRole, type UserRole } from '@/hooks/useUserRole';

interface ProtectedRouteProps {
    allowedRoles?: UserRole[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const { role, loading: roleLoading } = useUserRole();

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    if (loading || roleLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div
                    className="h-8 w-8 animate-spin rounded-full border-2 border-border"
                    style={{ borderTopColor: 'var(--primary)' }}
                />
            </div>
        );
    }

    if (!session) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && role && !allowedRoles.includes(role)) {
        return (
            <div className="flex h-screen items-center justify-center bg-background px-6">
                <div className="saas-card max-w-md p-8 text-center">
                    <h1 className="page-header-title text-destructive">Access Denied</h1>
                    <p className="page-header-meta">
                        You do not have permission to view this page.
                    </p>
                </div>
            </div>
        );
    }

    return <Outlet />;
}
