import { SlideOver } from '@/components/ui/SlideOver';
import { useLocation, Link } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { useEffect, useState } from 'react';
import { settingsService } from '@/services/settingsService';
import { ThemeToggle } from '@/components/theme-toggle';
import { LayoutDashboard, Users, FileText, Briefcase, Plug, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import defaultLogoLight from '@/assets/logo-light.png';
import defaultLogoDark from '@/assets/logo-dark.png';

const navigation = [
    { name: 'Dashboard',    href: '/',                      icon: LayoutDashboard },
    { name: 'Applicants',   href: '/applicants',            icon: Users },
    { name: 'Offers',       href: '/offers',                icon: FileText },
    { name: 'Employees',    href: '/employees',             icon: Briefcase },
    { name: 'AI Dashboard', href: '/admin/ai-dashboard',    icon: Sparkles,  adminOnly: true },
    { name: 'Connectors',   href: '/settings/connectors',   icon: Plug,      adminOnly: true },
];

interface MobileNavProps {
    isOpen: boolean;
    onClose: () => void;
}

export function MobileNav({ isOpen, onClose }: MobileNavProps) {
    const location = useLocation();
    const { isAdmin } = useUserRole();
    const [logoLight, setLogoLight] = useState(defaultLogoDark);
    const [logoDark,  setLogoDark]  = useState(defaultLogoLight);

    useEffect(() => {
        settingsService.getSettings().then(settings => {
            if (settings['logo_light']) setLogoLight(settings['logo_light']);
            if (settings['logo_dark'])  setLogoDark(settings['logo_dark']);
        }).catch(() => {});
    }, []);

    const filteredNav = navigation.filter(item => !item.adminOnly || isAdmin);
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

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto py-4 px-2">
                    <p
                        className="px-3 mb-3 uppercase select-none"
                        style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.5625rem',
                            fontWeight: 500,
                            letterSpacing: '0.10em',
                            color: 'var(--sidebar-foreground)',
                            opacity: 0.35,
                        }}
                    >
                        Modules
                    </p>
                    <ul className="space-y-0.5">
                        {filteredNav.map((item, i) => {
                            const isActive = item.href === '/'
                                ? currentPath === '/'
                                : currentPath === item.href || currentPath.startsWith(item.href + '/');

                            return (
                                <li key={item.name}>
                                    <Link
                                        to={item.href}
                                        onClick={onClose}
                                        className={cn(
                                            'animate-reveal-right',
                                            `delay-${Math.min(i * 50, 300)}`,
                                            'group relative flex items-center gap-3 px-3 py-2.5 w-full rounded-md transition-all duration-100',
                                        )}
                                        style={{
                                            color: isActive ? 'hsl(196 84% 64%)' : 'hsl(0 0% 44%)',
                                            background: isActive ? 'hsl(196 84% 42% / 0.10)' : 'transparent',
                                        }}
                                    >
                                        {isActive && (
                                            <div
                                                className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-[18px] rounded-r-full"
                                                style={{ background: 'hsl(196 84% 52%)' }}
                                            />
                                        )}
                                        <item.icon
                                            size={15}
                                            strokeWidth={isActive ? 2 : 1.75}
                                            className="flex-shrink-0"
                                            style={{ color: isActive ? 'hsl(196 84% 55%)' : 'currentColor' }}
                                        />
                                        <span className={cn(
                                            "text-[13px] leading-none",
                                            isActive ? "font-semibold" : "font-medium"
                                        )}>
                                            {item.name}
                                        </span>
                                        {item.name === 'AI Dashboard' && (
                                            <span className="ml-auto ai-tag">AI</span>
                                        )}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
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
