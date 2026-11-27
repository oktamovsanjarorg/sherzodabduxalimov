import { describe, expect, it } from "vitest";
import { PERMISSIONS, effectivePermissions, hasPermission } from "./roles";

describe("xodim ruxsatlari", () => {
  it("ustozda doim hammasi, bazada nima yozilganidan qat'i nazar", () => {
    expect(effectivePermissions("TEACHER", [])).toEqual([...PERMISSIONS]);
  });
  it("yordamchida faqat berilgani, tartib bilan; noma'lum qiymat tashlab yuboriladi", () => {
    expect(effectivePermissions("ASSISTANT", ["PAYMENTS", "CONTENT", "NOPE"])).toEqual(["CONTENT", "PAYMENTS"]);
  });
  it("o'quvchi va ota-onada ruxsat bo'lmaydi, bazada qolib ketgan bo'lsa ham", () => {
    expect(effectivePermissions("STUDENT", ["PAYMENTS"])).toEqual([]);
    expect(hasPermission({ role: "PARENT", permissions: ["CONTENT"] }, "CONTENT")).toBe(false);
  });
});
