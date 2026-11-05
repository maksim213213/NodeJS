import { HttpError } from './http-error';

export interface User {
  name: string;
  age: number;
}

export function getSearchQuery(params: URLSearchParams): string {
  const q = params.get('q');

  if (q === null || q.trim().length === 0) {
    throw new HttpError(400, 'Query parameter q must be a non-empty string');
  }

  return q;
}

export function validateUser(value: unknown): User {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }

  const { name, age } = value as Record<string, unknown>;

  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new HttpError(400, 'name must be a non-empty string');
  }

  if (typeof age !== 'number' || !Number.isSafeInteger(age) || age < 0) {
    throw new HttpError(400, 'age must be a non-negative safe integer');
  }

  // Explicitly copy allowed fields so extra properties never reach the response.
  return { name: name.trim(), age };
}
