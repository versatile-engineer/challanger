// Tabiiy tildan vazifa maydonlarini ajratib oluvchi mahalliy (offline) tahlilchi.
// Masalan: "ertaga soat 15:00 hisobot !3 #ish" ->
//   { title: "hisobot", due_date, priority: 3, tags: ["ish"] }

export interface ParsedTask {
  title: string;
  due_date: string | null;
  priority: number;
  tags: string[];
}

const WEEKDAYS: Record<string, number> = {
  yakshanba: 0, yak: 0,
  dushanba: 1, dush: 1,
  seshanba: 2, sesh: 2,
  chorshanba: 3, chor: 3,
  payshanba: 4, pay: 4,
  juma: 5,
  shanba: 6, shan: 6,
};

function atTime(base: Date, h: number, m: number): Date {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

/// Keyingi shu hafta kunini topadi (bugun bo'lsa — bugun).
function nextWeekday(target: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const diff = (target - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

export function parseTask(raw: string): ParsedTask {
  let text = ` ${raw} `;
  const tags: string[] = [];
  let priority = 0;
  let dueBase: Date | null = null;
  let time: { h: number; m: number } | null = null;

  // Teglar: #tag
  text = text.replace(/#([\p{L}\p{N}_-]+)/gu, (_m, t) => {
    tags.push(String(t).toLowerCase());
    return " ";
  });

  // Prioritet: !1 !2 !3  yoki  "muhim" / "shoshilinch"
  text = text.replace(/!\s*([1-3])/g, (_m, p) => {
    priority = Math.max(priority, Number(p));
    return " ";
  });
  if (/\b(shoshilinch|zudlik)\b/iu.test(text)) priority = Math.max(priority, 3);
  else if (/\bmuhim\b/iu.test(text)) priority = Math.max(priority, 2);

  // Vaqt: "15:00", "soat 3", "9:30da"
  const tm = text.match(/\b(?:soat\s*)?([01]?\d|2[0-3])(?::([0-5]\d))?\s*(da)?\b/iu);
  // Faqat "soat" yoki ":" yoki "da" bo'lsa vaqt deb qabul qilamiz (raqamlarni chalkashtirmaslik uchun)
  if (tm && (/soat/iu.test(tm[0]) || tm[2] !== undefined || tm[3] !== undefined)) {
    time = { h: Number(tm[1]), m: tm[2] ? Number(tm[2]) : 0 };
    text = text.replace(tm[0], " ");
  }

  // Nisbiy kunlar
  if (/\bbugun\b/iu.test(text)) {
    dueBase = new Date();
    text = text.replace(/\bbugun\b/iu, " ");
  } else if (/\bertaga\b/iu.test(text)) {
    dueBase = new Date();
    dueBase.setDate(dueBase.getDate() + 1);
    text = text.replace(/\bertaga\b/iu, " ");
  } else if (/\bindinga\b/iu.test(text)) {
    dueBase = new Date();
    dueBase.setDate(dueBase.getDate() + 2);
    text = text.replace(/\bindinga\b/iu, " ");
  } else {
    // Hafta kunlari
    for (const [word, dow] of Object.entries(WEEKDAYS)) {
      const re = new RegExp(`\\b${word}\\b`, "iu");
      if (re.test(text)) {
        dueBase = nextWeekday(dow);
        text = text.replace(re, " ");
        break;
      }
    }
  }

  // Muddatni yig'ish
  let due: Date | null = null;
  if (dueBase) {
    due = time ? atTime(dueBase, time.h, time.m) : atTime(dueBase, 23, 59);
  } else if (time) {
    // Faqat vaqt berilgan — bugunga
    due = atTime(new Date(), time.h, time.m);
  }

  const title = text.replace(/\s+/g, " ").trim();

  return {
    title: title || raw.trim(),
    due_date: due ? due.toISOString() : null,
    priority,
    tags,
  };
}
