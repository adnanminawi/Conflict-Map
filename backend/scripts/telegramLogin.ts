// Logs in to Telegram once and prints a "session" string for .env (TELEGRAM_SESSION).
// The backend then uses that session to read the alerts channel, without asking for a code again.
//
// Usage:  npm run telegram:login
// Before: put TELEGRAM_API_ID and TELEGRAM_API_HASH (from my.telegram.org) in .env
//
// Use a separate Telegram account for this, not your personal one.
import 'dotenv/config';
import readline from 'readline/promises';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

async function main() {
    const apiId = Number(process.env.TELEGRAM_API_ID);
    const apiHash = process.env.TELEGRAM_API_HASH;
    if (!apiId || !apiHash) {
        console.log('Put TELEGRAM_API_ID and TELEGRAM_API_HASH in .env first (from my.telegram.org).');
        return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const session = new StringSession(''); // empty = new login
    const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 3, useWSS: true });


    await client.start({
        phoneNumber: () => rl.question('Phone number with country code (e.g. +44...): '),
        phoneCode: () => rl.question('Code Telegram sent you: '),
        password: () => rl.question('Two-step verification password (Enter if none): '),
        onError: (err) => console.error(err.message),
    });

    console.log('\nLogged in. Add this line to backend/.env:\n');
    console.log(`TELEGRAM_SESSION=${session.save()}`);
    console.log('\nKeep it secret: anyone with this string can use the Telegram account. Never commit it.');

    await client.disconnect();
    rl.close();
}

main().catch((err) => console.error('Login failed:', err.message));