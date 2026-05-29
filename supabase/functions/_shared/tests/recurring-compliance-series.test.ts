import { assertEquals } from "@std/assert";
import {
  addMonthsDateOnly,
  buildComplianceSeries,
  currentDateOnly,
  findCompletionCycleNumber,
  resolveReentryAnchor,
  toDateOnly,
} from "../recurring-compliance-series.ts";

Deno.test("toDateOnly preserves date-only values", () => {
  assertEquals(toDateOnly("2026-03-12"), "2026-03-12");
});

Deno.test("toDateOnly normalizes ISO timestamps to UTC date", () => {
  assertEquals(toDateOnly("2026-03-12T23:15:00.000Z"), "2026-03-12");
});

Deno.test("currentDateOnly derives UTC date", () => {
  assertEquals(currentDateOnly(new Date("2026-05-28T15:30:00.000Z")), "2026-05-28");
});

Deno.test("resolveReentryAnchor keeps newer training evidence when available", () => {
  assertEquals(
    resolveReentryAnchor({
      existingAnchorDate: "2026-03-01",
      candidateAnchorDate: "2026-04-10",
      reactivatedAt: "2026-05-28",
      anchorSource: "training_record",
    }),
    {
      anchorDate: "2026-04-10",
      anchorSource: "training_record",
    },
  );
});

Deno.test("resolveReentryAnchor starts a fresh group-reentry series when no newer evidence exists", () => {
  assertEquals(
    resolveReentryAnchor({
      existingAnchorDate: "2026-03-01",
      candidateAnchorDate: "2026-02-20",
      reactivatedAt: "2026-05-28",
      anchorSource: "training_record",
    }),
    {
      anchorDate: "2026-05-28",
      anchorSource: "group_reentry",
    },
  );
});

Deno.test("resolveReentryAnchor preserves manual anchors", () => {
  assertEquals(
    resolveReentryAnchor({
      existingAnchorDate: "2026-03-01",
      candidateAnchorDate: "2026-05-28",
      reactivatedAt: "2026-05-28",
      anchorSource: "manual",
    }),
    {
      anchorDate: "2026-03-01",
      anchorSource: "manual",
    },
  );
});

Deno.test("buildComplianceSeries continues numbering after historical pre-reentry cycles", () => {
  const cycles = buildComplianceSeries({
    anchorDate: "2026-05-28",
    today: "2027-06-01",
    initialDueOffsetMonths: 12,
    recurrenceIntervalMonths: 12,
    existingCycles: [
      { cycleNumber: 1, cycleStartAt: "2025-03-01" },
      { cycleNumber: 2, cycleStartAt: "2026-03-01" },
    ],
  });

  assertEquals(cycles, [
    {
      cycleNumber: 3,
      cycleStartAt: "2026-05-28",
      dueAt: "2027-05-28",
    },
    {
      cycleNumber: 4,
      cycleStartAt: "2027-05-28",
      dueAt: "2028-05-28",
    },
  ]);
});

Deno.test("findCompletionCycleNumber maps completion into the current series", () => {
  const cycles = buildComplianceSeries({
    anchorDate: "2026-05-28",
    today: "2027-06-01",
    initialDueOffsetMonths: 12,
    recurrenceIntervalMonths: 12,
    existingCycles: [
      { cycleNumber: 1, cycleStartAt: "2025-03-01" },
      { cycleNumber: 2, cycleStartAt: "2026-03-01" },
    ],
  });

  assertEquals(findCompletionCycleNumber(cycles, "2027-05-29T16:00:00.000Z"), 4);
  assertEquals(findCompletionCycleNumber(cycles, "2026-05-01T16:00:00.000Z"), null);
});

Deno.test("addMonthsDateOnly preserves day across whole-month cadence", () => {
  assertEquals(addMonthsDateOnly("2026-05-28", 12), "2027-05-28");
});
