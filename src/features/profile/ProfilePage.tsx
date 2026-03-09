import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Shield, User, Mail, Briefcase, Building2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from '@/hooks/useToast';

const inputCls = 'w-full h-9 px-3 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/50 disabled:opacity-50 disabled:cursor-not-allowed';
const labelCls = 'block text-[11px] font-mono uppercase tracking-[0.06em] text-muted-foreground mb-1.5';

export function ProfilePage() {
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    const [tenantUser, setTenantUser] = useState<any>(null);
    const [formData, setFormData] = useState({
        full_name: '',
        email: ''
    });
    const [savingProfile, setSavingProfile] = useState(false);

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
            if (user) {
                const { data: tu } = await supabase
                    .from('tenant_users')
                    .select('role, tenant:tenants(id, name, slug)')
                    .eq('user_id', user.id)
                    .maybeSingle();

                setTenantUser(tu);
                setFormData({
                    full_name: user.user_metadata?.full_name || '',
                    email: user.email || ''
                });
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingProfile(true);
        try {
            const hasChanges = formData.full_name !== (user?.user_metadata?.full_name || '');

            if (!hasChanges) { toast.info('No changes detected'); return; }

            const { data, error } = await supabase.auth.updateUser({
                data: { full_name: formData.full_name.trim() }
            });

            if (error) throw error;

            setUser(data.user);
            toast.success('Profile updated successfully');
        } catch (error: any) {
            console.error('Failed to update profile', error);
            toast.error(error.message || 'Failed to update profile');
        } finally {
            setSavingProfile(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) { toast.error("Passwords don't match"); return; }

        setPasswordLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            toast.success('Password updated successfully');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            console.error('Failed to update password', error);
            toast.error(error.message || 'Failed to update password');
        } finally {
            setPasswordLoading(false);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <span className="text-[13px] text-muted-foreground font-mono uppercase tracking-[0.06em]">Loading profile…</span>
        </div>
    );

    const fullName = formData.full_name || user?.email || 'User';
    const initials = fullName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part: string) => part[0]?.toUpperCase())
        .join('');
    const role = user?.app_metadata?.role || tenantUser?.role || 'hr_admin';

    return (
        <div className="space-y-5">
            {/* Page Header */}
            <div className="pl-1">
                <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.875rem', fontStyle: 'italic', letterSpacing: '-0.025em', lineHeight: 1.15 }}
                    className="text-foreground">
                    My Profile
                </h1>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6875rem', letterSpacing: '0.07em' }}
                    className="uppercase text-muted-foreground mt-1">
                    Personal information &amp; security
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Profile Card */}
                <div className="md:col-span-1">
                    <div className="bg-card border border-border rounded-lg p-5 space-y-5">
                        <div className="flex flex-col items-center text-center">
                            {/* Avatar */}
                            <div
                                className="w-20 h-20 rounded-full flex items-center justify-center mb-4 overflow-hidden"
                                style={{ background: 'hsl(196 84% 42% / 0.12)' }}
                            >
                                <Avatar className="h-full w-full">
                                    <AvatarFallback
                                        className="text-lg font-mono"
                                        style={{ background: 'transparent', color: 'hsl(196 84% 60%)' }}
                                    >
                                        {initials}
                                    </AvatarFallback>
                                </Avatar>
                            </div>
                            <h2 className="text-[15px] font-semibold text-foreground">
                                {fullName}
                            </h2>
                            <p className="text-[13px] text-muted-foreground mt-0.5">
                                {String(role).replace('_', ' ')}
                            </p>
                        </div>

                        <div className="space-y-3 pt-4 border-t border-border">
                            <div className="flex items-center gap-2.5">
                                <Mail size={13} className="text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
                                <span className="text-[13px] text-foreground truncate">{formData.email}</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <Briefcase size={13} className="text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
                                <span className="text-[13px] text-foreground capitalize">{String(role).replace('_', ' ')}</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <Building2 size={13} className="text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
                                <span className="text-[13px] text-foreground capitalize">{tenantUser?.tenant?.name || 'Tenant'}</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <User size={13} className="text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
                                <span className="text-[13px] text-muted-foreground">Since {new Date(user?.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Forms */}
                <div className="md:col-span-2 space-y-4">
                    {/* Personal Information */}
                    <div className="bg-card border border-border rounded-lg p-5">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-2.5">
                                <User size={14} className="text-primary flex-shrink-0" strokeWidth={2} />
                                <div>
                                    <p className="text-[13px] font-semibold text-foreground">Personal Information</p>
                                    <p className="text-[11px] text-muted-foreground">Update your auth profile metadata</p>
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleProfileUpdate} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>Full Name</label>
                                    <input type="text" required value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Email Address</label>
                                    <input type="email" value={formData.email} disabled className={inputCls} />
                                </div>
                            </div>

                            <div className="pt-2 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={savingProfile}
                                    className="inline-flex items-center h-8 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                                >
                                    {savingProfile ? 'Saving…' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Security Settings */}
                    <div className="bg-card border border-border rounded-lg p-5">
                        <div className="flex items-center gap-2.5 mb-5">
                            <Shield size={14} className="text-primary flex-shrink-0" strokeWidth={2} />
                            <div>
                                <p className="text-[13px] font-semibold text-foreground">Security Settings</p>
                                <p className="text-[11px] text-muted-foreground">Update your password</p>
                            </div>
                        </div>

                        <form onSubmit={handleChangePassword} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>New Password</label>
                                    <input type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Confirm Password</label>
                                    <input type="password" required minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} />
                                </div>
                            </div>
                            <div className="pt-2 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={passwordLoading}
                                    className="inline-flex items-center h-8 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                                >
                                    {passwordLoading ? 'Updating…' : 'Update Password'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
