import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TrainingComplianceRecord, TrainingEmployee, ComplianceStatus } from '../types';

function isMissingSchema(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = String((error as { message?: string } | null)?.message ?? '');
  return code === '42P01' ||
    code === 'PGRST205' ||
    /relation .* does not exist/i.test(message) ||
    /schema cache/i.test(message);
}

// Compliance status priority (intentional ordering):
// 1. no_courses — employee exists but has zero training records.
// 2. overdue — any expired certification (expires_at < now) takes priority,
//    even if courses are completed, because expired certs need renewal.
// 3. compliant — all courses completed and none expired.
// 4. in_progress — at least one course started but not all complete.
// 5. not_started — fallback for records with no progress.
function computeComplianceStatus(records: TrainingComplianceRecord[]): ComplianceStatus {
  if (records.length === 0) return 'no_courses';

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
  // Fetch ALL employees (type='employee') — this is the primary query
  const { data: employees, error: empErr } = await supabase
    .from('people')
    .select('id, first_name, last_name, email, job_title')
    .eq('type', 'employee')
    .order('last_name');

  if (empErr) throw empErr;
  if (!employees || employees.length === 0) return [];

  // Fetch all compliance records for these employees
  let recordsQuery = await supabase
    .from('v_onboarding_training_compliance')
    .select('*')
    .order('person_id');

  if (recordsQuery.error && isMissingSchema(recordsQuery.error)) {
    recordsQuery = await supabase
      .from('v_training_compliance')
      .select('*')
      .order('person_id');
  }

  const { data: records, error: recErr } = recordsQuery;

  if (recErr) throw recErr;

  // Index compliance records by person_id
  const recordsByPerson = new Map<string, TrainingComplianceRecord[]>();
  for (const row of (records ?? [])) {
    const rec = row as unknown as TrainingComplianceRecord;
    const pid = rec.person_id;
    if (!recordsByPerson.has(pid)) {
      recordsByPerson.set(pid, []);
    }
    recordsByPerson.get(pid)!.push(rec);
  }

  // Build TrainingEmployee array — every employee appears, even with 0 records
  return employees.map((person) => {
    const personRecords = recordsByPerson.get(person.id) ?? [];
    const coursesAssigned = personRecords.length;
    const coursesCompleted = personRecords.filter(r => r.effective_status === 'completed').length;
    const completionPct = coursesAssigned > 0
      ? Math.round((coursesCompleted / coursesAssigned) * 100)
      : 0;
    const complianceStatus = computeComplianceStatus(personRecords);

    const dates = personRecords
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
      records: personRecords,
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
