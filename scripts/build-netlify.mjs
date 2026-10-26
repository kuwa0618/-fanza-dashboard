import { mkdir, rm, readFile, writeFile, copyFile } from 'node:fs/promises';

export const publicFiles = [
  'app.js', 'catalog.js', 'catalog-filters.js', 'analytics-context.js', 'styles.css', 'rankings.css',
  'contact.html', 'privacy.html', 'disclaimer.html', 'robots.txt', 'sitemap.xml',
  'ogp-v2-light.jpg', 'ogp-v2.png', 'ogp.png', 'ogp.png.png', 'IMG_7367.png',
];

export function siteOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) throw new Error('SITE_URL must be an HTTPS origin');
  return url.origin;
}

export async function build() {
  // Explicit origin prevents canonical links accidentally pointing to the old host.
  const origin = siteOrigin(process.env.SITE_URL || '');
  await rm('dist-netlify', { recursive: true, force: true });
  await mkdir('dist-netlify');
  for (const file of publicFiles) {
    if (/\.(html|txt|xml|js|css)$/.test(file)) {
      const text = await readFile(file, 'utf8');
      await writeFile(`dist-netlify/${file}`, text.replaceAll('https://fanza-dashboard-omega.vercel.app', origin));
    } else await copyFile(file, `dist-netlify/${file}`);
  }
  await writeFile('dist-netlify/_headers', '/*\n  X-Content-Type-Options: nosniff\n');
  console.log(`Prepared ${publicFiles.length} public assets. Server source and admin HTML are not public assets.`);
}

if (process.argv[1]?.endsWith('/build-netlify.mjs')) await build();

