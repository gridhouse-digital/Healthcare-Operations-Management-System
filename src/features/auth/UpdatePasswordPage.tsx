import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/useToast';
import { Eye, EyeOff } from 'lucide-react';

export function UpdatePasswordPage() {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) navigate('/login');
        });
    }, [navigate]);

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) { setError("Passwords don't match"); return; }
        if (password.length < 6) { setError("Password must be at least 6 characters"); return; }

        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            toast.success('Password updated successfully!');
            navigate('/');
        } catch (error: any) {
            setError(error.message || 'Failed to update password.');
        } finally {
            setLoading(false);
        }
    };

    const inputStyle = {
        display: 'block',
        width: '100%',
        height: '36px',
        padding: '0 36px 0 12px',
        background: 'hsl(0 0% 11%)',
        border: '1px solid hsl(0 0% 18%)',
        borderRadius: '6px',
        color: 'hsl(0 0% 93%)',
        fontSize: '13px',
        outline: 'none',
        transition: 'border-color 150ms',
        fontFamily: "'IBM Plex Sans', sans-serif",
    };

    const labelStyle = {
        display: 'block',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: '0.6875rem',
        letterSpacing: '0.06em',
        textTransform: 'uppercase' as const,
        color: 'hsl(0 0% 42%)',
        marginBottom: '6px',
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
                            Set New Password
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
                            Enter your new password below
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleUpdatePassword} className="px-8 py-6 space-y-4">
                        {/* New password */}
                        <div>
                            <label style={labelStyle}>New Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    style={inputStyle}
                                    onFocus={e => (e.currentTarget.style.borderColor = 'hsl(196 84% 52% / 0.6)')}
                                    onBlur={e => (e.currentTarget.style.borderColor = 'hsl(0 0% 18%)')}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
                                    style={{ color: 'hsl(0 0% 36%)', padding: '2px' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'hsl(0 0% 58%)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'hsl(0 0% 36%)'}
                                >
                                    {showPassword ? <EyeOff size={13} strokeWidth={2} /> : <Eye size={13} strokeWidth={2} />}
                                </button>
                            </div>
                        </div>

                        {/* Confirm password */}
                        <div>
                            <label style={labelStyle}>Confirm Password</label>
                            <div className="relative">
                                <input
                                    type={showConfirm ? 'text' : 'password'}
                                    required
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    style={inputStyle}
                                    onFocus={e => (e.currentTarget.style.borderColor = 'hsl(196 84% 52% / 0.6)')}
                                    onBlur={e => (e.currentTarget.style.borderColor = 'hsl(0 0% 18%)')}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm(!showConfirm)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
                                    style={{ color: 'hsl(0 0% 36%)', padding: '2px' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'hsl(0 0% 58%)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'hsl(0 0% 36%)'}
                                >
                                    {showConfirm ? <EyeOff size={13} strokeWidth={2} /> : <Eye size={13} strokeWidth={2} />}
                                </button>
                            </div>
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
                            {loading ? 'Updating…' : 'Update Password'}
                        </button>
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
