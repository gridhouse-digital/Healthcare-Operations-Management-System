import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Search, ChevronDown, User, LogOut, Menu } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabase';
import { useSidebar } from './SidebarContext';
import { settingsService } from '@/services/settingsService';
import { cn } from '@/lib/utils';
import defaultLogoLight from '@/assets/logo-light.png';
import defaultLogoDark from '@/assets/logo-dark.png';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
    onOpenMobileNav: () => void;
}

export function Header({ onOpenMobileNav }: HeaderProps) {
    const navigate = useNavigate();
    const { expanded } = useSidebar();
    const [userMeta, setUserMeta] = useState<{ fullName: string; role: string }>({ fullName: '', role: '' });
    const [logoLight, setLogoLight] = useState(defaultLogoDark);
    const [logoDark,  setLogoDark]  = useState(defaultLogoLight);

    useEffect(() => { loadUser(); loadLogos(); }, []);

    const loadUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const fullName = user.user_metadata?.full_name || user.email || 'User';
            const role = user.app_metadata?.role || 'hr_admin';
            setUserMeta({ fullName, role });
        }
    };

    const loadLogos = () => {
        settingsService.getSettings().then(settings => {
            if (settings['logo_light']) setLogoLight(settings['logo_light']);
            if (settings['logo_dark'])  setLogoDark(settings['logo_dark']);
        }).catch(() => {});
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    // Sidebar panel width — matches Sidebar.tsx widths
    const sidebarW = expanded ? 248 : 56;

    return (
        <header
            className="h-[56px] fixed top-0 left-0 right-0 z-30 flex items-center"
            style={{ borderBottom: '1px solid var(--border)' }}
        >
            {/* ── Sidebar brand zone — same bg as sidebar, full sidebar width ── */}
            <div
                className={cn(
                    'hidden lg:flex items-center flex-shrink-0 h-full sidebar-transition overflow-hidden',
                    expanded ? 'gap-3 px-4' : 'justify-center px-0',
                )}
                style={{
                    width: sidebarW,
                    minWidth: sidebarW,
                    background: 'var(--sidebar)',
                    borderRight: '1px solid var(--sidebar-border)',
                }}
            >
                {/* Monogram icon — always visible */}
                <div
                    className="w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center"
                    style={{ background: 'hsl(196 84% 52% / 0.14)' }}
                >
                    <span
                        className="text-[11px] font-bold select-none"
                        style={{ fontFamily: 'var(--font-mono)', color: 'hsl(196 84% 60%)' }}
                    >
                        P
                    </span>
                </div>

                {/* Logo — only when expanded */}
                {expanded && (
                    <>
                        <img src={logoLight} alt="Prolific HR" className="h-5 w-auto object-contain block dark:hidden min-w-0 max-w-[130px]" />
                        <img src={logoDark}  alt="Prolific HR" className="h-5 w-auto object-contain hidden dark:block min-w-0 max-w-[130px]" />
                    </>
                )}
            </div>

            {/* ── Main header content ── */}
            <div
                className="flex-1 flex items-center justify-between h-full px-5 lg:px-6"
                style={{ background: 'var(--background)' }}
            >
                {/* Left: mobile menu + search */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onOpenMobileNav}
                        className="lg:hidden p-1.5 -ml-0.5 rounded-md transition-colors"
                        style={{ color: 'var(--muted-foreground)' }}
                        aria-label="Open navigation"
                    >
                        <Menu size={16} strokeWidth={2} />
                    </button>

                    {/* Search */}
                    <div className="hidden md:flex items-center relative">
                        <Search
                            size={12}
                            strokeWidth={2}
                            className="absolute left-2.5 pointer-events-none"
                            style={{ color: 'var(--muted-foreground)', opacity: 0.4 }}
                        />
                        <input
                            type="text"
                            placeholder="Search…"
                            className="h-7 pl-7 pr-10 rounded-md text-[12px] transition-all duration-200 focus:outline-none focus:w-[220px]"
                            style={{
                                width: '172px',
                                background: 'var(--secondary)',
                                border: '1px solid var(--border)',
                                color: 'var(--foreground)',
                                fontFamily: 'var(--font-sans)',
                            }}
                            onFocus={e => {
                                e.currentTarget.style.borderColor = 'var(--border-strong)';
                                e.currentTarget.style.width = '220px';
                            }}
                            onBlur={e => {
                                e.currentTarget.style.borderColor = 'var(--border)';
                                e.currentTarget.style.width = '172px';
                            }}
                        />
                        <kbd className="absolute right-2 hidden lg:block text-[10px]" style={{ color: 'var(--muted-foreground)', opacity: 0.35 }}>⌘K</kbd>
                    </div>
                </div>

                {/* Right: notifications + profile */}
                <div className="flex items-center gap-1">

                    {/* Notifications */}
                    <button
                        className="relative flex items-center justify-center w-8 h-8 rounded-md transition-colors"
                        style={{ color: 'var(--muted-foreground)' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--secondary)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                    >
                        <Bell size={14} strokeWidth={1.75} />
                        <span
                            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                            style={{ background: 'var(--severity-critical)', outline: '2px solid var(--background)' }}
                        />
                    </button>

                    {/* Divider */}
                    <div className="w-px h-4 mx-1 hidden md:block" style={{ background: 'var(--border)' }} />

                    {/* Profile */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-md transition-colors cursor-pointer"
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--secondary)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                            >
                                <div
                                    className="w-6 h-6 rounded-md flex-shrink-0 overflow-hidden"
                                    style={{ background: 'hsl(196 84% 36% / 0.3)' }}
                                >
                                    <Avatar className="h-full w-full rounded-md">
                                        <AvatarFallback
                                            className="text-[9px] font-bold bg-transparent rounded-md"
                                            style={{ fontFamily: 'var(--font-mono)', color: 'hsl(196 84% 62%)' }}
                                        >
                                            {userMeta.fullName
                                                .split(' ')
                                                .filter(Boolean)
                                                .slice(0, 2)
                                                .map(part => part[0]?.toUpperCase())
                                                .join('')}
                                        </AvatarFallback>
                                    </Avatar>
                                </div>
                                <div className="hidden lg:block text-left min-w-0">
                                    <p className="text-[12px] font-medium leading-none truncate max-w-[110px]" style={{ color: 'var(--foreground)' }}>
                                        {userMeta.fullName}
                                    </p>
                                    <p
                                        className="text-[10px] capitalize mt-0.5 leading-none"
                                        style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', color: 'var(--muted-foreground)' }}
                                    >
                                        {(userMeta.role || 'Staff').replace('_', ' ')}
                                    </p>
                                </div>
                                <ChevronDown size={10} strokeWidth={2.5} className="ml-0.5 flex-shrink-0" style={{ color: 'var(--muted-foreground)', opacity: 0.5 }} />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 mt-1">
                            <DropdownMenuLabel
                                className="text-[10px] font-medium uppercase"
                                style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', color: 'var(--muted-foreground)' }}
                            >
                                Account
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer text-[13px]">
                                <User className="mr-2 h-3.5 w-3.5" />
                                Profile
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={handleLogout}
                                className="cursor-pointer text-[13px] text-destructive focus:text-destructive"
                            >
                                <LogOut className="mr-2 h-3.5 w-3.5" />
                                Sign out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </header>
    );
}
