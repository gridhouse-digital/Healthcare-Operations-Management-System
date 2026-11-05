import { LayoutDashboard, Users, FileText, Briefcase, BookOpenCheck, Sparkles, Plug, UserCog, Wrench, Mail, ClipboardCheck, type LucideIcon } from 'lucide-react';

interface NavItem {
    name: string;
    href: string;
    icon: LucideIcon;
    adminOnly: boolean;
    isAI: boolean;
    platformAdminOnly?: boolean;
    /** Works inside one agency, so it stays out of the platform admin's menu */
    agencyOnly?: boolean;
    platformName?: string;
}

interface NavGroup {
    label: string;
    items: NavItem[];
}

export const navGroups: NavGroup[] = [
    {
        label: 'Overview',
        items: [
            { name: 'Dashboard', platformName: 'Agency Overview', href: '/', icon: LayoutDashboard, adminOnly: false, isAI: false },
        ],
    },
    {
        label: 'Hiring',
        items: [
            { name: 'Applicants', href: '/applicants', icon: Users,     adminOnly: false, isAI: false, agencyOnly: true },
            { name: 'Offers',     href: '/offers',     icon: FileText,  adminOnly: false, isAI: false, agencyOnly: true },
        ],
    },
    {
        label: 'Workforce',
        items: [
            { name: 'Employees', href: '/employees', icon: Briefcase, adminOnly: false, isAI: false, agencyOnly: true },
        ],
    },
    {
        label: 'Training',
        items: [
            { name: 'Compliance', href: '/training', icon: BookOpenCheck, adminOnly: false, isAI: false, agencyOnly: true },
        ],
    },
    {
        label: 'AI & Admin',
        items: [
            { name: 'AI Dashboard',     href: '/admin/ai-dashboard',    icon: Sparkles, adminOnly: true,  isAI: true },
            { name: 'Access Requests',  href: '/admin/access-requests', icon: Mail,      adminOnly: true,  platformAdminOnly: true, isAI: false },
            { name: 'Connectors',        href: '/settings/connectors',   icon: Plug,      adminOnly: true,  isAI: false, agencyOnly: true },
            { name: 'Training Rules',    href: '/settings/training-rules', icon: ClipboardCheck, adminOnly: true, isAI: false, agencyOnly: true },
            { name: 'Users',             href: '/settings/users',        icon: UserCog,   adminOnly: true,  isAI: false },
            { name: 'System Settings',   href: '/settings/system',       icon: Wrench,    adminOnly: true,  isAI: false },
        ],
    },
];

/* Shared with MobileNav so both menus show the same links */
export function visibleNavItems(group: NavGroup, role: { isAdmin: boolean; isPlatformAdmin: boolean }): NavItem[] {
    return group.items
        .filter((item) => {
            if (item.adminOnly && !role.isAdmin) return false;
            if (item.platformAdminOnly && !role.isPlatformAdmin) return false;
            if (item.agencyOnly && role.isPlatformAdmin) return false;
            return true;
        })
        .map((item) => (role.isPlatformAdmin && item.platformName ? { ...item, name: item.platformName } : item));
}
