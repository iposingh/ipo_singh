import { isIsoDate } from "@ipo-singh/core";

/** Asia/Kolkata does not observe daylight saving. Slot instants use the fixed UTC+5:30 offset. */
const istOffsetMs = (5 * 60 + 30) * 60 * 1000;

export function istMinutes(value: Date): number | null {
  if (Number.isNaN(value.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return hour * 60 + minute;
}

export function istSlotInstant(isoDate: string, minuteOfDay: number): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match || !isIsoDate(isoDate) || minuteOfDay < 0 || minuteOfDay >= 24 * 60) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - istOffsetMs);
}
