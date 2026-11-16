import { describe, expect, it } from "vitest";
import { studentUpdateInput } from "./students-types";

describe("studentUpdateInput.startedOn", () => {
  it("yuborilmasa undefined: boshqa maydon tahrirlanganda sana o'chmaydi", () => {
    expect(studentUpdateInput.parse({ firstName: "Ali" }).startedOn).toBeUndefined();
  });
  it("null: sanani olib tashlash; sana: o'rnatish", () => {
    expect(studentUpdateInput.parse({ startedOn: null }).startedOn).toBeNull();
    expect(studentUpdateInput.parse({ startedOn: "2026-11-05" }).startedOn).toBe("2026-11-05");
  });
  it("noto'g'ri sana rad etiladi", () => {
    expect(() => studentUpdateInput.parse({ startedOn: "05.11.2026" })).toThrow();
  });
});
