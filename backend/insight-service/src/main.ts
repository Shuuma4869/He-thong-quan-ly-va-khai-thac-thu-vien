import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173,http://tauri.localhost')
    .split(',').map(origin => origin.trim()).filter(Boolean), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(process.env.INSIGHT_PORT ?? 3000);
}

void bootstrap();
