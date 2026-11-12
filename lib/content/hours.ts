// Visible opening-hours rows for the Visit card, derived from Business info
// (the same rows Google gets as structured data). Pure module.

export interface OpeningRow {
  days: string; // "Mo-Su", "Mo-Th,Sa"
  opens: string; // "07:00"
  closes: string; // "21:00" ("00:00" = midnight)
}

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const LABEL: Record<(typeof DAYS)[number], string> = { Mo: "MON", Tu: "TUE", We: "WED", Th: "THU", Fr: "FRI", Sa: "SAT", Su: "SUN" };

/** "07:00" → "7:00 AM", "21:00" → "9:00 PM", "00:00"/"24:00" → "12:00 AM". */
export function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hour = h % 24;
  const suffix = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function expand(spec: string): (typeof DAYS)[number][] {
  const out: (typeof DAYS)[number][] = [];
  for (const part of spec.split(",")) {
    const [a, b] = part.split("-") as [(typeof DAYS)[number], (typeof DAYS)[number] | undefined];
    const i = DAYS.indexOf(a);
    const j = b ? DAYS.indexOf(b) : i;
    if (i < 0 || j < 0) continue;
    for (let k = i; ; k = (k + 1) % 7) {
      out.push(DAYS[k]);
      if (k === j) break;
    }
  }
  return out;
}

/**
 * Monday–Friday get a row each; Saturday and Sunday share one row ("SAT & SUN")
 * when their hours match. Days without hours read "Closed".
 */
export function visibleHours(rows: readonly OpeningRow[]): { day: string; hours: string }[] {
  const byDay = new Map<string, string>();
  for (const r of rows) for (const d of expand(r.days)) byDay.set(d, `${to12h(r.opens)} – ${to12h(r.closes)}`);
  const hours = (d: (typeof DAYS)[number]) => byDay.get(d) ?? "Closed";
  const out = (["Mo", "Tu", "We", "Th", "Fr"] as const).map((d) => ({ day: LABEL[d], hours: hours(d) }));
  if (hours("Sa") === hours("Su")) out.push({ day: "SAT & SUN", hours: hours("Sa") });
  else out.push({ day: "SAT", hours: hours("Sa") }, { day: "SUN", hours: hours("Su") });
  return out;
}

/** Digits for tel: and wa.me links: "+971 55 68 38 426" → "971556838426". */
export const phoneDigits = (phone: string) => phone.replace(/[^\d]/g, "");

/** "https://www.instagram.com/pressd.cafe" → "@pressd.cafe" (empty when it is not a profile URL). */
export function socialHandle(url: string): string {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean)[0] ?? "";
    return seg ? `@${seg.replace(/^@/, "")}` : "";
  } catch {
    return "";
  }
}

/** wa.me link with an opening message, encoded as the site always did ("'" → %27). */
export function whatsappLink(phone: string, message: string): string {
  const text = encodeURIComponent(message).replace(/'/g, "%27");
  return `https://wa.me/${phoneDigits(phone)}${text ? `?text=${text}` : ""}`;
}
