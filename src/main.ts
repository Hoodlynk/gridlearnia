import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // trustProxy is required behind Heroku's router so req.ip is the client IP
    new FastifyAdapter({ trustProxy: true }),
  );

  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  await app.register(helmet);
  app.enableCors({
    origin: config.getOrThrow<string[]>('cors.allowedOrigins'),
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('GridLearnia API')
    .setDescription('Multi-tenant backend REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = config.getOrThrow<number>('port');
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 Server running on port ${port} (${config.get('env')})`);
  logger.log(`📚 Swagger docs at /docs`);
}

void bootstrap();
