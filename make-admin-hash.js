import bcrypt from 'bcryptjs';
const password = process.argv[2];
if (!password || password.length < 14) {
  console.error('Usage: node make-admin-hash.js "a-unique-password-at-least-14-chars"');
  process.exit(1);
}
console.log(await bcrypt.hash(password, 12));
