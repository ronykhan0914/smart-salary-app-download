import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('..');
const web = resolve('web');
const assets = [
  'index.html',
  'admin.html',
  'daily.html',
  'api-config.js',
  'manifest.webmanifest',
  'sw.js',
  'Ronykhan_Salaryapp_launcher_1.png',
  'Ronykhan_Salaryapp_launcher_2.png',
  'allahu-akbar.mp3'
];

await mkdir(web, { recursive: true });
for (const asset of assets) {
  await cp(resolve(root, asset), resolve(web, asset));
  console.log(`Bundled: ${asset}`);
}
console.log('Local Android web bundle is ready (no remote server URL is required for app shell).');
