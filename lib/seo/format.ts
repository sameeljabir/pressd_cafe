/** Server-side date formatting in Dubai time (the café's time zone). */
export function fmtDateServer(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" }) + " GST";
}
