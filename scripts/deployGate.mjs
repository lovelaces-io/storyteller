/**
 * The deploy gate for the site, the way Lore does it.
 *
 * Vercel's ignored build step in site/vercel.json decides whether a push
 * builds. Closed (`exit 0`) it never builds, so pushes and pull requests cost
 * no build minutes. Open, it builds production pushes only. Flipping the gate
 * is a one-line commit that CI ignores.
 *
 *   npm run gate:open     then commit and push main to deploy the site
 *   npm run gate:close    the next commit closes it again
 *   npm run gate          says which way it is
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const file = resolve(fileURLToPath(new URL("../site/vercel.json", import.meta.url)));
const CLOSED = "exit 0";
const OPEN = '[ "$VERCEL_ENV" = "production" ] && exit 1; exit 0';

const config = JSON.parse(readFileSync(file, "utf8"));
const current = config.ignoreCommand === OPEN ? "open" : config.ignoreCommand === CLOSED ? "closed" : "custom";
const wanted = process.argv[2];

if (!wanted) {
  console.log(`The site deploy gate is ${current}.`);
  process.exit(0);
}
if (wanted !== "open" && wanted !== "close") {
  console.error("Usage: node scripts/deployGate.mjs [open|close]");
  process.exit(2);
}
const next = wanted === "open" ? OPEN : CLOSED;
if (config.ignoreCommand === next) {
  console.log(`The site deploy gate is already ${wanted === "open" ? "open" : "closed"}.`);
  process.exit(0);
}
config.ignoreCommand = next;
writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
console.log(
  wanted === "open"
    ? "Gate open: commit site/vercel.json and push main, and Vercel builds that push. Close it afterwards."
    : "Gate closed: commit site/vercel.json and push; no push builds until it is opened again."
);
