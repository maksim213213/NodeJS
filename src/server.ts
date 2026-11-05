import { createServer, STATUS_CODES, type IncomingMessage, type ServerResponse } from 'node:http';
import { BODY_TIMEOUT_MS, readJsonBody, validateBodyHeaders } from './body';
import { HttpError } from './http-error';
import { getSearchQuery, validateUser } from './validation';

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
  closeConnection = false,
): void {
  if (response.destroyed || response.writableEnded) return;

  const json = JSON.stringify(body);
  if (closeConnection) response.shouldKeepAlive = false;
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    ...headers,
    ...(closeConnection ? { Connection: 'close' } : {}),
  });
  response.end(json);
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  bodyTimeoutMs: number,
  expectContinue: boolean,
): Promise<void> {
  // An early response can be followed by a client disconnect before body reading starts.
  request.on('error', () => {});

  try {
    const target = request.url ?? '/';
    const queryStart = target.indexOf('?');
    const path = queryStart === -1 ? target : target.slice(0, queryStart);

    if (path !== '/search' && path !== '/users') {
      throw new HttpError(404, 'Not Found');
    }

    const allowedMethod = path === '/search' ? 'GET' : 'POST';
    if (request.method !== allowedMethod) {
      throw new HttpError(405, 'Method Not Allowed', { Allow: allowedMethod });
    }

    if (path === '/search') {
      const params = new URLSearchParams(queryStart === -1 ? '' : target.slice(queryStart + 1));
      sendJson(response, 200, { q: getSearchQuery(params) }, {}, !request.complete);
      return;
    }

    // These checks must run before adding a data listener or sending 100 Continue.
    validateBodyHeaders(request.headers);
    if (expectContinue) response.writeContinue();

    const user = validateUser(await readJsonBody(request, bodyTimeoutMs));
    sendJson(response, 201, user);
  } catch (error) {
    const httpError = error instanceof HttpError
      ? error
      : new HttpError(500, 'Internal Server Error');
    sendJson(response, httpError.statusCode, { error: httpError.message }, httpError.headers,
      !request.complete);
  }
}

export function createApp(options: { bodyTimeoutMs?: number } = {}) {
  const bodyTimeoutMs = options.bodyTimeoutMs ?? BODY_TIMEOUT_MS;
  const server = createServer({
    headersTimeout: 10_000,
    requestTimeout: 30_000,
    keepAliveTimeout: 5_000,
  }, (request, response) => {
    void handleRequest(request, response, bodyTimeoutMs, false);
  });

  server.on('checkContinue', (request, response) => {
    void handleRequest(request, response, bodyTimeoutMs, true);
  });

  server.on('checkExpectation', (request, response) => {
    request.on('error', () => {});
    sendJson(response, 417, { error: 'Expectation Failed' }, {}, true);
  });

  // Parser errors can happen before a request object exists or during a chunked body.
  server.on('clientError', (error: NodeJS.ErrnoException, socket) => {
    if (error.code === 'ECONNRESET' || !socket.writable || socket.writableEnded) {
      socket.destroy();
      return;
    }

    const statusCode = error.code === 'HPE_HEADER_OVERFLOW' ? 431
      : error.code === 'ERR_HTTP_REQUEST_TIMEOUT' ? 408 : 400;
    const message = STATUS_CODES[statusCode] ?? 'Bad Request';
    const json = JSON.stringify({ error: message });
    socket.end(`HTTP/1.1 ${statusCode} ${message}\r\n`
      + 'Content-Type: application/json; charset=utf-8\r\n'
      + `Content-Length: ${Buffer.byteLength(json)}\r\n`
      + `Connection: close\r\n\r\n${json}`);
  });

  return server;
}
