import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface TrainingStats {
  lastSyncAt: string | null;
  pendingAdjustments: number;
}

async function fetchTrainingStats(): Promise<TrainingStats> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [syncResult, adjustmentResult] = await Promise.all([
    supabase
      .from('integration_log')
      .select('completed_at')
      .eq('source', 'learndash')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1),
    supabase
      .from('training_adjustments')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo),
  ]);

  if (syncResult.error) throw syncResult.error;
  if (adjustmentResult.error) throw adjustmentResult.error;

  return {
    lastSyncAt: syncResult.data?.[0]?.completed_at ?? null,
    pendingAdjustments: adjustmentResult.count ?? 0,
  };
}

export function useTrainingStats() {
  return useQuery({
    queryKey: ['training-stats'],
    queryFn: fetchTrainingStats,
    staleTime: 60_000,
  });
}
