import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TrainingComplianceRecord, TrainingEmployee, ComplianceStatus } from '../types';

// Compliance status priority (intentional ordering):
// 1. overdue — any expired certification (expires_at < now) takes priority,
//    even if courses are completed, because expired certs need renewal.
// 2. compliant — all courses completed and none expired.
// 3. in_progress — at least one course started but not all complete.
// 4. not_started — fallback for records with no progress.
function computeComplianceStatus(records: TrainingComplianceRecord[]): ComplianceStatus {
  if (records.length === 0) return 'not_started';

  const hasOverdue = records.some(r => r.expires_at && new Date(r.expires_at) < new Date());
  if (hasOverdue) return 'overdue';

  const allCompleted = records.every(r => r.effective_status === 'completed');
  if (allCompleted) return 'compliant';

  const anyStarted = records.some(
    r => r.effective_status === 'in_progress' || r.effective_status === 'completed'
  );
  if (anyStarted) return 'in_progress';

  return 'not_started';
}

async function fetchTrainingCompliance(): Promise<TrainingEmployee[]> {
  // Fetch compliance records joined with people
  const { data: records, error } = await supabase
    .from('v_training_compliance')
    .select(`
      *,
      people!inner (
        id,
        first_name,
        last_name,
        email,
        job_title
      )
    `)
    .order('person_id');

  if (error) throw error;
  if (!records || records.length === 0) return [];

  // Group by person_id
  const grouped = new Map<string, {
    person: { id: string; first_name: string; last_name: string; email: string; job_title: string | null };
    records: TrainingComplianceRecord[];
  }>();

  for (const row of records) {
    const person = (row as any).people;
    const personId = person.id as string;

    if (!grouped.has(personId)) {
      grouped.set(personId, { person, records: [] });
    }
    grouped.get(personId)!.records.push(row as unknown as TrainingComplianceRecord);
  }

  // Build TrainingEmployee array
  return Array.from(grouped.values()).map(({ person, records }) => {
    const coursesAssigned = records.length;
    const coursesCompleted = records.filter(r => r.effective_status === 'completed').length;
    const completionPct = coursesAssigned > 0
      ? Math.round((coursesCompleted / coursesAssigned) * 100)
      : 0;
    const complianceStatus = computeComplianceStatus(records);

    const dates = records
      .flatMap(r => [r.effective_completed_at, r.last_synced_at, r.last_adjusted_at])
      .filter(Boolean)
      .sort()
      .reverse();

    return {
      person_id: person.id,
      first_name: person.first_name,
      last_name: person.last_name,
      email: person.email,
      job_title: person.job_title,
      records,
      coursesAssigned,
      coursesCompleted,
      completionPct,
      complianceStatus,
      lastActivity: dates[0] ?? null,
    };
  });
}

export function useTrainingCompliance() {
  return useQuery({
    queryKey: ['training-compliance'],
    queryFn: fetchTrainingCompliance,
    staleTime: 60_000,
  });
}
