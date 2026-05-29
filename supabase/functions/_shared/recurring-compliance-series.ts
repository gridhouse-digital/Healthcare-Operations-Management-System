export interface ExistingCycleWindow {
  cycleNumber: number;
  cycleStartAt: string;
}

export interface ComplianceCycle {
  cycleNumber: number;
  cycleStartAt: string;
  dueAt: string;
}

export function toDateOnly(value: string): string {
  const trimmed = value.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    return trimmed;
  }

  const date = new Date(trimmed);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function currentDateOnly(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

export function addMonthsDateOnly(dateOnly: string, months: number): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCMonth(date.getUTCMonth() + months);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function resolveReentryAnchor(params: {
  existingAnchorDate: string;
  candidateAnchorDate: string;
  reactivatedAt: string;
  anchorSource: string;
}): { anchorDate: string; anchorSource: string } {
  if (params.anchorSource === "manual") {
    return {
      anchorDate: toDateOnly(params.existingAnchorDate),
      anchorSource: "manual",
    };
  }

  const existingAnchorDate = toDateOnly(params.existingAnchorDate);
  const candidateAnchorDate = toDateOnly(params.candidateAnchorDate);
  if (candidateAnchorDate > existingAnchorDate) {
    return {
      anchorDate: candidateAnchorDate,
      anchorSource: "training_record",
    };
  }

  return {
    anchorDate: toDateOnly(params.reactivatedAt),
    anchorSource: "group_reentry",
  };
}

export function buildComplianceSeries(params: {
  anchorDate: string;
  today: string;
  initialDueOffsetMonths: number;
  recurrenceIntervalMonths: number;
  existingCycles: ExistingCycleWindow[];
}): ComplianceCycle[] {
  const anchorDate = toDateOnly(params.anchorDate);
  const historicalOffset = params.existingCycles
    .filter((cycle) => toDateOnly(cycle.cycleStartAt) < anchorDate)
    .reduce((max, cycle) => Math.max(max, cycle.cycleNumber), 0);

  const cycles: ComplianceCycle[] = [];
  let localCycleNumber = 1;
  let cycleStartAt = anchorDate;

  while (cycleStartAt <= params.today) {
    cycles.push({
      cycleNumber: historicalOffset + localCycleNumber,
      cycleStartAt,
      dueAt: addMonthsDateOnly(
        anchorDate,
        params.initialDueOffsetMonths +
          ((localCycleNumber - 1) * params.recurrenceIntervalMonths),
      ),
    });

    localCycleNumber += 1;
    cycleStartAt = addMonthsDateOnly(
      anchorDate,
      (localCycleNumber - 1) * params.recurrenceIntervalMonths,
    );
  }

  return cycles;
}

export function findCompletionCycleNumber(
  cycles: ComplianceCycle[],
  completedAt: string,
): number | null {
  const completedDate = toDateOnly(completedAt);
  let matched: number | null = null;

  for (const cycle of cycles) {
    if (cycle.cycleStartAt <= completedDate) {
      matched = cycle.cycleNumber;
    }
  }

  return matched;
}
