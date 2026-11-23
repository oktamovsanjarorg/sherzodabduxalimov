import { describe, expect, it } from "vitest";
import { BACKUP_NAME_RE } from "./admin-types";

describe("BACKUP_NAME_RE", () => {
  it("backup.sh yozadigan nomlarni qabul qiladi", () => {
    expect(BACKUP_NAME_RE.test("db-20261115-220001.dump")).toBe(true);
    expect(BACKUP_NAME_RE.test("media-20261115-220001.tgz")).toBe(true);
  });
  it("boshqa fayl va yo'llarni rad etadi", () => {
    for (const n of [
      "../.env",
      "db-20261115-220001.dump/../../x",
      "backup.sh",
      "backup.log",
      ".env",
      "db-2026-11-15.dump",
      "media-20261115-220001.dump",
      "db-20261115-220001.dump.tmp",
    ]) {
      expect(BACKUP_NAME_RE.test(n)).toBe(false);
    }
  });
});
