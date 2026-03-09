import { useState } from 'react';
import { LayoutDashboard, Users, FileText, Briefcase, BookOpenCheck, Sparkles, PanelLeftClose, PanelLeftOpen, Plug, UserCog, Wrench } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';
import { useUserRole } from '@/hooks/useUserRole';
import { useSidebar } from './SidebarContext';

const navGroups = [
    {
        label: 'Overview',
        items: [
            { name: 'Dashboard', href: '/', icon: LayoutDashboard, adminOnly: false, isAI: false },
        ],
    },
    {
        label: 'Hiring',
        items: [
            { name: 'Applicants', href: '/applicants', icon: Users,     adminOnly: false, isAI: false },
            { name: 'Offers',     href: '/offers',     icon: FileText,  adminOnly: false, isAI: false },
        ],
    },
    {
        label: 'Workforce',
        items: [
            { name: 'Employees', href: '/employees', icon: Briefcase, adminOnly: false, isAI: false },
        ],
    },
    {
        label: 'Training',
        items: [
            { name: 'Compliance', href: '/training', icon: BookOpenCheck, adminOnly: false, isAI: false },
        ],
    },
    {
        label: 'AI & Admin',
        items: [
            { name: 'AI Dashboard',     href: '/admin/ai-dashboard',    icon: Sparkles, adminOnly: true,  isAI: true },
            { name: 'Connectors',        href: '/settings/connectors',   icon: Plug,      adminOnly: true,  isAI: false },
            { name: 'Users',             href: '/settings/users',        icon: UserCog,   adminOnly: true,  isAI: false },
            { name: 'System Settings',   href: '/settings/system',       icon: Wrench,    adminOnly: true,  isAI: false },
        ],
    },
];

