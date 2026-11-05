import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';
import { useUserRole } from '@/hooks/useUserRole';
import { useSidebar } from './SidebarContext';
import { navGroups, visibleNavItems } from './navigation';

export function Sidebar() {
    const location = useLocation();
    const { isAdmin, isPlatformAdmin } = useUserRole();
    const { expanded, pinned, togglePin, setHovered } = useSidebar();

    const currentPath = location.pathname;
    const peeking = expanded && !pinned;

    return (
        <aside
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={(event) => {
                if (!event.currentTarget.querySelector(':focus-visible')) setHovered(false);
            }}
            onFocus={() => setHovered(true)}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(false);
            }}
            className={cn(
                'fixed left-0 top-[56px] bottom-0 z-20 hidden lg:flex flex-col',
                'border-r border-sidebar-border bg-sidebar',
                expanded ? 'w-[248px]' : 'w-[56px]',
                peeking && 'shadow-2xl',
            )}
        >
            {/* ── Navigation ── */}
            <nav aria-label="Main" className="flex-1 overflow-y-auto overflow-x-hidden p-2">
                {navGroups.map((group, gi) => {
                    const visibleItems = visibleNavItems(group, { isAdmin, isPlatformAdmin });
                    if (visibleItems.length === 0) return null;

                    return (
                        <div key={group.label} className={gi > 0 ? 'mt-2' : ''}>
                            {expanded ? (
                                <p className="select-none px-3 pb-1 pt-2 text-xs text-muted-foreground">{group.label}</p>
                            ) : (
                                gi > 0 && <div aria-hidden="true" className="mx-2 mb-2 h-px bg-sidebar-border" />
                            )}

                            <ul className="space-y-0.5">
                                {visibleItems.map((item) => {
                                    const isActive = item.href === '/'
                                        ? currentPath === '/'
                                        : currentPath === item.href || currentPath.startsWith(item.href + '/');

                                    return (
                                        <li key={item.name}>
                                            <Link
                                                to={item.href}
                                                aria-label={expanded ? undefined : item.name}
                                                aria-current={isActive ? 'page' : undefined}
                                                className={cn(
                                                    'flex items-center gap-3 rounded-md transition-colors',
                                                    expanded ? 'min-h-9 w-full px-3' : 'mx-auto h-9 w-9 justify-center',
                                                    isActive
                                                        ? 'bg-sidebar-primary/14 text-sidebar-primary'
                                                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                                                )}
                                            >
                                                <item.icon size={16} strokeWidth={1.75} aria-hidden="true" className="flex-shrink-0" />

                                                {expanded && (
                                                    <span className="flex-1 whitespace-nowrap text-sm font-medium">{item.name}</span>
                                                )}

                                                {expanded && item.isAI && <span className="ai-tag ml-auto">AI</span>}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}
            </nav>

            {/* ── Theme + pin ── */}
            <div className={cn('flex flex-col gap-1 border-t border-sidebar-border py-2', expanded ? 'px-2' : 'items-center')}>
                {expanded && <ThemeToggle />}

                <button
                    type="button"
                    onClick={togglePin}
                    title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                    aria-label={pinned ? 'Collapse sidebar' : 'Pin sidebar open'}
                    aria-pressed={pinned}
                    className={cn(
                        'flex items-center justify-center gap-2 rounded-full text-sidebar-foreground transition-colors',
                        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        expanded ? 'min-h-8 w-full px-3' : 'h-9 w-9',
                    )}
                >
                    {pinned
                        ? <PanelLeftClose size={14} strokeWidth={1.75} aria-hidden="true" />
                        : <PanelLeftOpen size={14} strokeWidth={1.75} aria-hidden="true" />
                    }
                    {expanded && <span className="text-xs font-medium">{pinned ? 'Collapse' : 'Pin open'}</span>}
                </button>
            </div>
        </aside>
    );
}

