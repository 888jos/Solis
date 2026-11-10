// Prints the SOLIS_PASSWORD_HASH value for a password read from stdin (not argv, so it stays out of ps).
// Usage: node scripts/hash-password.mjs < file-with-the-password
import { pbkdf2Sync, randomBytes } from "node:crypto";

let pw = "";
for await (const chunk of process.stdin) pw += chunk;
pw = pw.replace(/\r?\n$/, "");
const iterations = 210000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(pw, salt, iterations, 32, "sha256");
process.stdout.write(`pbkdf2$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`);
