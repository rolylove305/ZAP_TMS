export const HOS_RESET_MINUTES = 10 * 60;

const OFF_DUTY_STATUSES = new Set([
  "OFF",
  "OFFDUTY",
  "SB",
  "SLEEPER",
  "SLEEPERBERTH",
]);

export type HosAvailabilityState =
  | "ready_now"
  | "ready_at"
  | "not_resetting"
  | "manual_review";

export type HosAvailability = {
  state: HosAvailabilityState;
  earliestReadyAt: string | null;
  remainingOffDutyMinutes: number | null;
  dutyStatusDurationMinutes: number | null;
  source: "duty_status_duration" | "last_activity_at" | "unavailable";
  splitSleeperReviewRequired: boolean;
};

export function normalizeHosStatus(value: unknown) {
  return String(value || "").toUpperCase().replace(/[\s_-]+/g, "");
}

function finiteMinutes(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
}

function timestampMs(value: unknown): number | null {
  if (!value) return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function currentDutyStatusMinutes(
  dutyStatusDuration: unknown,
  lastActivityAt: unknown,
  nowMs = Date.now(),
) {
  const stored = finiteMinutes(dutyStatusDuration);
  if (stored !== null && stored > 0) {
    return { minutes: stored, source: "duty_status_duration" as const };
  }

  const startedAtMs = timestampMs(lastActivityAt);
  if (startedAtMs === null || startedAtMs > nowMs) {
    return { minutes: null, source: "unavailable" as const };
  }

  return {
    minutes: Math.max(0, Math.floor((nowMs - startedAtMs) / 60_000)),
    source: "last_activity_at" as const,
  };
}

export function calculateHosAvailability(input: {
  dutyStatus: unknown;
  dutyStatusDuration?: unknown;
  lastActivityAt?: unknown;
  nowMs?: number;
}): HosAvailability {
  const nowMs = input.nowMs ?? Date.now();
  const duty = normalizeHosStatus(input.dutyStatus);
  const offDuty = OFF_DUTY_STATUSES.has(duty);
  const duration = currentDutyStatusMinutes(
    input.dutyStatusDuration,
    input.lastActivityAt,
    nowMs,
  );

  if (!offDuty) {
    return {
      state: "not_resetting",
      earliestReadyAt: null,
      remainingOffDutyMinutes: null,
      dutyStatusDurationMinutes: duration.minutes,
      source: duration.source,
      splitSleeperReviewRequired: false,
    };
  }

  if (duration.minutes === null) {
    return {
      state: "manual_review",
      earliestReadyAt: null,
      remainingOffDutyMinutes: null,
      dutyStatusDurationMinutes: null,
      source: duration.source,
      splitSleeperReviewRequired: true,
    };
  }

  const remaining = Math.max(0, HOS_RESET_MINUTES - duration.minutes);
  if (remaining === 0) {
    return {
      state: "ready_now",
      earliestReadyAt: new Date(nowMs).toISOString(),
      remainingOffDutyMinutes: 0,
      dutyStatusDurationMinutes: duration.minutes,
      source: duration.source,
      splitSleeperReviewRequired: false,
    };
  }

  return {
    state: "ready_at",
    earliestReadyAt: new Date(nowMs + remaining * 60_000).toISOString(),
    remainingOffDutyMinutes: remaining,
    dutyStatusDurationMinutes: duration.minutes,
    source: duration.source,
    splitSleeperReviewRequired: false,
  };
}

export function availabilityDatabaseFields(availability: HosAvailability) {
  return {
    ready_status: availability.state,
    earliest_ready_at: availability.earliestReadyAt,
    remaining_off_duty_minutes: availability.remainingOffDutyMinutes,
    duty_status_duration: availability.dutyStatusDurationMinutes,
  };
}
