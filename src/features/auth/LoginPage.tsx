import { useState } from 'react';
import { AuthLogo } from '@/components/shared/AuthLogo';
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
                        <AuthLogo />
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
                                    {showPassword ? <EyeOff size={14} strokeWidth={1.75} aria-hidden="true" /> : <Eye size={14} strokeWidth={1.75} aria-hidden="true" />}
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Link to="/forgot-password" className="text-xs font-medium text-primary transition-colors hover:text-primary/80">
                                Forgot password?
                            </Link>
                        </div>

                        {error && (
                            <div className="rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2.5">
                                <p className="text-xs text-destructive">{error}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground transition hover:bg-accent-hi disabled:cursor-not-allowed disabled:opacity-55"
                        >
                            {loading ? 'Signing in…' : 'Sign In'}
                        </button>

                        <div className="border-t border-border pt-4">
                            <p className="text-sm font-medium text-foreground">
                                New organization?
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Request workspace onboarding instead of creating an account directly.
                            </p>
                            <Link
                                to="/request-access"
                                className="mt-2 inline-flex min-h-9 items-center text-sm font-medium text-primary transition-colors hover:text-accent-hi"
                            >
                                Request access for your organization
                            </Link>
                        </div>
                    </form>
                </div>

                <p className="mt-5 text-center text-xs text-muted-foreground">
                    Authorized personnel only. Healthcare operations workspace.
                </p>
            </div>
        </div>
    );
}
