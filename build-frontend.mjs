import { mkdir, copyFile } from 'node:fs/promises';

const files = [
  'index.html',
  'admin.html',
  'api-config.js',
  'manifest.webmanifest',
  'sw.js',
  'Ronykhan_Salaryapp_launcher_1.png',
  'Ronykhan_Salaryapp_launcher_2.png',
  'allahu-akbar.mp3'
];

await mkdir('public', { recursive: true });
for (const file of files) {
  await copyFile(file, `public/${file}`);
  console.log(`Published asset: ${file}`);
}
console.log('Frontend-only build complete. Backend/database files are not copied.');
