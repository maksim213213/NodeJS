import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { MIMEType } from 'node:util';
import { HttpError } from './http-error';

export const MAX_BODY_BYTES = 1024 * 1024;
export const BODY_TIMEOUT_MS = 10_000;

export function validateBodyHeaders(headers: IncomingHttpHeaders): void {
  const length = headers['content-length'];

  if (length !== undefined) {
    if (!/^\d+$/.test(length)) {
      throw new HttpError(400, 'Invalid Content-Length');
    }
    if (BigInt(length) > BigInt(MAX_BODY_BYTES)) {
      throw new HttpError(413, 'Request body must not exceed 1 MiB (1048576 bytes)');
    }
  }

  let mediaType: MIMEType;
  try {
    mediaType = new MIMEType(headers['content-type'] ?? '');
  } catch {
    throw new HttpError(415, 'Content-Type must be application/json with UTF-8 encoding');
  }

  const charset = mediaType.params.get('charset')?.toLowerCase();
  if (mediaType.essence !== 'application/json' || (charset && charset !== 'utf-8')) {
    throw new HttpError(415, 'Content-Type must be application/json with UTF-8 encoding');
  }

  const encoding = headers['content-encoding']?.trim().toLowerCase();
  if (encoding && encoding !== 'identity') {
    throw new HttpError(415, 'Content-Encoding is not supported');
  }
}

export function parseJsonBody(body: Buffer): unknown {
  if (body.length === 0) {
    throw new HttpError(400, 'Request body must not be empty');
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    throw new HttpError(400, 'Request body must contain valid UTF-8');
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, 'Request body must contain valid JSON');
  }
}

export function readJsonBody(
  request: IncomingMessage,
  timeoutMs: number = BODY_TIMEOUT_MS,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;

    const cleanup = (): void => {
      clearTimeout(timer);
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
      request.off('aborted', onAborted);
      chunks.length = 0;
    };

    const fail = (error: HttpError): void => {
      request.pause();
      cleanup();
      reject(error);
    };

    const onData = (chunk: Buffer): void => {
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_BODY_BYTES) {
        fail(new HttpError(413, 'Request body must not exceed 1 MiB (1048576 bytes)'));
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = (): void => {
      const body = Buffer.concat(chunks, receivedBytes);
      cleanup();
      try {
        resolve(parseJsonBody(body));
      } catch (error) {
        reject(error);
      }
    };

    const onError = (): void => fail(new HttpError(400, 'Could not read request body'));
    const onAborted = (): void => fail(new HttpError(400, 'Request body was interrupted'));
    const timer = setTimeout(() => fail(new HttpError(408, 'Request Timeout')), timeoutMs);

    request.on('data', onData);
    request.once('end', onEnd);
    request.once('error', onError);
    request.once('aborted', onAborted);
  });
}
