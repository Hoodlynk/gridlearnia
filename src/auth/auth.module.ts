import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  // Global so JwtAuthGuard (registered in AppModule) can inject JwtService.
  // Secrets are passed per-call in AuthService/JwtAuthGuard since access and
  // refresh tokens use different secrets.
  imports: [JwtModule.register({ global: true })],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
