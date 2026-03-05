import { useState, useEffect } from 'react';
import { settingsService } from '@/services/settingsService';
import { supabase } from '@/lib/supabase';
import {
    Key,
    Settings as SettingsIcon,
    Save,
    Users,
    Eye,
    EyeOff,
    Plus,
    X,
    Trash2
} from 'lucide-react';
import { userService, type UserProfile } from '@/services/userService';
import { toast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type SettingsTab = 'Integrations' | 'System Settings' | 'Team';

const inputCls = 'w-full h-9 px-3 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/50';
const labelCls = 'block text-[11px] font-mono uppercase tracking-[0.06em] text-muted-foreground mb-1.5';
const sectionCls = 'p-5 border border-border rounded-lg space-y-4';

// Status badge — dark-first, no dark: prefixes
const connectedBadge = { color: 'hsl(152 54% 54%)', background: 'hsl(152 58% 38% / 0.10)', border: '1px solid hsl(152 58% 38% / 0.20)' };
const optionalBadge  = { color: 'hsl(0 0% 44%)',    background: 'hsl(0 0% 100% / 0.04)',   border: '1px solid hsl(0 0% 100% / 0.08)' };

function ConnectedBadge({ label = 'Connected', connected = true }: { label?: string; connected?: boolean }) {
    const style = connected ? connectedBadge : optionalBadge;
    return (
        <span
            className="inline-flex items-center h-5 px-2 rounded text-[10px] font-mono font-semibold uppercase tracking-[0.04em]"
            style={style}
        >
            {label}
        </span>
    );
}

export function SettingsPage() {
    const [activeTab, setActiveTab] = useState<SettingsTab>('Integrations');
    const [showApiKeys, setShowApiKeys] = useState(false);
    const [settingsMap, setSettingsMap] = useState<Record<string, string>>({});
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteLoading, setInviteLoading] = useState(false);

    const [jobRoles, setJobRoles] = useState<string[]>([]);
    const [newRole, setNewRole] = useState('');

    const { confirm, confirmState, handleClose, handleConfirm } = useConfirm();

    useEffect(() => {
        if (activeTab === 'Team') {
            loadUsers();
        } else {
            loadSettings();
            loadJobRoles();
        }
    }, [activeTab]);

    const loadJobRoles = async () => {
        try { setJobRoles(await settingsService.getJobRoles()); }
        catch (error) { console.error('Failed to load job roles', error); }
    };

    const loadSettings = async () => {
        try { setSettingsMap(await settingsService.getSettings()); }
        catch (error) { console.error('Failed to load settings', error); }
        finally { setLoading(false); }
    };

    const loadUsers = async () => {
        try {
            setLoading(true);
            setUsers(await userService.getUsers());
        } catch (error) {
            console.error('Failed to load users', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try { await settingsService.updateSettings(settingsMap); toast.success('Settings saved successfully'); }
        catch (error) { console.error('Failed to save settings', error); toast.error('Failed to save settings'); }
    };

    const handleAddRole = async () => {
        if (!newRole.trim()) return;
        if (jobRoles.includes(newRole.trim())) { toast.error('Role already exists'); return; }
        const updatedRoles = [...jobRoles, newRole.trim()];
        setJobRoles(updatedRoles);
        setNewRole('');
        try { await settingsService.updateJobRoles(updatedRoles); toast.success('Role added successfully'); }
        catch (error) { console.error('Failed to save role', error); toast.error('Failed to save role'); }
    };

    const handleDeleteRole = async (roleToDelete: string) => {
        const confirmed = await confirm({
            title: 'Delete Role',
            description: `Are you sure you want to delete "${roleToDelete}"? This will not affect existing applicants but will remove it from the filter list.`,
            confirmText: 'Delete',
            variant: 'danger',
        });
        if (!confirmed) return;
        const updatedRoles = jobRoles.filter(role => role !== roleToDelete);
        setJobRoles(updatedRoles);
        try { await settingsService.updateJobRoles(updatedRoles); toast.success('Role removed'); }
        catch (error) { console.error('Failed to remove role', error); toast.error('Failed to remove role'); }
    };

    const updateSetting = (key: string, value: string) => {
        setSettingsMap(prev => ({ ...prev, [key]: value }));
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setInviteLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('invite-user', { body: { email: inviteEmail } });
            if (error) throw error;
            if (data && data.error) throw new Error(JSON.stringify(data, null, 2));
            toast.success('Invitation sent successfully!');
            setShowInviteModal(false);
            setInviteEmail('');
            loadUsers();
        } catch (error: any) {
            console.error('Failed to invite user', error);
            toast.error(error.message || JSON.stringify(error, null, 2));
        } finally {
            setInviteLoading(false);
        }
    };

    const [requests, setRequests] = useState<any[]>([]);
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
    const [editFormData, setEditFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone_number: '',
        role: 'staff' as 'admin' | 'hr' | 'staff',
        password: ''
    });
    const [editLoading, setEditLoading] = useState(false);

    useEffect(() => {
        if (activeTab === 'Team') loadRequests();
    }, [activeTab]);

    const loadRequests = async () => {
        try { setRequests(await userService.getAllPendingRequests()); }
        catch (error) { console.error('Failed to load requests', error); }
    };

    const handleApprove = async (requestId: string) => {
        const confirmed = await confirm({ title: 'Approve Request', description: 'Are you sure you want to approve this request?', confirmText: 'Approve' });
        if (!confirmed) return;
        try { await userService.approveRequest(requestId); toast.success('Request approved'); loadRequests(); loadUsers(); }
        catch (error) { console.error('Failed to approve request', error); toast.error('Failed to approve request'); }
    };

    const handleReject = async (requestId: string) => {
        const confirmed = await confirm({ title: 'Reject Request', description: 'Are you sure you want to reject this request?', confirmText: 'Reject', variant: 'danger' });
        if (!confirmed) return;
        try { await userService.rejectRequest(requestId); toast.success('Request rejected'); loadRequests(); }
        catch (error) { console.error('Failed to reject request', error); toast.error('Failed to reject request'); }
    };

    const handleEditClick = (user: UserProfile) => {
        setEditingUser(user);
        setEditFormData({ first_name: user.first_name || '', last_name: user.last_name || '', email: user.email, phone_number: user.phone_number || '', role: user.role, password: '' });
    };

    const handleUpdateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;
        setEditLoading(true);
        try {
            const updates: any = { first_name: editFormData.first_name, last_name: editFormData.last_name, email: editFormData.email, phone_number: editFormData.phone_number, role: editFormData.role };
            if (editFormData.password) updates.password = editFormData.password;
            await userService.adminUpdateUser(editingUser.id, updates);
            toast.success('User updated successfully');
            setEditingUser(null);
            loadUsers();
        } catch (error) {
            console.error('Failed to update user', error);
            toast.error('Failed to update user');
        } finally {
            setEditLoading(false);
        }
    };

    const tabs: { id: SettingsTab; label: string; icon: any }[] = [
        { id: 'Integrations', label: 'Integrations', icon: Key },
        { id: 'System Settings', label: 'System Settings', icon: SettingsIcon },
        { id: 'Team', label: 'Team', icon: Users },
    ];

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <span className="text-[13px] text-muted-foreground font-mono uppercase tracking-[0.06em]">Loading settings…</span>
        </div>
    );

    const SaveButton = () => (
        <div className="flex justify-end pt-4">
            <button onClick={handleSave} className="inline-flex items-center gap-2 h-8 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors">
                <Save size={13} />
                Save Changes
            </button>
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Page Header */}
            <div className="pl-1">
                <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.875rem', fontStyle: 'italic', letterSpacing: '-0.025em', lineHeight: 1.15 }}
                    className="text-foreground">
                    Settings
                </h1>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6875rem', letterSpacing: '0.07em' }}
                    className="uppercase text-muted-foreground mt-1">
                    System configuration &amp; integrations
                </p>
            </div>

            <div className="flex flex-col lg:flex-row gap-5">
                {/* Sidebar Tabs */}
                <div className="w-full lg:w-52 bg-card border border-border rounded-lg p-2">
                    <nav className="flex lg:flex-col overflow-x-auto lg:overflow-visible gap-1">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className="flex-shrink-0 lg:w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-[13px] transition-colors whitespace-nowrap"
                                    style={{
                                        background: isActive ? 'hsl(196 84% 42% / 0.10)' : 'transparent',
                                        color: isActive ? 'hsl(196 84% 60%)' : 'hsl(0 0% 44%)',
                                        fontWeight: isActive ? 600 : 400,
                                    }}
                                    onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = 'hsl(0 0% 100% / 0.04)'; (e.currentTarget as HTMLButtonElement).style.color = 'hsl(0 0% 72%)'; } }}
                                    onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'hsl(0 0% 44%)'; } }}
                                >
                                    <Icon size={14} strokeWidth={isActive ? 2 : 1.75} />
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Content */}
                <div className="flex-1 bg-card border border-border rounded-lg">
                    {/* Integrations */}
                    {activeTab === 'Integrations' && (
                        <div className="p-5 space-y-4">
                            <div className="mb-2">
                                <p className="text-[14px] font-semibold text-foreground">API Integrations</p>
                                <p className="text-[12px] text-muted-foreground mt-0.5">Configure external service connections for automated data sync</p>
                            </div>

                            {/* Airtable */}
                            <div className={sectionCls}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[13px] font-semibold text-foreground">Airtable</p>
                                        <p className="text-[11px] text-muted-foreground">Applicant data sync</p>
                                    </div>
                                    <ConnectedBadge connected />
                                </div>
                                <div>
                                    <label className={labelCls}>Base ID</label>
                                    <input type="text" value={settingsMap['airtable_base_id'] || ''} onChange={(e) => updateSetting('airtable_base_id', e.target.value)} placeholder="appXXXXXXXXXXXXXX" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>API Key</label>
                                    <div className="relative">
                                        <input type={showApiKeys ? 'text' : 'password'} value={settingsMap['airtable_api_key'] || ''} onChange={(e) => updateSetting('airtable_api_key', e.target.value)} placeholder="keyXXXXXXXXXXXXXX" className={inputCls + ' pr-9'} />
                                        <button onClick={() => setShowApiKeys(!showApiKeys)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                            {showApiKeys ? <EyeOff size={13} /> : <Eye size={13} />}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className={labelCls}>Table Name</label>
                                    <input type="text" value={settingsMap['airtable_table_name'] || ''} onChange={(e) => updateSetting('airtable_table_name', e.target.value)} placeholder="Applicants" className={inputCls} />
                                </div>
                            </div>

                            {/* JotForm */}
                            <div className={sectionCls}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[13px] font-semibold text-foreground">JotForm</p>
                                        <p className="text-[11px] text-muted-foreground">Form submission sync</p>
                                    </div>
                                    <ConnectedBadge connected={!!settingsMap['jotform_api_key']} label={settingsMap['jotform_api_key'] ? 'Connected' : 'Not Configured'} />
                                </div>
                                <div>
                                    <label className={labelCls}>API Key</label>
                                    <div className="relative">
                                        <input type={showApiKeys ? 'text' : 'password'} value={settingsMap['jotform_api_key'] || ''} onChange={(e) => updateSetting('jotform_api_key', e.target.value)} placeholder="Enter JotForm API Key" className={inputCls + ' pr-9'} />
                                        <button onClick={() => setShowApiKeys(!showApiKeys)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                            {showApiKeys ? <EyeOff size={13} /> : <Eye size={13} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {[
                                        { key: 'jotform_form_id_application', label: 'Application Form ID' },
                                        { key: 'jotform_form_id_emergency', label: 'Emergency Contact Form ID' },
                                        { key: 'jotform_form_id_i9', label: 'I-9 Form ID' },
                                        { key: 'jotform_form_id_vaccination', label: 'Vaccination Form ID' },
                                        { key: 'jotform_form_id_licenses', label: 'Licenses Form ID' },
                                        { key: 'jotform_form_id_background', label: 'Background Check Form ID' }
                                    ].map((field) => (
                                        <div key={field.key}>
                                            <label className={labelCls}>{field.label}</label>
                                            <input type="text" value={settingsMap[field.key] || ''} onChange={(e) => updateSetting(field.key, e.target.value)} placeholder="2419..." className={inputCls} />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Brevo */}
                            <div className={sectionCls}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[13px] font-semibold text-foreground">Brevo (Sendinblue)</p>
                                        <p className="text-[11px] text-muted-foreground">Email delivery service</p>
                                    </div>
                                    <ConnectedBadge connected={!!settingsMap['brevo_api_key']} label={settingsMap['brevo_api_key'] ? 'Connected' : 'Not Configured'} />
                                </div>
                                <div>
                                    <label className={labelCls}>API Key</label>
                                    <div className="relative">
                                        <input type={showApiKeys ? 'text' : 'password'} value={settingsMap['brevo_api_key'] || ''} onChange={(e) => updateSetting('brevo_api_key', e.target.value)} placeholder="xkeysib-..." className={inputCls + ' pr-9'} />
                                        <button onClick={() => setShowApiKeys(!showApiKeys)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                            {showApiKeys ? <EyeOff size={13} /> : <Eye size={13} />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* WordPress */}
                            <div className={sectionCls}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[13px] font-semibold text-foreground">WordPress / LearnDash</p>
                                        <p className="text-[11px] text-muted-foreground">Employee onboarding &amp; LMS</p>
                                    </div>
                                    <ConnectedBadge connected />
                                </div>
                                <div>
                                    <label className={labelCls}>WordPress API URL</label>
                                    <input type="text" value={settingsMap['wp_api_url'] || ''} onChange={(e) => updateSetting('wp_api_url', e.target.value)} placeholder="https://training.yoursite.com/wp-json" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>WordPress Admin Username</label>
                                    <input type="text" value={settingsMap['wp_username'] || ''} onChange={(e) => updateSetting('wp_username', e.target.value)} placeholder="admin_user" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Application Password</label>
                                    <input type={showApiKeys ? 'text' : 'password'} value={settingsMap['wp_app_password'] || ''} onChange={(e) => updateSetting('wp_app_password', e.target.value)} placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>LearnDash Group Map (JSON)</label>
                                    <textarea
                                        value={settingsMap['learndash_group_map'] || '{}'}
                                        onChange={(e) => updateSetting('learndash_group_map', e.target.value)}
                                        className="w-full h-28 px-3 py-2 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 font-mono"
                                        placeholder='{ "Nurse": 123, "Caregiver": 456 }'
                                    />
                                    <p className="mt-1 text-[11px] text-muted-foreground font-mono">Map Job Positions to LearnDash Group IDs</p>
                                </div>
                            </div>

                            {/* Webhooks */}
                            <div className={sectionCls}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[13px] font-semibold text-foreground">Automation Webhooks</p>
                                        <p className="text-[11px] text-muted-foreground">n8n / Zapier integrations</p>
                                    </div>
                                    <ConnectedBadge connected={false} label="Optional" />
                                </div>
                                <div>
                                    <label className={labelCls}>Offer Approved Webhook</label>
                                    <input value={settingsMap['webhook_offer_approved'] || ''} onChange={(e) => updateSetting('webhook_offer_approved', e.target.value)} placeholder="https://hooks.n8n.io/webhook/..." className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Employee Onboarded Webhook</label>
                                    <input value={settingsMap['webhook_employee_onboarded'] || ''} onChange={(e) => updateSetting('webhook_employee_onboarded', e.target.value)} placeholder="https://hooks.zapier.com/hooks/catch/..." className={inputCls} />
                                </div>
                            </div>

                            <SaveButton />
                        </div>
                    )}

                    {/* System Settings */}
                    {activeTab === 'System Settings' && (
                        <div className="p-5 space-y-4">
                            <div className="mb-2">
                                <p className="text-[14px] font-semibold text-foreground">System Configuration</p>
                                <p className="text-[12px] text-muted-foreground mt-0.5">Configure company branding and system defaults</p>
                            </div>

                            {/* Company Branding */}
                            <div className={sectionCls}>
                                <p className="text-[13px] font-semibold text-foreground">Company Branding</p>
                                <div>
                                    <label className={labelCls}>Company Name</label>
                                    <input type="text" value={settingsMap['company_name'] || ''} onChange={(e) => updateSetting('company_name', e.target.value)} placeholder="Prolific Homecare LLC" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Light Mode Logo URL</label>
                                    <input value={settingsMap['logo_light'] || ''} onChange={(e) => updateSetting('logo_light', e.target.value)} placeholder="https://.../logo-light.png" className={inputCls} />
                                    <p className="text-[11px] text-muted-foreground font-mono mt-1">Used in light mode and emails</p>
                                </div>
                                <div>
                                    <label className={labelCls}>Dark Mode Logo URL</label>
                                    <input value={settingsMap['logo_dark'] || ''} onChange={(e) => updateSetting('logo_dark', e.target.value)} placeholder="https://.../logo-dark.png" className={inputCls} />
                                    <p className="text-[11px] text-muted-foreground font-mono mt-1">Used in dark mode</p>
                                </div>
                            </div>

                            {/* Document Requirements */}
                            <div className={sectionCls}>
                                <p className="text-[13px] font-semibold text-foreground">Document Requirements</p>
                                <div className="space-y-2">
                                    {['Application Form', 'I-9 Form', 'Background Check', 'Emergency Contact', 'License/Certifications', 'Vaccination Records', 'CPR Card', 'TB Test'].map((doc) => (
                                        <label
                                            key={doc}
                                            className="flex items-center gap-3 p-2.5 rounded-md cursor-pointer transition-colors"
                                            style={{ background: 'hsl(0 0% 100% / 0.03)' }}
                                            onMouseEnter={e => (e.currentTarget as HTMLLabelElement).style.background = 'hsl(0 0% 100% / 0.06)'}
                                            onMouseLeave={e => (e.currentTarget as HTMLLabelElement).style.background = 'hsl(0 0% 100% / 0.03)'}
                                        >
                                            <input type="checkbox" defaultChecked className="w-3.5 h-3.5 accent-primary" />
                                            <span className="text-[13px] text-foreground">{doc}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Compliance */}
                            <div className={sectionCls}>
                                <p className="text-[13px] font-semibold text-foreground">Compliance Rules</p>
                                <div>
                                    <label className={labelCls}>Alert Days Before Document Expiration</label>
                                    <input type="number" value={settingsMap['compliance_alert_days'] || ''} onChange={(e) => updateSetting('compliance_alert_days', e.target.value)} placeholder="30" className={inputCls} />
                                    <p className="text-[11px] text-muted-foreground font-mono mt-1">System will alert when documents are within this many days of expiring</p>
                                </div>
                            </div>

                            {/* Job Roles */}
                            <div className={sectionCls}>
                                <div>
                                    <p className="text-[13px] font-semibold text-foreground">Job Roles</p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">Manage the list of job roles available for applicants and filtering</p>
                                </div>
                                <div className="flex gap-2">
                                    <input type="text" value={newRole} onChange={(e) => setNewRole(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddRole()} placeholder="Enter new job role…" className={inputCls + ' flex-1'} />
                                    <button onClick={handleAddRole} disabled={!newRole.trim()} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap">
                                        <Plus size={13} />
                                        Add
                                    </button>
                                </div>
                                <div className="space-y-1.5">
                                    {jobRoles.map((role, index) => (
                                        <div
                                            key={index}
                                            className="flex items-center justify-between px-3 py-2 rounded-md border border-border group transition-colors"
                                            style={{ background: 'hsl(0 0% 100% / 0.03)' }}
                                            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'hsl(0 0% 100% / 0.06)'}
                                            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'hsl(0 0% 100% / 0.03)'}
                                        >
                                            <span className="text-[13px] text-foreground">{role}</span>
                                            <button
                                                onClick={() => handleDeleteRole(role)}
                                                className="opacity-0 group-hover:opacity-100 p-0.5 transition-all"
                                                style={{ color: 'hsl(0 0% 36%)' }}
                                                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'hsl(4 82% 58%)'}
                                                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'hsl(0 0% 36%)'}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))}
                                    {jobRoles.length === 0 && (
                                        <p className="text-[12px] text-muted-foreground font-mono italic">No active job roles configured.</p>
                                    )}
                                </div>
                            </div>

                            <SaveButton />
                        </div>
                    )}

                    {/* Team Management */}
                    {activeTab === 'Team' && (
                        <div className="p-5 space-y-5">
                            {/* Pending Requests */}
                            {requests.length > 0 && (
                                <div
                                    className="rounded-lg p-4 space-y-3"
                                    style={{
                                        background: 'hsl(38 96% 48% / 0.05)',
                                        border: '1px solid hsl(38 96% 48% / 0.20)',
                                    }}
                                >
                                    <p
                                        className="text-[13px] font-semibold"
                                        style={{ color: 'hsl(38 90% 58%)' }}
                                    >
                                        Pending Profile Change Requests
                                    </p>
                                    <div className="space-y-3">
                                        {requests.map((req) => (
                                            <div key={req.id} className="bg-card p-4 rounded-md border border-border flex items-start justify-between gap-4">
                                                <div>
                                                    <p className="text-[13px] font-semibold text-foreground">
                                                        {req.profiles?.first_name} {req.profiles?.last_name} ({req.profiles?.email})
                                                    </p>
                                                    <div className="text-[12px] text-muted-foreground mt-1">
                                                        Requested changes:
                                                        <ul className="list-disc list-inside mt-1 ml-1 space-y-0.5">
                                                            {Object.entries(req.changes).map(([key, value]) => (
                                                                <li key={key}>
                                                                    <span className="capitalize">{key.replace('_', ' ')}</span>: <span className="font-medium text-foreground">{String(value)}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                    <p className="text-[11px] text-muted-foreground font-mono mt-1.5">
                                                        Requested {new Date(req.created_at).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2 flex-shrink-0">
                                                    <button onClick={() => handleApprove(req.id)} className="inline-flex items-center h-7 px-3 rounded-md text-white text-[12px] font-semibold transition-colors" style={{ background: 'hsl(152 58% 38%)' }} onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'hsl(152 58% 34%)'} onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'hsl(152 58% 38%)'}>Approve</button>
                                                    <button onClick={() => handleReject(req.id)} className="inline-flex items-center h-7 px-3 rounded-md text-[12px] font-semibold transition-colors" style={{ color: 'hsl(4 76% 62%)', border: '1px solid hsl(4 82% 52% / 0.25)', background: 'transparent' }} onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'hsl(4 82% 52% / 0.08)'} onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}>Reject</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Team Members */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <p className="text-[14px] font-semibold text-foreground">Team Members</p>
                                        <p className="text-[12px] text-muted-foreground mt-0.5">Manage your team access and roles</p>
                                    </div>
                                    <button onClick={() => setShowInviteModal(true)} className="inline-flex items-center gap-2 h-8 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors">
                                        <Plus size={13} />
                                        Invite Member
                                    </button>
                                </div>

                                <div className="overflow-x-auto rounded-lg border border-border">
                                    <table className="w-full">
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border)', background: 'hsl(0 0% 100% / 0.02)' }}>
                                                {['Name', 'Email', 'Role', 'Joined', ''].map((h) => (
                                                    <th key={h} className={['px-4 py-3', h === '' ? 'text-right' : 'text-left'].join(' ')}>
                                                        <span className="zone-label">{h}</span>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/60">
                                            {users.map((user) => (
                                                <tr
                                                    key={user.id}
                                                    className="transition-colors"
                                                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'hsl(0 0% 100% / 0.025)'}
                                                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                                                >
                                                    <td className="px-4 py-3 text-[13px] text-foreground font-medium">{user.first_name || '—'} {user.last_name || ''}</td>
                                                    <td className="px-4 py-3 text-[13px] text-muted-foreground font-mono">{user.email}</td>
                                                    <td className="px-4 py-3">
                                                        <span
                                                            className="inline-flex items-center h-5 px-2 rounded text-[10px] font-mono font-semibold uppercase tracking-[0.04em]"
                                                            style={
                                                                user.role === 'admin'
                                                                    ? { color: 'hsl(196 84% 60%)', background: 'hsl(196 84% 42% / 0.10)', border: '1px solid hsl(196 84% 42% / 0.20)' }
                                                                    : user.role === 'hr'
                                                                        ? { color: 'hsl(260 54% 68%)', background: 'hsl(260 54% 52% / 0.10)', border: '1px solid hsl(260 54% 52% / 0.20)' }
                                                                        : { color: 'hsl(0 0% 44%)', background: 'hsl(0 0% 100% / 0.04)', border: '1px solid hsl(0 0% 100% / 0.08)' }
                                                            }
                                                        >
                                                            {user.role.toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-[12px] text-muted-foreground font-mono">{new Date(user.created_at).toLocaleDateString()}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button onClick={() => handleEditClick(user)} className="text-[12px] font-semibold text-primary hover:text-primary/80 transition-colors">Edit</button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {users.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-4 py-10 text-center text-[13px] text-muted-foreground">No team members found.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Edit User Modal */}
                            {editingUser && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                                    <div className="w-full max-w-lg bg-card rounded-lg border border-border p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                                        <div className="flex items-center justify-between mb-5">
                                            <p className="text-[14px] font-semibold text-foreground">Edit User</p>
                                            <button onClick={() => setEditingUser(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                                                <X size={16} />
                                            </button>
                                        </div>
                                        <form onSubmit={handleUpdateUser} className="space-y-4">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className={labelCls}>First Name</label>
                                                    <input type="text" value={editFormData.first_name} onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })} className={inputCls} />
                                                </div>
                                                <div>
                                                    <label className={labelCls}>Last Name</label>
                                                    <input type="text" value={editFormData.last_name} onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })} className={inputCls} />
                                                </div>
                                            </div>
                                            <div>
                                                <label className={labelCls}>Email</label>
                                                <input type="email" value={editFormData.email} onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })} className={inputCls} />
                                            </div>
                                            <div>
                                                <label className={labelCls}>Phone Number</label>
                                                <input type="tel" value={editFormData.phone_number} onChange={(e) => setEditFormData({ ...editFormData, phone_number: e.target.value })} className={inputCls} />
                                            </div>
                                            <div>
                                                <label className={labelCls}>Role</label>
                                                <select value={editFormData.role} onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value as 'admin' | 'hr' | 'staff' })} className={inputCls}>
                                                    <option value="staff">Staff</option>
                                                    <option value="hr">HR</option>
                                                    <option value="admin">Admin</option>
                                                </select>
                                            </div>
                                            <div className="pt-4 border-t border-border">
                                                <label className={labelCls}>New Password (Optional)</label>
                                                <input type="password" value={editFormData.password} onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })} placeholder="Enter new password to reset" className={inputCls} />
                                            </div>
                                            <div className="flex justify-end gap-2 pt-2">
                                                <button type="button" onClick={() => setEditingUser(null)} className="inline-flex items-center h-8 px-4 rounded-md border border-border text-[13px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">Cancel</button>
                                                <button type="submit" disabled={editLoading} className="inline-flex items-center h-8 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                                                    {editLoading ? 'Saving…' : 'Save Changes'}
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Invite Modal */}
                    {showInviteModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                            <div className="w-full max-w-md bg-card rounded-lg border border-border p-6 shadow-xl">
                                <div className="flex items-center justify-between mb-5">
                                    <p className="text-[14px] font-semibold text-foreground">Invite Team Member</p>
                                    <button onClick={() => setShowInviteModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                                        <X size={16} />
                                    </button>
                                </div>
                                <form onSubmit={handleInvite} className="space-y-4">
                                    <div>
                                        <label className={labelCls}>Email Address</label>
                                        <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@company.com" className={inputCls} />
                                    </div>
                                    <div className="flex justify-end gap-2 pt-2">
                                        <button type="button" onClick={() => setShowInviteModal(false)} className="inline-flex items-center h-8 px-4 rounded-md border border-border text-[13px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">Cancel</button>
                                        <button type="submit" disabled={inviteLoading} className="inline-flex items-center h-8 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                            {inviteLoading ? 'Sending…' : 'Send Invitation'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <ConfirmDialog
                isOpen={confirmState.isOpen}
                onClose={handleClose}
                onConfirm={handleConfirm}
                title={confirmState.title}
                description={confirmState.description}
                confirmText={confirmState.confirmText}
                cancelText={confirmState.cancelText}
                variant={confirmState.variant}
            />
        </div>
    );
}
