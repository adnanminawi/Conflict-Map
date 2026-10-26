// Creates an admin account.

import 'dotenv/config';
import { createAdmin } from '../src/services/auth.service';
import { db } from '../src/config/db';

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];

  if (!username || !password) {
    console.log('error');
    return;
  }

  await createAdmin(username, password);
  console.log(`Admin "${username}" created`);
}

main()
  .catch((err) => console.error('Failed:', err.message))
  .finally(() => db.end()); // close the database so the script can exit