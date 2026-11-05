# TypeScript HTTP Server

A Node.js HTTP server written in TypeScript. It has two endpoints:

- `GET /search` validates and returns a search query.
- `POST /users` validates a JSON object and returns the user data.

## 1. Start the server

Requirements: **Node.js 22 or newer** and **npm**.

Run these commands from the project directory:

```powershell
npm ci
npm start
```

The terminal should display:

```text
Server listening on http://127.0.0.1:3000
```

Keep this terminal open. Use a second terminal for the commands below.
Press **Ctrl+C** in the first terminal to stop the server.

The default address is `http://127.0.0.1:3000`. You can change it using the
`HOST` and `PORT` environment variables.

## 2. Try GET /search

Open [http://127.0.0.1:3000/search?q=node](http://127.0.0.1:3000/search?q=node)
in a browser, or run this PowerShell command to see the status and headers:

```powershell
curl.exe -i "http://127.0.0.1:3000/search?q=node"
```

The server responds with **200 OK**:

```json
{
  "q": "node"
}
```

The `q` parameter must contain at least one non-whitespace character.
A missing `q`, an empty value (`?q=`), or only spaces produces **400 Bad Request**.
A valid value is returned unchanged. If `q` is repeated, the first value is used.

## 3. Try POST /users

Send a JSON object with `Content-Type: application/json`. Both fields are required:

| Field | Accepted value |
| --- | --- |
| `name` | A non-empty string. Leading and trailing whitespace is removed. |
| `age` | An integer from `0` to `9007199254740991`. Strings such as `"25"` are rejected. |

The root value must be an object. Values such as `null`, arrays, strings, and
numbers are rejected. Additional fields are ignored.

Run in PowerShell:

```powershell
Invoke-RestMethod -Method Post `
  -Uri 'http://127.0.0.1:3000/users' `
  -ContentType 'application/json' `
  -Body '{"name":"Anna","age":25,"extra":"ignored"}' |
  ConvertTo-Json
```

The server responds with **201 Created** and only the allowed fields:

```json
{
  "name": "Anna",
  "age": 25
}
```

This exercise returns the validated user data without saving it to a database.

## 4. Response statuses

Responses use `Content-Type: application/json; charset=utf-8`.
Errors contain an `error` field, for example:

```json
{
  "error": "Not Found"
}
```

| Status | When it is returned |
| --- | --- |
| **200 OK** | `GET /search` receives a valid `q`. |
| **201 Created** | `POST /users` receives valid user data. |
| **400 Bad Request** | Missing or blank `q`; empty or malformed JSON; invalid UTF-8, root value, or user fields; malformed HTTP request. |
| **404 Not Found** | The path is neither `/search` nor `/users`. |
| **405 Method Not Allowed** | A known path receives an unsupported method. The response includes `Allow: GET` for `/search` or `Allow: POST` for `/users`. |
| **408 Request Timeout** | The request body is not fully received within 10 seconds. |
| **413 Payload Too Large** | The declared or received body size exceeds 1 MiB. |
| **415 Unsupported Media Type** | Content type is missing or is not `application/json`, or an unsupported charset or content encoding is declared. |
| **417 Expectation Failed** | The request contains an unsupported `Expect` header. |
| **431 Request Header Fields Too Large** | HTTP headers exceed the Node.js header-size limit. |
| **500 Internal Server Error** | An unexpected server error occurs. |

Paths must match exactly: `/search/` and `/users/` return `404`.
The server checks the path before the method, so an unknown path returns `404`
regardless of the method. HTTP `HEAD` responses contain headers without a body.

### Body size limit

The limit for `POST /users` is **1 MiB = 1,048,576 bytes**.
A body exactly at the limit is allowed.

- An oversized `Content-Length` produces `413` immediately, before body reading.
- The server also counts received bytes, including for chunked uploads without
  `Content-Length`. An oversized stream is stopped and the connection is closed.
- The limit counts UTF-8 bytes. The entire body must arrive within 10 seconds.

JSON must use UTF-8. An optional `charset=utf-8` parameter is accepted.
Compressed bodies, such as those using `Content-Encoding: gzip`, are rejected.

### Check error responses manually

Run these commands in PowerShell. The `-i` flag shows the HTTP status and headers.

```powershell
# 400: q is missing
curl.exe -i "http://127.0.0.1:3000/search"

# 404: unknown path
curl.exe -i "http://127.0.0.1:3000/hello"

# 405: /search only accepts GET
curl.exe -i -X POST "http://127.0.0.1:3000/search?q=node"

# 413: Content-Length exceeds the limit; no body is sent
curl.exe -i -X POST "http://127.0.0.1:3000/users" -H "Content-Type: application/json" -H "Content-Length: 1048577"
```

## 5. Run the tests

```powershell
npm test
```

There are **three tests**:

| Type | What it checks |
| --- | --- |
| Unit | `q=node` is accepted; missing, empty, and whitespace-only queries are rejected. |
| Unit | Extra user fields are ignored; a `null` body is rejected. |
| Integration | A real HTTP request creates a user with `201`; oversized `Content-Length` receives `413` without sending a body. |

The integration test starts its own server on an available port and closes it
when finished. You do not need to run `npm start` before running the tests.

## 6. Other commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile TypeScript into `dist/`. |
| `node dist/index.js` | Start the compiled server after building. |
| `npm run typecheck` | Check TypeScript without creating output files. |
| `npm run test:unit` | Build and run the two unit tests. |
| `npm run test:integration` | Build and run the integration test. |
