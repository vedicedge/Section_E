// Generates an ADMIN_PASSWORD_HASH value: npm run hash-password -- "your password"
import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

let password = process.argv[2];
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question('Admin password: ');
  rl.close();
}
if (!password || password.length < 10) {
  console.error('Use at least 10 characters.');
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
console.log(`ADMIN_PASSWORD_HASH=scrypt:16384:8:1:${salt.toString('base64')}:${hash.toString('base64')}`);
