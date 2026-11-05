import { SlideOver } from '@/components/ui/SlideOver';
import { useLocation, Link } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { useEffect, useState } from 'react';
import { settingsService } from '@/services/settingsService';
import { ThemeToggle } from '@/components/theme-toggle';
import { navGroups, visibleNavItems } from './Sidebar';
import { cn } from '@/lib/utils';
import defaultLogoLight from '@/assets/logo-light.png';
import defaultLogoDark from '@/assets/logo-dark.png';

interface MobileNavProps {
    isOpen: boolean;
    onClose: () => void;
}

export function MobileNav({ isOpen, onClose }: MobileNavProps) {
    const location = useLocation();
    const { isAdmin, isPlatformAdmin } = useUserRole();
    const [logoLight, setLogoLight] = useState(defaultLogoDark);
    const [logoDark,  setLogoDark]  = useState(defaultLogoLight);

    useEffect(() => {
        settingsService.getSettings().then(settings => {
            if (settings['logo_light']) setLogoLight(settings['logo_light']);
            if (settings['logo_dark'])  setLogoDark(settings['logo_dark']);
        }).catch(() => {});
    }, []);

    const currentPath = location.pathname;

    return (
        <SlideOver isOpen={isOpen} onClose={onClose} title="Menu" side="left" width="md">
            <div
                className="h-full flex flex-col -m-6"
                style={{ background: 'var(--sidebar)' }}
            >
                {/* Brand */}
                <div
                    className="flex items-center px-5 h-[60px] flex-shrink-0"
                    style={{ borderBottom: '1px solid var(--sidebar-border)' }}
                >
                    <img src={logoLight} alt="HOMS" className="h-7 w-auto object-contain block dark:hidden" />
                    <img src={logoDark}  alt="HOMS" className="h-7 w-auto object-contain hidden dark:block" />
                </div>

                {/* Nav: the same list as the desktop sidebar */}
                <nav aria-label="Main" className="flex-1 overflow-y-auto p-2">
                    {navGroups.map((group) => {
                        const visibleItems = visibleNavItems(group, { isAdmin, isPlatformAdmin });
                        if (visibleItems.length === 0) return null;

                        return (
                            <div key={group.label} className="mt-2">
                                <p className="select-none px-3 pb-1 pt-2 text-xs text-muted-foreground">{group.label}</p>
                                <ul className="space-y-0.5">
                                    {visibleItems.map((item) => {
                                        const isActive = item.href === '/'
                                            ? currentPath === '/'
                                            : currentPath === item.href || currentPath.startsWith(item.href + '/');

                                        return (
                                            <li key={item.name}>
                                                <Link
                                                    to={item.href}
                                                    onClick={onClose}
                                                    aria-current={isActive ? 'page' : undefined}
                                                    className={cn(
                                                        'flex min-h-11 w-full items-center gap-3 rounded-md px-3 transition-colors',
                                                        isActive
                                                            ? 'bg-sidebar-primary/14 text-sidebar-primary'
                                                            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                                                    )}
                                                >
                                                    <item.icon size={16} strokeWidth={1.75} aria-hidden="true" className="flex-shrink-0" />
                                                    <span className="text-sm font-medium">{item.name}</span>
                                                    {item.isAI && <span className="ai-tag ml-auto">AI</span>}
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div
                    className="px-4 py-4"
                    style={{ borderTop: '1px solid var(--sidebar-border)' }}
                >
                    <ThemeToggle />
                </div>
            </div>
        </SlideOver>
    );
}
