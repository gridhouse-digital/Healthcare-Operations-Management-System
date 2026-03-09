import { useState } from 'react';
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
                        <img
                            src="https://bucket-ivvnia.s3.amazonaws.com/wp-content/uploads/2025/06/02222211/Prolific-Homecare-Logo.png"
                            alt="HOMS"
                            className="mx-auto mb-5 h-14 w-auto object-contain"
                        />
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
                                <p className="text-[12px] text-destructive">{error}</p>
                            </div>
                        )}

                        {message && (
                            <div className="rounded-lg border border-[color:var(--severity-low)]/20 bg-[color:var(--severity-low)]/8 px-3 py-2.5">
                                <p className="text-[12px] text-[color:var(--severity-low)]">{message}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-[13px] font-semibold tracking-[0.01em] text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-55"
                        >
                            {loading ? 'Sending link...' : 'Send Reset Link'}
                        </button>

                        <div className="pt-1 text-center">
                            <Link
                                to="/login"
                                className="inline-flex items-center gap-1.5 text-[12px] font-medium tracking-[0.01em] text-primary transition-colors hover:text-primary/80"
                            >
                                <ArrowLeft size={12} />
                                Back to Login
                            </Link>
                        </div>
                    </form>
                </div>

                <p className="mt-5 text-center text-[11px] tracking-[0.06em] text-muted-foreground/55">
                    Password recovery is available to authorized personnel only.
                </p>
            </div>
        </div>
    );
}
