/** Operator-supplied observations and TideCharts predictions. PHT is UTC+8. */
export const SUPPLIED_TIDECHARTS_EXTREMA = [
  { time: '2026-11-27T02:09:00+08:00', kind: 'low', heightMeters: -0.07 },
  { time: '2026-11-27T07:17:00+08:00', kind: 'high', heightMeters: 0.51 },
  { time: '2026-11-27T12:46:00+08:00', kind: 'low', heightMeters: -0.17 },
  { time: '2026-11-27T19:52:00+08:00', kind: 'high', heightMeters: 1.39 },
  { time: '2026-11-28T02:51:00+08:00', kind: 'low', heightMeters: -0.01 },
  { time: '2026-11-28T07:54:00+08:00', kind: 'high', heightMeters: 0.5 },
  { time: '2026-11-28T13:26:00+08:00', kind: 'low', heightMeters: -0.15 },
  { time: '2026-11-28T20:36:00+08:00', kind: 'high', heightMeters: 1.32 },
  { time: '2026-11-29T03:34:00+08:00', kind: 'low', heightMeters: 0.05 },
  { time: '2026-11-29T08:37:00+08:00', kind: 'high', heightMeters: 0.51 },
  { time: '2026-11-29T14:13:00+08:00', kind: 'low', heightMeters: -0.08 },
  { time: '2026-11-29T21:23:00+08:00', kind: 'high', heightMeters: 1.21 },
  { time: '2026-11-30T04:20:00+08:00', kind: 'low', heightMeters: 0.11 },
  { time: '2026-11-30T09:29:00+08:00', kind: 'high', heightMeters: 0.53 },
  { time: '2026-11-30T15:08:00+08:00', kind: 'low', heightMeters: 0.01 },
  { time: '2026-11-30T22:15:00+08:00', kind: 'high', heightMeters: 1.08 },
  { time: '2026-12-01T05:10:00+08:00', kind: 'low', heightMeters: 0.15 },
  { time: '2026-12-01T10:37:00+08:00', kind: 'high', heightMeters: 0.57 },
  { time: '2026-12-01T16:17:00+08:00', kind: 'low', heightMeters: 0.13 },
  { time: '2026-12-01T23:15:00+08:00', kind: 'high', heightMeters: 0.93 },
  { time: '2026-12-02T06:05:00+08:00', kind: 'low', heightMeters: 0.18 },
  { time: '2026-12-02T12:03:00+08:00', kind: 'high', heightMeters: 0.63 },
  { time: '2026-12-02T17:51:00+08:00', kind: 'low', heightMeters: 0.22 },
  { time: '2026-12-03T00:26:00+08:00', kind: 'high', heightMeters: 0.8 },
  { time: '2026-12-03T07:03:00+08:00', kind: 'low', heightMeters: 0.18 },
  { time: '2026-12-03T13:32:00+08:00', kind: 'high', heightMeters: 0.74 },
  { time: '2026-12-03T19:44:00+08:00', kind: 'low', heightMeters: 0.25 },
] as const;

export const FIELD_OBSERVATIONS_NOV_27 = [
  {
    localTime: '2026-11-27 5:13 PM PHT',
    marineLevelMetersMsl: 1.312,
    coverageLowerBoundPercent: 35,
    note: 'Already unplayable; water almost covered half the field vertically.',
  },
  {
    localTime: '2026-11-27 5:26 PM PHT',
    marineLevelMetersMsl: 1.383,
    approximateCoveragePercent: 50,
    note: 'Approximately half the field covered.',
  },
  {
    localTime: '2026-11-27 5:50 PM PHT',
    marineLevelMetersMsl: 1.515,
    approximateCoveragePercent: 100,
    note: 'Entire field covered.',
  },
  {
    localTime: '2026-11-27 6:40 PM PHT',
    marineLevelMetersMsl: 1.663,
    waterDirection: 'rising',
    note: 'Water still rising; no coverage percentage supplied.',
  },
  {
    localTime: 'around 2026-11-27 7:20 PM PHT',
    marineLevelMetersMsl: 1.710,
    waterDirection: 'falling',
    timeIsApproximate: true,
    note: 'Water receding; no coverage percentage supplied.',
  },
] as const;

/** Source-specific MSL calibration. New coverage observations with paired marine
 * levels are included in the model automatically; direction-only reports remain
 * validation checks and never become fabricated coverage anchors. */
export const RISING_COVERAGE_ANCHORS = [
  { levelMeters: -0.22, coveragePercent: 0, assumption: 'Unobserved dry-at-low baseline.' },
  ...FIELD_OBSERVATIONS_NOV_27.flatMap((observation) => {
    const coveragePercent = 'approximateCoveragePercent' in observation
      ? observation.approximateCoveragePercent
      : 'coverageLowerBoundPercent' in observation
        ? observation.coverageLowerBoundPercent
        : null;
    return coveragePercent === null
      ? []
      : [{ levelMeters: observation.marineLevelMetersMsl, coveragePercent, assumption: observation.note }];
  }),
].sort((left, right) => left.levelMeters - right.levelMeters);

export const HISTORICAL_TIDECHARTS_LATE_NOTE = {
  time: '2026-11-27 11:55 PM PHT',
  direction: 'falling',
  nextLowInMinutes: 176,
  nextHighInMinutes: 479,
} as const;
