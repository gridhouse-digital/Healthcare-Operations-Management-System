import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Row from the requirement-driven v_onboarding_gate VIEW — one row per active
 * non-recurring course in an onboarding-flagged group the employee is actively
 * enrolled in, whether or not a training record exists (missing record =
 * effective_status 'not_started'). Read-only (revision §7).
 */
export interface OnboardingGateRow {
  course_id: string;
  course_name: string | null;
  effective_status: string;
  effective_completed_at: string | null;
  has_record: boolean;
}

function isMissingSchema(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = String((error as { message?: string } | null)?.message ?? '');
  return code === '42P01' ||
    code === 'PGRST205' ||
    /relation .* does not exist/i.test(message) ||
    /schema cache/i.test(message);
}

async function fetchOnboardingGate(personId: string): Promise<OnboardingGateRow[]> {
  const { data, error } = await supabase
    .from('v_onboarding_gate')
    .select('course_id, course_name, effective_status, effective_completed_at, has_record')
    .eq('person_id', personId)
    .order('course_name');

  if (error) {
    // Gate view not deployed yet — render nothing rather than break the page.
    if (isMissingSchema(error)) return [];
    throw error;
  }
  return (data ?? []) as OnboardingGateRow[];
}

export function useOnboardingGate(personId?: string) {
  return useQuery({
    queryKey: ['onboarding-gate', personId],
    queryFn: () => fetchOnboardingGate(personId as string),
    enabled: !!personId,
    staleTime: 60_000,
  });
}
