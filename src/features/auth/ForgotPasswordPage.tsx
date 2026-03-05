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
        } catch (error: any) {
            setError(error.message || 'Failed to send reset email.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="flex min-h-screen items-center justify-center"
            style={{ background: 'hsl(0 0% 5%)' }}
        >
            {/* Subtle grid */}
            <div
                className="pointer-events-none absolute inset-0"
                style={{
                    backgroundImage: 'linear-gradient(hsl(0 0% 100% / 0.025) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100% / 0.025) 1px, transparent 1px)',
                    backgroundSize: '48px 48px',
                }}
            />

            <div className="relative w-full max-w-[360px] mx-5">
                {/* Card */}
                <div
                    className="rounded-xl overflow-hidden"
                    style={{
                        background: 'hsl(0 0% 8.5%)',
                        border: '1px solid hsl(0 0% 16%)',
                        boxShadow: '0 24px 64px hsl(0 0% 0% / 0.5)',
                    }}
                >
                    {/* Brand strip */}
                    <div
                        className="px-8 pt-8 pb-6 text-center"
                        style={{ borderBottom: '1px solid hsl(0 0% 13%)' }}
                    >
                        <img
                            src="https://bucket-ivvnia.s3.amazonaws.com/wp-content/uploads/2025/06/02222211/Prolific-Homecare-Logo.png"
                            alt="Prolific Homecare"
                            className="mx-auto h-14 w-auto object-contain mb-5"
                        />
                        <h1
                            style={{
                                fontFamily: "'DM Serif Display', serif",
                                fontSize: '1.5rem',
                                fontStyle: 'italic',
                                fontWeight: 400,
                                letterSpacing: '-0.02em',
                                color: 'hsl(0 0% 94%)',
                                lineHeight: 1.2,
                            }}
                        >
                            Reset Password
                        </h1>
                        <p
                            style={{
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: '0.625rem',
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: 'hsl(0 0% 36%)',
                                marginTop: '4px',
                            }}
                        >
                            We'll send you a reset link
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleReset} className="px-8 py-6 space-y-4">
                        {/* Email */}
                        <div>
                            <label
                                style={{
                                    display: 'block',
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    fontSize: '0.6875rem',
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                    color: 'hsl(0 0% 42%)',
                                    marginBottom: '6px',
                                }}
                            >
                                Email Address
                            </label>
                            <input
                                type="email"
                                autoComplete="email"
                                required
                                placeholder="you@prolificcare.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    height: '36px',
                                    padding: '0 12px',
                                    background: 'hsl(0 0% 11%)',
                                    border: '1px solid hsl(0 0% 18%)',
                                    borderRadius: '6px',
                                    color: 'hsl(0 0% 93%)',
                                    fontSize: '13px',
                                    outline: 'none',
                                    transition: 'border-color 150ms',
                                    fontFamily: "'IBM Plex Sans', sans-serif",
                                }}
                                onFocus={e => (e.currentTarget.style.borderColor = 'hsl(196 84% 52% / 0.6)')}
                                onBlur={e => (e.currentTarget.style.borderColor = 'hsl(0 0% 18%)')}
                            />
                        </div>

                        {/* Error */}
                        {error && (
                            <div
                                className="px-3 py-2.5 rounded-md"
                                style={{
                                    background: 'hsl(4 82% 52% / 0.08)',
                                    border: '1px solid hsl(4 82% 52% / 0.22)',
                                }}
                            >
                                <p style={{ fontSize: '12px', color: 'hsl(4 76% 62%)', fontFamily: "'IBM Plex Mono', monospace" }}>
                                    {error}
                                </p>
                            </div>
                        )}

                        {/* Success */}
                        {message && (
                            <div
                                className="px-3 py-2.5 rounded-md"
                                style={{
                                    background: 'hsl(152 58% 38% / 0.08)',
                                    border: '1px solid hsl(152 58% 38% / 0.22)',
                                }}
                            >
                                <p style={{ fontSize: '12px', color: 'hsl(152 54% 52%)', fontFamily: "'IBM Plex Mono', monospace" }}>
                                    {message}
                                </p>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full mt-2 transition-all duration-100 active:scale-[0.98]"
                            style={{
                                height: '36px',
                                borderRadius: '6px',
                                background: loading ? 'hsl(196 84% 42% / 0.5)' : 'hsl(196 84% 42%)',
                                color: 'white',
                                fontSize: '13px',
                                fontWeight: 600,
                                fontFamily: "'IBM Plex Sans', sans-serif",
                                border: 'none',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                letterSpacing: '0.01em',
                            }}
                            onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = 'hsl(196 84% 38%)'; }}
                            onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = 'hsl(196 84% 42%)'; }}
                        >
                            {loading ? 'Sending link…' : 'Send Reset Link'}
                        </button>

                        {/* Back to login */}
                        <div className="text-center pt-1">
                            <Link
                                to="/login"
                                className="inline-flex items-center gap-1.5 transition-colors"
                                style={{
                                    fontSize: '12px',
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    color: 'hsl(196 84% 52%)',
                                    letterSpacing: '0.02em',
                                }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'hsl(196 84% 66%)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'hsl(196 84% 52%)'}
                            >
                                <ArrowLeft size={12} />
                                Back to Login
                            </Link>
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <p
                    className="text-center mt-5"
                    style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: '0.5625rem',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'hsl(0 0% 24%)',
                    }}
                >
                    Authorized personnel only — Prolific Homecare LLC
                </p>
            </div>
        </div>
    );
}
