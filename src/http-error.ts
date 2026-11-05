export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
