import { createApp } from './server';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('PORT must be an integer between 0 and 65535');
  process.exitCode = 1;
} else {
  const server = createApp();
  server.on('error', (error) => {
    console.error(`Server error: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    const address = server.address();
    if (address && typeof address !== 'string') {
      console.log(`Server listening on http://${host}:${address.port}`);
    }
  });
}
