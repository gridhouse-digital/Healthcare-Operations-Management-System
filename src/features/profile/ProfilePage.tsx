import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { userService } from '@/services/userService';
import { Shield, User, Mail, Briefcase } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from '@/hooks/useToast';

const inputCls = 'w-full h-9 px-3 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/50 disabled:opacity-50 disabled:cursor-not-allowed';
const labelCls = 'block text-[11px] font-mono uppercase tracking-[0.06em] text-muted-foreground mb-1.5';

export function ProfilePage() {
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState<any>(null);

    const [pendingRequest, setPendingRequest] = useState<any>(null);
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone_number: ''
    });
    const [requestLoading, setRequestLoading] = useState(false);

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);

    useEffect(() => {
        loadProfile();
        loadPendingRequest();
    }, []);

    const loadPendingRequest = async () => {
        try {
            const request = await userService.getPendingRequest();
            setPendingRequest(request);
        } catch (error) {
            console.error('Error loading pending request:', error);
        }
    };

    const loadProfile = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
            if (user) {
                const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
                setProfile(data);
                setFormData({
                    first_name: data.first_name || '',
                    last_name: data.last_name || '',
                    email: user.email || '',
                    phone_number: data.phone_number || ''
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
        setRequestLoading(true);
        try {
            const hasChanges =
                formData.first_name !== (profile?.first_name || '') ||
                formData.last_name !== (profile?.last_name || '') ||
                formData.email !== (user?.email || '') ||
                formData.phone_number !== (profile?.phone_number || '');

            if (!hasChanges) { toast.info('No changes detected'); return; }

            await userService.createProfileChangeRequest(formData);
            toast.success('Profile update request submitted for approval');
            loadPendingRequest();
        } catch (error: any) {
            console.error('Failed to submit request', error);
            toast.error(error.message || 'Failed to submit request');
        } finally {
            setRequestLoading(false);
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

    const initials = `${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`;

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
                                    <AvatarImage src="" alt={profile?.first_name} />
                                    <AvatarFallback
                                        className="text-lg font-mono"
                                        style={{ background: 'transparent', color: 'hsl(196 84% 60%)' }}
                                    >
                                        {initials}
                                    </AvatarFallback>
                                </Avatar>
                            </div>
                            <h2 className="text-[15px] font-semibold text-foreground">
                                {profile?.first_name} {profile?.last_name}
                            </h2>
                            <p className="text-[13px] text-muted-foreground mt-0.5">
                                {profile?.role === 'admin' ? 'Administrator' : 'Staff Member'}
                            </p>
                        </div>

                        <div className="space-y-3 pt-4 border-t border-border">
                            <div className="flex items-center gap-2.5">
                                <Mail size={13} className="text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
                                <span className="text-[13px] text-foreground truncate">{user?.email}</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <Briefcase size={13} className="text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
                                <span className="text-[13px] text-foreground capitalize">{profile?.role}</span>
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
                                    <p className="text-[11px] text-muted-foreground">Update your personal details</p>
                                </div>
                            </div>
                            {pendingRequest && (
                                <span
                                    className="inline-flex items-center h-6 px-2.5 rounded text-[10px] font-mono font-semibold uppercase tracking-[0.04em]"
                                    style={{
                                        color: 'hsl(38 90% 60%)',
                                        background: 'hsl(38 96% 48% / 0.08)',
                                        border: '1px solid hsl(38 96% 48% / 0.22)',
                                    }}
                                >
                                    Pending Approval
                                </span>
                            )}
                        </div>

                        <form onSubmit={handleProfileUpdate} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>First Name</label>
                                    <input type="text" required value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} disabled={!!pendingRequest} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Last Name</label>
                                    <input type="text" required value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} disabled={!!pendingRequest} className={inputCls} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>Email Address</label>
                                    <input type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} disabled={!!pendingRequest} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Phone Number</label>
                                    <input type="tel" value={formData.phone_number} onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })} disabled={!!pendingRequest} placeholder="+1 (555) 000-0000" className={inputCls} />
                                </div>
                            </div>

                            {!pendingRequest && (
                                <div className="pt-2 flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={requestLoading}
                                        className="inline-flex items-center h-8 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                                    >
                                        {requestLoading ? 'Submitting…' : 'Request Changes'}
                                    </button>
                                </div>
                            )}
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
