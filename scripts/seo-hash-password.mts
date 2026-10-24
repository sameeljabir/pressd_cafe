// Prints a password hash for SEO_ADMIN_USERS. The password is never echoed or stored.
// Usage: npm run seo:hash-password          (prompts)
//        printf '%s' "$PW" | npm run seo:hash-password   (non-interactive)
// Then add  email:role:<hash>  to SEO_ADMIN_USERS in Vercel.

import { stdin, stdout } from "node:process";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../lib/seo/core/password.ts";

async function readHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY) {
    let data = "";
    for await (const chunk of stdin) data += chunk;
    return data.replace(/\r?\n$/, "");
  }
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve) => {
    let pw = "";
    stdin.on("data", function onData(ch: string) {
      for (const c of ch) {
        if (c === "\r" || c === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          return resolve(pw);
        }
        if (c === "\u0003") process.exit(130); // Ctrl-C
        if (c === "\u007f") pw = pw.slice(0, -1);
        else pw += c;
      }
    });
  });
}

const pw = await readHidden(`Password (min ${MIN_PASSWORD_LENGTH} characters): `);
if (stdin.isTTY) {
  const again = await readHidden("Repeat password: ");
  if (again !== pw) {
    console.error("Passwords do not match.");
    process.exit(1);
  }
}
try {
  console.log(await hashPassword(pw));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
