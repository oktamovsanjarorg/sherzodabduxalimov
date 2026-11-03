import { describe, expect, it } from "vitest";
import { InitDataError, signInitData, validateInitData } from "./telegram-init-data";

const TOKEN = "123456:TEST_TOKEN";
const user = JSON.stringify({ id: 42, first_name: "Ali" });

function fresh(extra: Record<string, string> = {}) {
  return { auth_date: String(Math.floor(Date.now() / 1000)), user, ...extra };
}

describe("validateInitData", () => {
  it("to'g'ri imzoni qabul qiladi", () => {
    const res = validateInitData(signInitData(fresh({ start_param: "ref1" }), TOKEN), TOKEN);
    expect(res.user.id).toBe(42);
    expect(res.startParam).toBe("ref1");
  });

  it("boshqa token bilan imzolanganini rad etadi", () => {
    expect(() => validateInitData(signInitData(fresh(), "999:OTHER"), TOKEN)).toThrow(InitDataError);
  });

  it("o'zgartirilgan ma'lumotni rad etadi", () => {
    const tampered = signInitData(fresh(), TOKEN).replace("Ali", "Vali");
    expect(() => validateInitData(tampered, TOKEN)).toThrow(InitDataError);
  });

  it("eskirgan initData'ni rad etadi", () => {
    const old = signInitData({ auth_date: "1000", user }, TOKEN);
    expect(() => validateInitData(old, TOKEN, 60)).toThrow(/eskirgan/);
  });

  it("hash yo'q bo'lsa rad etadi", () => {
    expect(() => validateInitData("auth_date=1&user=x", TOKEN)).toThrow(/hash/);
  });
});
