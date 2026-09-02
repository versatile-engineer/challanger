// Sana bilan ishlash uchun kichik yordamchilar.

export function toLocalInput(iso: string | null): string {
  // ISO -> <input type="datetime-local"> formati (YYYY-MM-DDTHH:mm)
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function formatDue(iso: string | null): { text: string; tone: "overdue" | "today" | "soon" | "none" } {
  if (!iso) return { text: "", tone: "none" };
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000);

  const time = d.toLocaleTimeString("uz", { hour: "2-digit", minute: "2-digit" });
  const hasTime = !(d.getHours() === 0 && d.getMinutes() === 0);

  let text: string;
  if (days === 0) text = hasTime ? `Bugun ${time}` : "Bugun";
  else if (days === 1) text = "Ertaga";
  else if (days === -1) text = "Kecha";
  else if (days < 0) text = d.toLocaleDateString("uz", { day: "numeric", month: "short" });
  else text = d.toLocaleDateString("uz", { day: "numeric", month: "short" });

  let tone: "overdue" | "today" | "soon" | "none" = "none";
  if (days < 0) tone = "overdue";
  else if (days === 0) tone = "today";
  else if (days <= 3) tone = "soon";
  return { text, tone };
}
