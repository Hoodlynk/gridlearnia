import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthenticatedRequest } from '../types';

interface ErrorBody {
  success: false;
  message: string;
  errors?: unknown; // validation details
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'string') {
        message = response;
      } else if (typeof response === 'object' && response !== null) {
        const body = response as Record<string, unknown>;
        if (Array.isArray(body.message)) {
          // class-validator errors from the global ValidationPipe
          message = 'Invalid input data';
          errors = body.message;
        } else {
          message = (body.message as string) ?? message;
        }
      }
    } else if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      exception.code === 'P2002'
    ) {
      status = HttpStatus.CONFLICT;
      message = 'A record with this value already exists';
    }

    // The response body stays minimal; the diagnostic detail lives here.
    // Correlate a client report with these lines via the x-request-id header.
    const { user, tenant } = request as Partial<AuthenticatedRequest>;
    const logContext = [
      `reqId=${request.id}`,
      `${request.method} ${request.url}`,
      `status=${status}`,
      user ? `user=${user.email}` : 'user=anonymous',
      tenant ? `tenant=${tenant.subdomain}` : null,
      `ip=${request.ip}`,
      errors !== undefined ? `errors=${JSON.stringify(errors)}` : null,
    ]
      .filter(Boolean)
      .join(' ');

    if (status >= 500) {
      this.logger.error(
        `${logContext} message="${message}"`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${logContext} message="${message}"`);
    }

    const body: ErrorBody = {
      success: false,
      message,
      ...(errors !== undefined ? { errors } : {}),
    };

    void reply.header('x-request-id', request.id).status(status).send(body);
  }
}
