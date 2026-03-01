import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const storiesDir = join(process.cwd(), 'src', 'content', 'stories');
const files = readdirSync(storiesDir).filter((name) => name.endsWith('.md'));

const replacements = new Map([
  ['\u0393\u00c7\u00d6', '\u2019'],
  ['\u0393\u00c7\u00a3', '\u201c'],
  ['\u0393\u00c7\u00a5', '\u201d'],
  ['\u0393\u00c7\u00f6', '\u2014'],
  ['\u0393\u00c7\u00f4', '\u2013'],
  ['\u0393\u00c7\u00aa', '\u2026'],
]);

let changed = 0;

for (const file of files) {
  const filePath = join(storiesDir, file);
  const raw = readFileSync(filePath, 'utf8');
  let next = raw;

  for (const [source, target] of replacements.entries()) {
    next = next.split(source).join(target);
  }

  if (next !== raw) {
    writeFileSync(filePath, next, 'utf8');
    changed += 1;
  }
}

console.log(`files_scanned=${files.length}`);
console.log(`files_changed=${changed}`);
