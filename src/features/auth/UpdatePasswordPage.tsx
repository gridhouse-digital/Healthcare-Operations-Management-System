import { useState, useEffect } from 'react';
import { AuthLogo } from '@/components/shared/AuthLogo';
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

        if (password !== confirmPassword) {
            setError("Passwords don't match");
            return;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            toast.success('Password updated successfully!');
            navigate('/');
        } catch (updateError: any) {
            setError(updateError.message || 'Failed to update password.');
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
                        <h1 className="auth-title">Set New Password</h1>
                        <p className="auth-meta mt-2">Choose a fresh password for your HR workspace.</p>
                    </div>

                    <form onSubmit={handleUpdatePassword} className="space-y-4 px-8 py-6">
                        <div>
                            <label className="form-label">New Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
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

                        <div>
                            <label className="form-label">Confirm Password</label>
                            <div className="relative">
                                <input
                                    type={showConfirm ? 'text' : 'password'}
                                    required
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="saas-input pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm(!showConfirm)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                >
                                    {showConfirm ? <EyeOff size={14} strokeWidth={1.75} aria-hidden="true" /> : <Eye size={14} strokeWidth={1.75} aria-hidden="true" />}
                                </button>
                            </div>
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
                            {loading ? 'Updating…' : 'Update Password'}
                        </button>
                    </form>
                </div>

                <p className="mt-5 text-center text-xs text-muted-foreground">
                    Security changes apply immediately after confirmation.
                </p>
            </div>
        </div>
    );
}
