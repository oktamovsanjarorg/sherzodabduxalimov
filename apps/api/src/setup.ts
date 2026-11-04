import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { MAX_RECEIPT_BYTES, UPLOAD_CHUNK_BYTES } from "@onatili/shared";

/** main.ts va testlar uchun umumiy sozlash */
export function configureApp(app: NestFastifyApplication) {
  app.setGlobalPrefix("api");
  // Video bo'laklari: xom baytlar (application/octet-stream)
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: UPLOAD_CHUNK_BYTES + 1024 }, (_req, body, done) =>
      done(null, body),
    );
  // To'lov cheki rasmi: xom baytlar. Haqiqiy turi serverda baytlardan tekshiriladi.
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(["image/jpeg", "image/png", "image/webp"], { parseAs: "buffer", bodyLimit: MAX_RECEIPT_BYTES }, (_req, body, done) => done(null, body));
}
