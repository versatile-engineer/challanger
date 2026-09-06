import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { parseTask } from "./nlp";

// Sanalarni barqaror qilish uchun vaqtni qotiramiz: 2026-09-05 (juma), 10:00.
const FIXED = new Date(2026, 8, 5, 10, 0, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("parseTask — teglar", () => {
  it("bir nechta tegni ajratadi va sarlavhadan olib tashlaydi", () => {
    const r = parseTask("hisobot #ish #shoshilinch1");
    expect(r.tags).toContain("ish");
    expect(r.tags).toContain("shoshilinch1");
    expect(r.title).toBe("hisobot");
  });
});

describe("parseTask — prioritet", () => {
  it("!3 -> 3", () => {
    expect(parseTask("vazifa !3").priority).toBe(3);
  });
  it('"muhim" -> 2', () => {
    expect(parseTask("muhim ish").priority).toBe(2);
  });
  it('"shoshilinch" -> 3', () => {
    expect(parseTask("shoshilinch ish").priority).toBe(3);
  });
  it("prioritetsiz -> 0", () => {
    expect(parseTask("oddiy ish").priority).toBe(0);
  });
});

describe("parseTask — nisbiy kunlar", () => {
  it('"ertaga" ertangi kunga o\'rnatadi', () => {
    const r = parseTask("ertaga hisobot");
    const d = new Date(r.due_date!);
    expect(d.getDate()).toBe(6);
    expect(r.title).toBe("hisobot");
  });
  it('"bugun" bugunga o\'rnatadi', () => {
    const r = parseTask("bugun hisobot");
    expect(new Date(r.due_date!).getDate()).toBe(5);
  });
  it('"indinga" +2 kun', () => {
    const r = parseTask("indinga hisobot");
    expect(new Date(r.due_date!).getDate()).toBe(7);
  });
});

describe("parseTask — vaqt", () => {
  it('"soat 15:00" vaqtni belgilaydi', () => {
    const r = parseTask("ertaga soat 15:00 hisobot");
    const d = new Date(r.due_date!);
    expect(d.getHours()).toBe(15);
    expect(d.getMinutes()).toBe(0);
  });
  it("muddatsiz -> null", () => {
    expect(parseTask("oddiy ish").due_date).toBeNull();
  });
});

describe("parseTask — kombinatsiya", () => {
  it("ertaga soat 15:00 hisobot !3 #ish", () => {
    const r = parseTask("ertaga soat 15:00 hisobot !3 #ish");
    expect(r.title).toBe("hisobot");
    expect(r.priority).toBe(3);
    expect(r.tags).toEqual(["ish"]);
    const d = new Date(r.due_date!);
    expect(d.getDate()).toBe(6);
    expect(d.getHours()).toBe(15);
  });

  it("bo'sh sarlavhada raw qaytadi", () => {
    const r = parseTask("#ish");
    expect(r.title).toBe("#ish");
  });
});
