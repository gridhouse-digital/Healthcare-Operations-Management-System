import { format } from 'date-fns';
import { CheckCircle, Clock, Calendar, FileText, UserCheck } from 'lucide-react';

interface TimelineEvent {
    date: Date;
    title: string;
    description: string;
    status: 'completed' | 'pending' | 'upcoming';
    icon?: React.ReactNode;
}

interface ApplicantTimelineProps {
    applicant: any;
}

export function ApplicantTimeline({ applicant }: ApplicantTimelineProps) {
    // Build timeline events from applicant data
    const buildTimeline = (): TimelineEvent[] => {
        const events: TimelineEvent[] = [];

        // Application submitted
        if (applicant?.created_at) {
            events.push({
                date: new Date(applicant.created_at),
                title: 'Application Submitted',
                description: `${applicant.answers?.fullName?.first || 'Applicant'} submitted their application`,
                status: 'completed',
                icon: <FileText className="w-4 h-4" />
            });
        }

        // Documents completed
        const requiredForms = ['emergency_contact', 'i9_eligibility', 'vaccination', 'licenses', 'background_check'];
        const completedForms = requiredForms.filter(form => applicant?.[form]?.id);

        if (completedForms.length === requiredForms.length && applicant.emergency_contact?.created_at) {
            // Find the latest document submission date
            const latestDocDate = requiredForms
                .filter(form => applicant?.[form]?.created_at)
                .map(form => new Date(applicant[form].created_at))
                .sort((a, b) => b.getTime() - a.getTime())[0];

            if (latestDocDate) {
                events.push({
                    date: latestDocDate,
                    title: 'All Documents Completed',
                    description: 'All required compliance documents submitted',
                    status: 'completed',
                    icon: <CheckCircle className="w-4 h-4" />
                });
            }
        }

        // Interview scheduled (if status is interviewing)
        if (applicant?.status === 'interviewing') {
            events.push({
                date: new Date(), // Use current date as placeholder
                title: 'Interview Scheduled',
                description: 'Candidate moved to interview stage',
                status: 'completed',
                icon: <UserCheck className="w-4 h-4" />
            });
        }

        // Pending events based on status
        if (applicant?.status === 'new' || applicant?.status === 'screening') {
            events.push({
                date: new Date(),
                title: 'Review Pending',
                description: 'Application under review by HR team',
                status: 'pending',
                icon: <Clock className="w-4 h-4" />
            });

            events.push({
                date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
                title: 'Interview',
                description: 'Schedule interview if qualified',
                status: 'upcoming',
                icon: <Calendar className="w-4 h-4" />
            });
        }

        return events.sort((a, b) => a.date.getTime() - b.date.getTime());
    };

    const timeline = buildTimeline();

    return (
        <div className="rounded-[20px] border border-border/70 bg-card p-6">
            <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold text-foreground">
                <Clock className="w-5 h-5 text-primary" />
                Application Timeline
            </h3>

            <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[15px] top-[10px] bottom-[10px] w-0.5 bg-gradient-to-b from-primary via-primary/40 to-border" />

                {/* Timeline events */}
                <div className="space-y-6">
                    {timeline.map((event, index) => (
                        <TimelineItem
                            key={index}
                            event={event}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

interface TimelineItemProps {
    event: TimelineEvent;
}

function TimelineItem({ event }: TimelineItemProps) {
    const getStatusStyles = (status: TimelineEvent['status']) => {
        switch (status) {
            case 'completed':
                return {
                    dot: 'bg-[var(--severity-low)] ring-[color-mix(in_srgb,var(--severity-low)_18%,transparent)]',
                    icon: 'text-white',
                    title: 'text-foreground',
                    date: 'text-[var(--severity-low)]',
                    description: 'text-muted-foreground'
                };
            case 'pending':
                return {
                    dot: 'bg-primary ring-primary/15 animate-pulse',
                    icon: 'text-white',
                    title: 'text-foreground font-semibold',
                    date: 'text-primary',
                    description: 'text-muted-foreground'
                };
            case 'upcoming':
                return {
                    dot: 'bg-muted ring-border',
                    icon: 'text-muted-foreground',
                    title: 'text-muted-foreground',
                    date: 'text-muted-foreground',
                    description: 'text-muted-foreground'
                };
        }
    };

    const styles = getStatusStyles(event.status);

    return (
        <div className="relative flex gap-4 group">
            {/* Status dot with icon */}
            <div className="relative flex-shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ring-4 ${styles.dot} transition-all group-hover:scale-110`}>
                    <span className={styles.icon}>
                        {event.icon || <CheckCircle className="w-4 h-4" />}
                    </span>
                </div>
            </div>

            {/* Event content */}
            <div className="flex-1 pb-6">
                <div className="flex items-start justify-between gap-4 mb-1">
                    <h4 className={`font-medium ${styles.title} transition-colors`}>
                        {event.title}
                    </h4>
                    <span className={`text-xs font-medium ${styles.date} whitespace-nowrap`}>
                        {event.status === 'upcoming' ? 'Expected' : format(event.date, 'MMM d, yyyy')}
                    </span>
                </div>
                <p className={`text-sm ${styles.description}`}>
                    {event.description}
                </p>
            </div>
        </div>
    );
}
