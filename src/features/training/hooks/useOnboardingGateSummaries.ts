import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { OnboardingGateRow } from './useOnboardingGate';
import { summarizeGate, type GateSummary } from '../utils/compliancePresentation';

function isMissingSchema(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = String((error as { message?: string } | null)?.message ?? '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /relation .* does not exist/i.test(message) ||
    /schema cache/i.test(message)
  );
}

async function fetchGateRows(personIds: string[]): Promise<Map<string, OnboardingGateRow[]>> {
  const grouped = new Map<string, OnboardingGateRow[]>();
  if (personIds.length === 0) return grouped;

  const { data, error } = await supabase
    .from('v_onboarding_gate')
    .select('person_id, course_id, course_name, effective_status, effective_completed_at, has_record')
    .in('person_id', personIds)
    .order('course_name');

  if (error) {
    if (isMissingSchema(error)) return grouped;
    throw error;
  }

  for (const row of (data ?? []) as Array<OnboardingGateRow & { person_id: string }>) {
    const bucket = grouped.get(row.person_id) ?? [];
    bucket.push({
      course_id: row.course_id,
      course_name: row.course_name,
      effective_status: row.effective_status,
      effective_completed_at: row.effective_completed_at,
      has_record: row.has_record,
    });
    grouped.set(row.person_id, bucket);
  }

  return grouped;
}

export function useOnboardingGateSummaries(personIds: string[], viewUnavailable = false) {
  return useQuery({
    queryKey: ['onboarding-gate-summaries', personIds.join(',')],
    queryFn: async () => {
      const rowsByPerson = await fetchGateRows(personIds);
      const summaries = new Map<string, GateSummary>();

      for (const personId of personIds) {
        summaries.set(personId, summarizeGate(rowsByPerson.get(personId), viewUnavailable));
      }

      return summaries;
    },
    enabled: personIds.length > 0,
    staleTime: 60_000,
  });
}
