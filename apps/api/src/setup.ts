import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import rateLimit from "@fastify/rate-limit";
import { MAX_RECEIPT_BYTES, UPLOAD_CHUNK_BYTES } from "@onatili/shared";
import type { FastifyRequest } from "fastify";

/** main.ts va testlar uchun umumiy sozlash */
export async function configureApp(app: NestFastifyApplication, opts: { rateLimit?: boolean } = {}) {
  app.setGlobalPrefix("api");
  if (opts.rateLimit !== false) {
    // So'rovlar soni chegarasi: bitta IP'dan daqiqasiga 600 ta, kirish (auth) uchun 30 ta — kod/token tanlab
    // topishga urinishlarni to'xtatadi. Haqiqiy IP nginx'dan X-Real-IP orqali keladi.
    await app.register(rateLimit as never, {
      timeWindow: "1 minute",
      max: (req: FastifyRequest) => (req.url.startsWith("/api/auth/") ? 30 : 600),
      keyGenerator: (req: FastifyRequest) => String(req.headers["x-real-ip"] ?? req.ip),
      allowList: (req: FastifyRequest) => req.url === "/api/health",
      errorResponseBuilder: () => ({ statusCode: 429, message: "Juda ko'p so'rov. Bir daqiqadan keyin qayta urinib ko'ring." }),
    });
  }
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
