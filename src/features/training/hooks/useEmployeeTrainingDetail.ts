import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  EmployeeTrainingDetail,
  TrainingAdjustment,
  TrainingComplianceRecord,
  TrainingEvent,
} from '../types';

async function fetchEmployeeTrainingDetail(employeeId: string): Promise<EmployeeTrainingDetail> {
  const [employeeResult, coursesResult, adjustmentsResult, eventsResult] = await Promise.all([
    supabase
      .from('people')
      .select('id, first_name, last_name, email, job_title, employee_status')
      .eq('id', employeeId)
      .single(),
    supabase
      .from('v_training_compliance')
      .select('*')
      .eq('person_id', employeeId)
      .order('course_name'),
    supabase
      .from('training_adjustments')
      .select('id, course_id, field, value, reason, actor_id, created_at')
      .eq('person_id', employeeId)
      .order('created_at', { ascending: false }),
    supabase
      .from('training_events')
      .select('id, course_id, event_type, payload, created_at')
      .eq('person_id', employeeId)
      .order('created_at', { ascending: false }),
  ]);

  if (employeeResult.error) throw employeeResult.error;
  if (coursesResult.error) throw coursesResult.error;
  if (adjustmentsResult.error) throw adjustmentsResult.error;
  if (eventsResult.error) throw eventsResult.error;

  const courses = (coursesResult.data ?? []) as TrainingComplianceRecord[];
  const adjustments = (adjustmentsResult.data ?? []) as TrainingAdjustment[];
  const events = (eventsResult.data ?? []) as TrainingEvent[];

  const total = courses.length;
  const completed = courses.filter((course) => course.effective_status === 'completed').length;
  const inProgress = courses.filter((course) => course.effective_status === 'in_progress').length;
  const notStarted = courses.filter(
    (course) => !course.effective_status || course.effective_status === 'not_started',
  ).length;
  const overdue = courses.filter(
    (course) => course.expires_at && new Date(course.expires_at) < new Date(),
  ).length;
  const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const adjusted = courses.filter((course) => course.has_overrides).length;

  const totalHours = courses.reduce(
    (sum, course) => sum + (course.effective_training_hours ?? course.raw_training_hours ?? 0),
    0,
  );

  const lastSyncAt =
    courses.reduce<string | null>((latest, course) => {
      if (!course.last_synced_at) return latest;
      if (!latest) return course.last_synced_at;
      return new Date(course.last_synced_at) > new Date(latest)
        ? course.last_synced_at
        : latest;
    }, null) ?? null;

  return {
    employee: {
      id: employeeResult.data.id,
      first_name: employeeResult.data.first_name,
      last_name: employeeResult.data.last_name,
      email: employeeResult.data.email,
      job_title: employeeResult.data.job_title,
      employee_status: employeeResult.data.employee_status,
    },
    courses,
    adjustments,
    events,
    stats: {
      total,
      completed,
      inProgress,
      notStarted,
      overdue,
      completionPct,
      adjusted,
      totalHours,
      lastSyncAt,
    },
  };
}

export function useEmployeeTrainingDetail(employeeId?: string) {
  return useQuery({
    queryKey: ['employee-training-detail', employeeId],
    queryFn: () => fetchEmployeeTrainingDetail(employeeId as string),
    enabled: !!employeeId,
    staleTime: 60_000,
  });
}
