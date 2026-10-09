/* Schedule parsing + next-run computation (shared by server and UI).
 *
 * Supported schedules:
 *   { type: "interval", minutes: 30 }                 every N minutes (>= 1)
 *   { type: "daily",    time: "08:30" }               every day at HH:MM
 *   { type: "weekly",   time: "09:00", days: [1,3] }  0=Sun … 6=Sat
 *   { type: "cron",     expr: "0 * / 2 * * *" }       5-field cron (min hour dom mon dow)
 * Times are interpreted in the server's timezone (TZ env var) unless
 * `tzOffsetMinutes` is given (minutes east of UTC, e.g. 120 for UTC+2).
 */

function parseField(field, min, max) {
  const out = new Set();
  for (const part of String(field).split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart ? parseInt(stepPart, 10) : 1;
    if (!Number.isFinite(step) || step < 1) throw new Error(`invalid step in "${field}"`);
    let lo, hi;
    if (rangePart === "*") {
      lo = min;
      hi = max;
    } else if (rangePart.includes("-")) {
      [lo, hi] = rangePart.split("-").map((n) => parseInt(n, 10));
    } else {
      lo = parseInt(rangePart, 10);
      hi = stepPart ? max : lo;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < min || hi > max || lo > hi) {
      throw new Error(`value out of range in "${field}" (${min}-${max})`);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expr) {
  const parts = String(expr || "").trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("cron must have 5 fields: minute hour day-of-month month day-of-week");
  const dowField = parts[4].replace(/\b7\b/g, "0");
  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dom: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dow: parseField(dowField, 0, 6),
    domAny: parts[2] === "*",
    dowAny: parts[4] === "*",
  };
}

function parseTime(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "").trim());
  if (!m) throw new Error('time must be "HH:MM"');
  const h = +m[1];
  const mi = +m[2];
  if (h > 23 || mi > 59) throw new Error('time must be "HH:MM" (24h)');
  return [h, mi];
}

/** Throws on invalid schedule, returns a normalised copy. */
export function validateSchedule(s) {
  if (!s || typeof s !== "object") throw new Error("schedule is required");
  const tz = Number.isFinite(Number(s.tzOffsetMinutes)) ? Math.max(-840, Math.min(840, Number(s.tzOffsetMinutes))) : undefined;
  const base = tz === undefined ? {} : { tzOffsetMinutes: tz };
  switch (s.type) {
    case "interval": {
      const minutes = Math.round(Number(s.minutes));
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 60 * 24 * 31) throw new Error("interval minutes must be 1 – 44640");
      return { type: "interval", minutes };
    }
    case "daily":
      parseTime(s.time);
      return { ...base, type: "daily", time: s.time };
    case "weekly": {
      parseTime(s.time);
      const days = [...new Set((s.days || []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
      if (!days.length) throw new Error("pick at least one weekday");
      return { ...base, type: "weekly", time: s.time, days };
    }
    case "cron":
      parseCron(s.expr);
      return { ...base, type: "cron", expr: String(s.expr).trim() };
    case "manual":
      return { type: "manual" };
    default:
      throw new Error(`unknown schedule type "${s.type}"`);
  }
}

/** Wall-clock fields for a timestamp in the schedule's timezone. */
function fields(ts, tz) {
  if (tz === undefined) {
    const d = new Date(ts);
    return { min: d.getMinutes(), hour: d.getHours(), dom: d.getDate(), month: d.getMonth() + 1, dow: d.getDay() };
  }
  const d = new Date(ts + tz * 60_000);
  return { min: d.getUTCMinutes(), hour: d.getUTCHours(), dom: d.getUTCDate(), month: d.getUTCMonth() + 1, dow: d.getUTCDay() };
}

function cronMatches(c, f) {
  if (!c.minute.has(f.min) || !c.hour.has(f.hour) || !c.month.has(f.month)) return false;
  const domOk = c.dom.has(f.dom);
  const dowOk = c.dow.has(f.dow);
  if (c.domAny && c.dowAny) return true;
  if (c.domAny) return dowOk;
  if (c.dowAny) return domOk;
  return domOk || dowOk; // classic cron semantics
}

/** Next run strictly after `after` (ms). Returns null for manual schedules. */
export function nextRun(schedule, after = Date.now()) {
  const s = validateSchedule(schedule);
  if (s.type === "manual") return null;
  if (s.type === "interval") return after + s.minutes * 60_000;
  let cron;
  if (s.type === "cron") cron = parseCron(s.expr);
  else {
    const [h, m] = parseTime(s.time);
    cron = parseCron(`${m} ${h} * * ${s.type === "weekly" ? s.days.join(",") : "*"}`);
  }
  let t = Math.floor(after / 60_000) * 60_000 + 60_000; // next whole minute
  const limit = after + 366 * 24 * 60 * 60_000;
  while (t <= limit) {
    if (cronMatches(cron, fields(t, s.tzOffsetMinutes))) return t;
    t += 60_000;
  }
  return null;
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function describeSchedule(s) {
  try {
    s = validateSchedule(s);
  } catch (e) {
    return `invalid (${e.message})`;
  }
  if (s.type === "manual") return "Manual only";
  if (s.type === "interval") {
    if (s.minutes % 1440 === 0) return `Every ${s.minutes / 1440 === 1 ? "day" : s.minutes / 1440 + " days"}`;
    if (s.minutes % 60 === 0) return `Every ${s.minutes / 60 === 1 ? "hour" : s.minutes / 60 + " hours"}`;
    return `Every ${s.minutes === 1 ? "minute" : s.minutes + " minutes"}`;
  }
  if (s.type === "daily") return `Daily at ${s.time}`;
  if (s.type === "weekly") return `${s.days.map((d) => DAY[d]).join(", ")} at ${s.time}`;
  return `Cron: ${s.expr}`;
}
