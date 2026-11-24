import { describe, expect, it } from "vitest";
import { announceInput, renderAnnounce } from "./announce-types";

const base = { text: "Salom", audience: { roles: ["STUDENT"] } };

describe("renderAnnounce", () => {
  it("belgilashni HTML'ga aylantiradi va ismni qo'yadi", () => {
    expect(renderAnnounce("**Diqqat**, {ism}! __Ertaga__ ~~dars~~ `09:00`", { name: "Ali" })).toBe(
      "<b>Diqqat</b>, Ali! <i>Ertaga</i> <s>dars</s> <code>09:00</code>",
    );
  });
  it("foydalanuvchi HTML'ini escape qiladi (ism ichida ham)", () => {
    expect(renderAnnounce("<a href=x>y</a> {ISM}", { name: "<b>" })).toBe("&lt;a href=x&gt;y&lt;/a&gt; &lt;b&gt;");
  });
  it("yopilmagan belgini o'z holicha qoldiradi", () => {
    expect(renderAnnounce("2**3 va a__b")).toBe("2**3 va a__b");
  });
});

describe("announceInput", () => {
  it("auditoriyasiz xabarni rad etadi", () => {
    expect(announceInput.safeParse({ text: "x", audience: {} }).success).toBe(false);
  });
  it("rasm bilan uzun matnni rad etadi", () => {
    expect(announceInput.safeParse({ ...base, text: "a".repeat(1200), photoFileId: "F" }).success).toBe(false);
    expect(announceInput.safeParse({ ...base, text: "a".repeat(1200) }).success).toBe(true);
  });
  it("tugma: nom va havola birga, faqat https yoki app:", () => {
    expect(announceInput.safeParse({ ...base, buttonText: "Ochish" }).success).toBe(false);
    expect(announceInput.safeParse({ ...base, buttonText: "Ochish", buttonUrl: "http://x.uz" }).success).toBe(false);
    expect(announceInput.safeParse({ ...base, buttonText: "Ochish", buttonUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(announceInput.safeParse({ ...base, buttonText: "Ochish", buttonUrl: "https://t.me/x" }).success).toBe(true);
    expect(announceInput.safeParse({ ...base, buttonText: "Ilova", buttonUrl: "app:/tests" }).success).toBe(true);
  });
});
