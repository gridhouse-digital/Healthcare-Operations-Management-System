import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Eye, EyeOff } from 'lucide-react';

export function LoginPage() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            setError(error.message);
            setLoading(false);
        } else {
            navigate('/');
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
                        <h1 className="auth-title">HOMS</h1>
                        <p className="auth-meta mt-2">Healthcare Operations Management System</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4 px-8 py-6">
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

                        <div>
                            <label className="form-label">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    required
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="saas-input pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                >
                                    {showPassword ? <EyeOff size={14} strokeWidth={2} /> : <Eye size={14} strokeWidth={2} />}
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Link to="/forgot-password" className="text-[12px] font-medium tracking-[0.01em] text-primary transition-colors hover:text-primary/80">
                                Forgot password?
                            </Link>
                        </div>

                        {error && (
                            <div className="rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2.5">
                                <p className="text-[12px] text-destructive">{error}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-[13px] font-semibold tracking-[0.01em] text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-55"
                        >
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>

                        <div className="rounded-lg border border-border bg-secondary/30 px-3 py-3">
                            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                                New organization?
                            </p>
                            <p className="mt-1 text-[12px] text-muted-foreground">
                                Request workspace onboarding instead of creating an account directly.
                            </p>
                            <Link
                                to="/request-access"
                                className="mt-2 inline-flex text-[12px] font-semibold tracking-[0.01em] text-primary transition-colors hover:text-primary/80"
                            >
                                Request access for your organization
                            </Link>
                        </div>
                    </form>
                </div>

                <p className="mt-5 text-center text-[11px] tracking-[0.06em] text-muted-foreground/55">
                    Authorized personnel only. Healthcare operations workspace.
                </p>
            </div>
        </div>
    );
}
