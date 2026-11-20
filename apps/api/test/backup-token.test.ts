import { describe, expect, it } from "vitest";
import { signBackupToken, verifyBackupToken } from "../src/backups/backup-token";

const SECRET = "test-secret-1234567890";
const NAME = "db-20261115-220001.dump";

describe("backup token", () => {
  it("o'z fayli uchun ishlaydi va userId qaytaradi", () => {
    expect(verifyBackupToken(SECRET, NAME, signBackupToken(SECRET, NAME, "user-1"))).toBe("user-1");
  });
  it("boshqa faylga, boshqa kalitga, buzilgan tokenga o'tmaydi", () => {
    const t = signBackupToken(SECRET, NAME, "user-1");
    expect(verifyBackupToken(SECRET, "media-20261115-220001.tgz", t)).toBeNull();
    expect(verifyBackupToken("another-secret-123456", NAME, t)).toBeNull();
    expect(verifyBackupToken(SECRET, NAME, t.slice(0, -2) + "xx")).toBeNull();
    expect(verifyBackupToken(SECRET, NAME, undefined)).toBeNull();
  });
  it("10 daqiqadan keyin eskiradi", () => {
    const now = Date.now();
    const t = signBackupToken(SECRET, NAME, "user-1", now);
    expect(verifyBackupToken(SECRET, NAME, t, now + 9 * 60_000)).toBe("user-1");
    expect(verifyBackupToken(SECRET, NAME, t, now + 11 * 60_000)).toBeNull();
  });
});
