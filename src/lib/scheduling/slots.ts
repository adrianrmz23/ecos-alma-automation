export type SchedulingRules = {
  timezone: string;
  intervalMinutes: number;
  windowStart: string;
  windowEnd: string;
};

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function getLocalParts(date: Date, timeZone: string): LocalParts {
  const parts = Object.fromEntries(
    getFormatter(timeZone)
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const local = getLocalParts(date, timeZone);
  const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return localAsUtc - date.getTime();
}

function zonedLocalToUtc(parts: Omit<LocalParts, "second"> & { second?: number }, timeZone: string) {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0,
  );

  let offset = timeZoneOffsetMs(new Date(utcGuess), timeZone);
  let result = new Date(utcGuess - offset);
  const refinedOffset = timeZoneOffsetMs(result, timeZone);

  if (refinedOffset !== offset) {
    offset = refinedOffset;
    result = new Date(utcGuess - offset);
  }

  return result;
}

function parseTime(value: string) {
  const [hourRaw, minuteRaw] = value.slice(0, 5).split(":");
  return {
    hour: Math.max(0, Math.min(23, Number(hourRaw) || 0)),
    minute: Math.max(0, Math.min(59, Number(minuteRaw) || 0)),
  };
}

function minutesOfDay(hour: number, minute: number) {
  return hour * 60 + minute;
}

function localDateKey(parts: LocalParts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function addLocalDays(parts: LocalParts, days: number): LocalParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, parts.hour, parts.minute, parts.second));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
}

function startOfAllowedWindow(date: Date, rules: SchedulingRules) {
  const local = getLocalParts(date, rules.timezone);
  const start = parseTime(rules.windowStart);
  const end = parseTime(rules.windowEnd);
  const currentMinutes = minutesOfDay(local.hour, local.minute);
  const startMinutes = minutesOfDay(start.hour, start.minute);
  const endMinutes = minutesOfDay(end.hour, end.minute);

  if (startMinutes <= endMinutes) {
    if (currentMinutes < startMinutes) {
      return zonedLocalToUtc({ ...local, hour: start.hour, minute: start.minute, second: 0 }, rules.timezone);
    }

    if (currentMinutes > endMinutes || (currentMinutes === endMinutes && local.second > 0)) {
      const tomorrow = addLocalDays(local, 1);
      return zonedLocalToUtc({ ...tomorrow, hour: start.hour, minute: start.minute, second: 0 }, rules.timezone);
    }

    return date;
  }

  // Ventana nocturna, por ejemplo 20:00–02:00.
  const insideOvernight = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  if (insideOvernight) return date;

  return zonedLocalToUtc({ ...local, hour: start.hour, minute: start.minute, second: 0 }, rules.timezone);
}

function normalizeCandidate(date: Date, rules: SchedulingRules) {
  return startOfAllowedWindow(date, rules);
}

function ceilToNextFiveMinutes(date: Date) {
  const result = new Date(date);
  result.setSeconds(0, 0);
  const minute = result.getMinutes();
  const remainder = minute % 5;
  if (remainder !== 0) result.setMinutes(minute + (5 - remainder));
  return result;
}

export function calculateBulkSlots({
  count,
  rules,
  lastScheduledFor,
  now = new Date(),
}: {
  count: number;
  rules: SchedulingRules;
  lastScheduledFor?: string | Date | null;
  now?: Date;
}) {
  const safeCount = Math.max(0, Math.min(10, count));
  if (safeCount === 0) return [] as Date[];

  const intervalMs = Math.max(15, rules.intervalMinutes) * 60_000;
  let candidate: Date;

  if (lastScheduledFor) {
    const fromQueue = new Date(new Date(lastScheduledFor).getTime() + intervalMs);
    candidate = fromQueue.getTime() > now.getTime()
      ? fromQueue
      : ceilToNextFiveMinutes(new Date(now.getTime() + intervalMs));
  } else {
    candidate = ceilToNextFiveMinutes(new Date(now.getTime() + intervalMs));
  }

  candidate = normalizeCandidate(candidate, rules);

  const slots: Date[] = [];
  for (let index = 0; index < safeCount; index += 1) {
    if (index > 0) {
      candidate = new Date(slots[index - 1].getTime() + intervalMs);
      candidate = normalizeCandidate(candidate, rules);
    }

    slots.push(candidate);
  }

  return slots;
}

export function formatSlotForDisplay(date: Date, timeZone: string) {
  const dateFormatter = new Intl.DateTimeFormat("es-MX", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const timeFormatter = new Intl.DateTimeFormat("es-MX", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return {
    date: dateFormatter.format(date),
    time: timeFormatter.format(date),
    dateKey: localDateKey(getLocalParts(date, timeZone)),
  };
}

export function localDateTimeToUtc(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const numbers = [year, month, day, hour, minute].map(Number);
  if (numbers.some((number) => Number.isNaN(number))) return null;

  const result = zonedLocalToUtc(
    {
      year: numbers[0],
      month: numbers[1],
      day: numbers[2],
      hour: numbers[3],
      minute: numbers[4],
      second: 0,
    },
    timeZone,
  );

  return Number.isNaN(result.getTime()) ? null : result;
}

export function formatDateTimeLocalInput(date: Date, timeZone: string) {
  const local = getLocalParts(date, timeZone);
  return `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}T${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
}

export function isInsidePublishingWindow(date: Date, rules: SchedulingRules) {
  const local = getLocalParts(date, rules.timezone);
  const start = parseTime(rules.windowStart);
  const end = parseTime(rules.windowEnd);
  const currentMinutes = minutesOfDay(local.hour, local.minute);
  const startMinutes = minutesOfDay(start.hour, start.minute);
  const endMinutes = minutesOfDay(end.hour, end.minute);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}
