import { cp, rm } from 'node:fs/promises';
import { build } from './build-netlify.mjs';

// Reuse the explicit asset allowlist: no admin HTML, API keys, server source,
// .env or environment files can become publicly downloadable assets.
await build();
await rm('dist-cloudflare', { recursive: true, force: true });
await cp('dist-netlify', 'dist-cloudflare', { recursive: true });
console.log('Prepared Cloudflare static assets. Dynamic routes run in the Worker.');
