import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const storiesDir = join(process.cwd(), 'src', 'content', 'stories');
const files = readdirSync(storiesDir).filter((name) => name.endsWith('.md'));

const placeholderRe = /\\_\\_CFP\\_EMBED\\_(\d+)\\_\\_/g;
const embedBlockRe = /(<script[\s\S]*?<\/script>|<iframe[\s\S]*?<\/iframe>|<div[^>]*class=\"[^\"]*infogram-embed[^\"]*\"[^>]*>[\s\S]*?<\/div>)/gi;

let fixed = 0;

for (const file of files) {
  const filePath = join(storiesDir, file);
  const current = readFileSync(filePath, 'utf8');

  if (!placeholderRe.test(current)) {
    placeholderRe.lastIndex = 0;
    continue;
  }
  placeholderRe.lastIndex = 0;

  let original;
  try {
    original = execSync(`git show HEAD:src/content/stories/${file}`, { encoding: 'utf8' });
  } catch {
    continue;
  }

  const embeds = [...original.matchAll(embedBlockRe)].map((match) => match[0]);

  const next = current.replace(placeholderRe, (_, indexText) => {
    const index = Number(indexText);
    return embeds[index] ?? _;
  });

  if (next !== current) {
    writeFileSync(filePath, next, 'utf8');
    fixed += 1;
  }
}

console.log(`embed_placeholders_fixed=${fixed}`);
