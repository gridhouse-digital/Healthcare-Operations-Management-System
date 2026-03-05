import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { SidebarProvider, useSidebar } from './SidebarContext';
import { useState } from 'react';
import { cn } from '@/lib/utils';

function LayoutInner() {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const { pinned } = useSidebar();

    return (
        <div className="min-h-screen bg-background">
            <Sidebar />
            <MobileNav isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

            {/* Content area — shifts only when sidebar is pinned open */}
            <div className={cn(
                "content-transition",
                pinned ? "lg:ml-[248px]" : "lg:ml-[56px]"
            )}>
                <Header onOpenMobileNav={() => setMobileNavOpen(true)} />

                <main className="pt-[56px] min-h-screen">
                    {/* Max-width container — prevents ultra-wide stretch */}
                    <div className="max-w-[1600px] mx-auto px-5 lg:px-7 py-6">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}

export function MainLayout() {
    return (
        <SidebarProvider>
            <LayoutInner />
        </SidebarProvider>
    );
}
