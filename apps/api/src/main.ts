import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";
import { configureApp } from "./setup";

// BigInt (telegramId) JSON'ga aylantirilganda xato bermasligi uchun
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.forRoot(env), new FastifyAdapter());
  await configureApp(app);
  app.enableCors({ origin: env.CORS_ORIGINS.split(",").map((s) => s.trim()) });
  await app.listen(env.API_PORT, env.API_HOST);
  console.log(`API: http://${env.API_HOST}:${env.API_PORT}/api`);
}

bootstrap();
