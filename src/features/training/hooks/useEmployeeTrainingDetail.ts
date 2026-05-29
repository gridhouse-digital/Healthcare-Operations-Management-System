import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  EmployeeTrainingDetail,
  TrainingAdjustment,
  TrainingComplianceRecord,
  TrainingEvent,
} from '../types';
import { fetchAssignedGroupCourses } from './assignedGroupCourses';

function isMissingSchema(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = String((error as { message?: string } | null)?.message ?? '');
  return code === '42P01' ||
    code === 'PGRST205' ||
    /relation .* does not exist/i.test(message) ||
    /schema cache/i.test(message);
}

async function fetchEmployeeTrainingDetail(employeeId: string): Promise<EmployeeTrainingDetail> {
  const [employeeResult, activeCoursesResult, adjustmentsResult, eventsResult, allCoursesResult, recurringHistoryResult, assignedGroupCourses] = await Promise.all([
    supabase
      .from('people')
      .select('id, first_name, last_name, email, job_title, employee_status')
      .eq('id', employeeId)
      .single(),
    supabase
      .from('v_onboarding_training_compliance')
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
    supabase
      .from('v_training_compliance')
      .select('*')
      .eq('person_id', employeeId)
      .order('course_name'),
    supabase
      .from('v_recurring_compliance_audit')
      .select('instance_id, rule_name, group_id, cycle_number, due_at, completed_at, completion_source, compliance_status, visibility_state, status_override')
      .eq('person_id', employeeId)
      .neq('visibility_state', 'active')
      .order('due_at', { ascending: false }),
    fetchAssignedGroupCourses([employeeId]),
  ]);

  if (employeeResult.error) throw employeeResult.error;
  if (adjustmentsResult.error) throw adjustmentsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (allCoursesResult.error) throw allCoursesResult.error;
  let courses = (activeCoursesResult.data ?? []) as TrainingComplianceRecord[];
  const allCourses = (allCoursesResult.data ?? []) as TrainingComplianceRecord[];

  if (activeCoursesResult.error) {
    if (!isMissingSchema(activeCoursesResult.error)) {
      throw activeCoursesResult.error;
    }

    const legacyCoursesResult = await supabase
      .from('v_training_compliance')
      .select('*')
      .eq('person_id', employeeId)
      .order('course_name');

    if (legacyCoursesResult.error) throw legacyCoursesResult.error;
    courses = (legacyCoursesResult.data ?? []) as TrainingComplianceRecord[];
  }

  const adjustments = (adjustmentsResult.data ?? []) as TrainingAdjustment[];
  const events = (eventsResult.data ?? []) as TrainingEvent[];
  if (recurringHistoryResult.error && !isMissingSchema(recurringHistoryResult.error)) {
    throw recurringHistoryResult.error;
  }

  const activeCourseIdsByCourseId = new Set(courses.map((course) => course.course_id));
  const synthesizedCourses = assignedGroupCourses
    .filter((course) => !activeCourseIdsByCourseId.has(course.course_id))
    .map((course) => ({
      training_record_id: `assigned:${employeeId}:${course.course_id}`,
      tenant_id: course.tenant_id,
      person_id: course.person_id,
      course_id: course.course_id,
      course_name: course.course_name,
      effective_status: 'not_started',
      effective_completion_pct: 0,
      effective_completed_at: null,
      effective_training_hours: null,
      raw_status: null,
      raw_completion_pct: 0,
      raw_completed_at: null,
      raw_training_hours: null,
      expires_at: null,
      last_synced_at: null,
      last_adjusted_at: null,
      has_overrides: false,
      enrolled_at: course.anchor_date,
      derived_from_group: true,
    } satisfies TrainingComplianceRecord));

  if (synthesizedCourses.length > 0) {
    courses = [...courses, ...synthesizedCourses].sort((a, b) =>
      (a.course_name ?? '').localeCompare(b.course_name ?? '')
    );
  }

  const recurringHistory = recurringHistoryResult.error
    ? []
    : (recurringHistoryResult.data ?? []) as EmployeeTrainingDetail['recurringHistory'];
  const activeCourseIds = new Set(courses.map((course) => course.training_record_id));
  const historicalCourses = allCourses.filter(
    (course) => !activeCourseIds.has(course.training_record_id),
  );

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
    historicalCourses,
    recurringHistory,
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
