// Location: backend/utils/errors.ts
// Purpose: One standard way to report problems. Backend code throws an
// AppError with a message and a status number (for example 401 = not logged
// in, 404 = not found). The error handler turns it into a clean JSON reply.

export class AppError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Location: backend/utils/errors.ts
// End of file: errors.ts