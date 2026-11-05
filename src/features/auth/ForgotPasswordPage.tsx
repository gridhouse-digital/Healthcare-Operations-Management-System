import { useState } from 'react';
import { AuthLogo } from '@/components/shared/AuthLogo';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { ArrowLeft } from 'lucide-react';

export function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/update-password',
            });
            if (error) throw error;
            setMessage('Check your email for the password reset link.');
        } catch (resetError: any) {
            setError(resetError.message || 'Failed to send reset email.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-shell px-5">
            <div className="auth-grid" />
            <div className="relative w-full max-w-[400px]">
                <div className="auth-card">
                    <div className="border-b border-border px-8 pb-6 pt-8 text-center">
                        <AuthLogo />
                        <h1 className="auth-title">Reset Password</h1>
                        <p className="auth-meta mt-2">We&apos;ll send you a reset link to regain access.</p>
                    </div>

                    <form onSubmit={handleReset} className="space-y-4 px-8 py-6">
                        <div>
                            <label className="form-label">Email Address</label>
                            <input
                                type="email"
                                autoComplete="email"
                                required
                                placeholder="you@prolificcare.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="saas-input"
                            />
                        </div>

                        {error && (
                            <div className="rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2.5">
                                <p className="text-xs text-destructive">{error}</p>
                            </div>
                        )}

                        {message && (
                            <div className="rounded-lg border border-[color:var(--severity-low)]/20 bg-[color:var(--severity-low)]/8 px-3 py-2.5">
                                <p className="text-xs text-[color:var(--severity-low)]">{message}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground transition hover:bg-accent-hi disabled:cursor-not-allowed disabled:opacity-55"
                        >
                            {loading ? 'Sending link…' : 'Send Reset Link'}
                        </button>

                        <div className="pt-1 text-center">
                            <Link
                                to="/login"
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                            >
                                <ArrowLeft size={14} aria-hidden="true" />
                                Back to Login
                            </Link>
                        </div>
                    </form>
                </div>

                <p className="mt-5 text-center text-xs text-muted-foreground">
                    Password recovery is available to authorized personnel only.
                </p>
            </div>
        </div>
    );
}
