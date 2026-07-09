export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound = (code: string, message: string) => new HttpError(404, code, message);
export const forbidden = (code: string, message: string) => new HttpError(403, code, message);
export const badRequest = (code: string, message: string) => new HttpError(400, code, message);
export const tooManyRequests = (message: string) => new HttpError(429, 'rate_limited', message);
