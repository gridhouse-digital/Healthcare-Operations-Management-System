import { UserPlus, FileCheck, Users, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

const actions = [
    {
        name:        'New Applicant',
        description: 'Add manually or sync from JotForm',
        href:        '/applicants',
        icon:        UserPlus,
        intent:      'primary',
    },
    {
        name:        'Review Offers',
        description: 'Pending approvals and sent offers',
        href:        '/offers',
        icon:        FileCheck,
        intent:      'default',
    },
    {
        name:        'Employees',
        description: 'Active workforce and onboarding',
        href:        '/employees',
        icon:        Users,
        intent:      'default',
    },
];

export function QuickActions() {
    return (
        <section className="animate-reveal-up delay-200 bg-card rounded-lg border border-border overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
                <h3 className="text-[13px] font-semibold text-foreground">Quick Access</h3>
            </div>
            <div className="p-2">
                {actions.map((action, i) => {
                    const Icon = action.icon;
                    return (
                        <Link
                            key={action.name}
                            to={action.href}
                            className={cn(
                                'animate-reveal-right',
                                'group flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors duration-100',
                            )}
                            style={{ animationDelay: `${(i + 3) * 50}ms` }}
                            onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.background = 'var(--secondary)'}
                            onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'}
                        >
                            <div
                                className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
                                style={
                                    action.intent === 'primary'
                                        ? { background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }
                                        : { background: 'var(--secondary)', color: 'var(--muted-foreground)' }
                                }
                            >
                                <Icon size={14} strokeWidth={1.75} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold text-foreground leading-none">{action.name}</p>
                                <p className="text-[11px] text-muted-foreground/60 font-medium mt-0.5 truncate">{action.description}</p>
                            </div>
                            <ArrowRight
                                size={12}
                                strokeWidth={2}
                                style={{ color: 'var(--muted-foreground)', flexShrink: 0 }}
                                className="transition-colors group-hover:opacity-80"
                            />
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}
