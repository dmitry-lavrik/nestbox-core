import type { FastifyError, FastifySchemaValidationError } from "fastify";

export class HttpError extends Error implements FastifyError {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string, public errors: FastifySchemaValidationError[]) {
    super(400, "BAD_REQUEST", message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string) {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string) {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, "NOT_FOUND", message);
  }
}

export class MethodNotAllowedError extends HttpError {
  constructor(message: string) {
    super(405, "METHOD_NOT_ALLOWED", message);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, "CONFLICT", message);
  }
}

export class UnprocessableEntityError extends HttpError {
  constructor(message: string, public errors: FastifySchemaValidationError[]) {
    super(422, "UNPROCESSABLE_ENTITY", message);
  }
}

export class TooManyRequestsError extends HttpError {
  constructor(message: string) {
    super(429, "TOO_MANY_REQUESTS", message);
  }
}

export class InternalServerError extends HttpError {
  constructor(message: string) {
    super(500, "INTERNAL_SERVER_ERROR", message);
  }
}
