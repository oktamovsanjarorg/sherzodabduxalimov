import { BadRequestException } from "@nestjs/common";
import type { z } from "zod";

/** Zod bilan tekshiradi. Xato bo'lsa birinchi xabarni 400 sifatida qaytaradi. */
export function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body ?? {});
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new BadRequestException({ message: issue.message, field: issue.path.join(".") });
  }
  return r.data;
}
