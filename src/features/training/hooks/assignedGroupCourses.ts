import { supabase } from '@/lib/supabase';

export type AssignedGroupCourse = {
  person_id: string;
  tenant_id: string;
  group_id: string;
  course_id: string;
  course_name: string | null;
  anchor_date: string | null;
};

export async function fetchAssignedGroupCourses(personIds?: string[]): Promise<AssignedGroupCourse[]> {
  let enrollmentQuery = supabase
    .from('employee_group_enrollments')
    .select('person_id, tenant_id, group_id, anchor_date')
    .eq('active', true);

  if (personIds && personIds.length > 0) {
    enrollmentQuery = enrollmentQuery.in('person_id', personIds);
  }

  const { data: enrollments, error: enrollmentsError } = await enrollmentQuery;
  if (enrollmentsError) throw enrollmentsError;

  const activeEnrollments = (enrollments ?? []) as Array<{
    person_id: string;
    tenant_id: string;
    group_id: string;
    anchor_date: string | null;
  }>;

  if (activeEnrollments.length === 0) {
    return [];
  }

  const groupIds = Array.from(new Set(activeEnrollments.map((row) => row.group_id)));
  const tenantIds = Array.from(new Set(activeEnrollments.map((row) => row.tenant_id)));

  const { data: groupCourses, error: groupCoursesError } = await supabase
    .from('learndash_group_courses')
    .select('tenant_id, group_id, course_id, course_name')
    .in('tenant_id', tenantIds)
    .in('group_id', groupIds)
    .eq('active', true);

  if (groupCoursesError) throw groupCoursesError;

  const coursesByTenantGroup = new Map<string, Array<{
    tenant_id: string;
    group_id: string;
    course_id: string;
    course_name: string | null;
  }>>();

  for (const row of (groupCourses ?? []) as Array<{
    tenant_id: string;
    group_id: string;
    course_id: string;
    course_name: string | null;
  }>) {
    const key = `${row.tenant_id}:${row.group_id}`;
    if (!coursesByTenantGroup.has(key)) {
      coursesByTenantGroup.set(key, []);
    }
    coursesByTenantGroup.get(key)!.push(row);
  }

  return activeEnrollments.flatMap((enrollment) => {
    const key = `${enrollment.tenant_id}:${enrollment.group_id}`;
    const groupRows = coursesByTenantGroup.get(key) ?? [];

    return groupRows.map((course) => ({
      person_id: enrollment.person_id,
      tenant_id: enrollment.tenant_id,
      group_id: enrollment.group_id,
      course_id: course.course_id,
      course_name: course.course_name,
      anchor_date: enrollment.anchor_date,
    }));
  });
}