export function Sidebar() {
    const location = useLocation();
    const { isAdmin } = useUserRole();
    const { expanded, pinned, togglePin, setHovered } = useSidebar();
    const [tooltipItem, setTooltipItem] = useState<string | null>(null);

    const currentPath = location.pathname;

    return (
        <aside
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { setHovered(false); setTooltipItem(null); }}
            className={cn(
                'fixed left-0 top-[56px] bottom-0 z-20 hidden lg:flex flex-col',
                'sidebar-transition',
                expanded ? 'w-[248px]' : 'w-[56px]',
            )}
            style={{
                background: 'var(--sidebar)',
                borderRight: '1px solid var(--sidebar-border)',
            }}
        >
            {/* ── Navigation ── */}
            <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2">
                {navGroups.map((group, gi) => {
                    const visibleItems = group.items.filter(item => !item.adminOnly || isAdmin);
                    if (visibleItems.length === 0) return null;

                    return (
                        <div key={group.label} className={gi > 0 ? 'mt-1' : ''}>
                            {/* Group separator line */}
                            {gi > 0 && (
                                <div
                                    className="mx-2 my-1"
                                    style={{ height: '1px', background: 'var(--sidebar-border)' }}
                                />
                            )}

                            {/* Group label — only in expanded mode */}
                            {expanded && (
                                <p
                                    className="px-2.5 pt-2 pb-1 select-none"
                                    style={{
                                        fontFamily: 'var(--font-sans)',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        letterSpacing: '-0.01em',
                                        color: 'var(--sidebar-foreground)',
                                        opacity: 0.68,
                                    }}
                                >
                                    {group.label}
                                </p>
                            )}

                            <ul className="space-y-[1px]">
                                {visibleItems.map((item) => {
                                    const isActive = item.href === '/'
                                        ? currentPath === '/'
                                        : currentPath === item.href || currentPath.startsWith(item.href + '/');

                                    return (
                                        <li
                                            key={item.name}
                                            className="relative"
                                            onMouseEnter={() => !expanded && setTooltipItem(item.name)}
                                            onMouseLeave={() => setTooltipItem(null)}
                                        >
                                            <Link
                                                to={item.href}
                                                className={cn(
                                                    'group relative flex items-center gap-2.5 rounded-md transition-all duration-100',
                                                    expanded ? 'px-3 py-[9px] w-full' : 'h-9 w-9 mx-auto justify-center',
                                                    isActive
                                                        ? 'text-sidebar-primary'
                                                        : 'text-[var(--sidebar-foreground)] hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/70'
                                                )}
                                                style={{
                                                    background: isActive ? 'color-mix(in srgb, var(--sidebar-primary) 14%, transparent)' : undefined,
                                                    border: isActive ? '1px solid color-mix(in srgb, var(--sidebar-primary) 20%, transparent)' : '1px solid transparent',
                                                }}
                                            >
                                                <item.icon
                                                    size={14}
                                                    strokeWidth={isActive ? 2 : 1.75}
                                                    className="flex-shrink-0 transition-colors"
                                                    style={{ color: isActive ? 'var(--sidebar-primary)' : 'currentColor' }}
                                                />

                                                {expanded && (
                                                    <span
                                                        className="text-[13px] leading-none whitespace-nowrap flex-1"
                                                        style={{ fontWeight: isActive ? 600 : 500 }}
                                                    >
                                                        {item.name}
                                                    </span>
                                                )}

                                                {expanded && item.isAI && (
                                                    <span className="ai-tag ml-auto">AI</span>
                                                )}
                                            </Link>

                                            {/* Collapsed tooltip */}
                                            {!expanded && tooltipItem === item.name && (
                                                <div
                                                    className="absolute top-1/2 -translate-y-1/2 left-[60px] flex items-center gap-2 px-2.5 py-1.5 rounded-md whitespace-nowrap z-50 pointer-events-none"
                                                    style={{
                                                        background: 'var(--card)',
                                                        border: '1px solid var(--border)',
                                                        color: 'var(--foreground)',
                                                        fontSize: '12px',
                                                        fontWeight: 500,
                                                        boxShadow: 'var(--shadow-lg)',
                                                    }}
                                                >
                                                    {item.name}
                                                    {item.isAI && <span className="ai-tag ml-1">AI</span>}
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}
            </nav>

            {/* ── System status ── */}
            <div
                className={cn('py-3', expanded ? 'px-4' : 'flex justify-center px-0')}
                style={{ borderTop: '1px solid var(--sidebar-border)' }}
            >
                <div className="flex items-center gap-2">
                    <div className="relative flex h-1.5 w-1.5 flex-shrink-0">
                        <span
                            className="animate-dot-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                            style={{ background: 'var(--severity-low)' }}
                        />
                        <span
                            className="relative inline-flex rounded-full h-1.5 w-1.5"
                            style={{ background: 'var(--severity-low)' }}
                        />
                    </div>
                    {expanded && (
                        <span
                            className="text-[11px] font-medium truncate"
                            style={{ fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em', color: 'var(--sidebar-foreground)', opacity: 0.85 }}
                        >
                            All systems operational
                        </span>
                    )}
                </div>
            </div>

            {/* ── Theme + pin ── */}
            <div
                className={cn(
                    'py-2',
                    expanded ? 'px-2 flex flex-col gap-1' : 'px-1.5 flex flex-col gap-1 items-center'
                )}
                style={{ borderTop: '1px solid var(--sidebar-border)' }}
            >
                {expanded && <ThemeToggle />}

                <button
                    onClick={togglePin}
                    title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                    className={cn(
                        'flex items-center justify-center gap-2 rounded-md transition-all duration-100',
                        'text-[var(--sidebar-foreground)] hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/70',
                        expanded ? 'w-full h-8 px-2.5' : 'w-9 h-8'
                    )}
                >
                    {pinned
                        ? <PanelLeftClose size={13} strokeWidth={2} />
                        : <PanelLeftOpen  size={13} strokeWidth={2} />
                    }
                    {expanded && (
                        <span
                            className="text-[11px] font-medium"
                            style={{ fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em' }}
                        >
                            {pinned ? 'Collapse' : 'Pin open'}
                        </span>
                    )}
                </button>
            </div>
        </aside>
    );
}

export { navGroups };
