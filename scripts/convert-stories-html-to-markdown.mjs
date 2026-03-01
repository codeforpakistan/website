import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const storiesDir = join(process.cwd(), 'src', 'content', 'stories');
const files = readdirSync(storiesDir).filter((name) => name.endsWith('.md'));

const EMBED_BLOCK_RE = /(<script[\s\S]*?<\/script>|<iframe[\s\S]*?<\/iframe>|<div[^>]*class=\"[^\"]*infogram-embed[^\"]*\"[^>]*>[\s\S]*?<\/div>)/gi;
const FRONTMATTER_RE = /^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/;
const HTML_HINT_RE = /<\/?(p|br|h[1-6]|ul|ol|li|blockquote|img|a|strong|em|figure|figcaption|hr|div|span)\b/i;

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '_',
});

turndown.use(gfm);

turndown.keep(['iframe', 'script']);

turndown.addRule('lineBreak', {
  filter: 'br',
  replacement: () => '  \n',
});

turndown.addRule('figureCaption', {
  filter: 'figcaption',
  replacement: (content) => {
    const text = content.trim();
    if (!text) return '';
    return `\n\n_${text}_\n\n`;
  },
});

function protectEmbeds(input) {
  const blocks = [];
  const protectedHtml = input.replace(EMBED_BLOCK_RE, (match) => {
    const token = `CFPEMBEDTOKEN${blocks.length}CFP`;
    blocks.push(match);
    return `\n\n${token}\n\n`;
  });

  return { protectedHtml, blocks };
}

function restoreEmbeds(input, blocks) {
  let output = input;
  for (let index = 0; index < blocks.length; index += 1) {
    const token = `CFPEMBEDTOKEN${index}CFP`;
    output = output.replace(new RegExp(token, 'g'), blocks[index]);
  }

  return output;
}

function cleanMarkdown(input) {
  return input
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

let changed = 0;
let converted = 0;

for (const file of files) {
  const filePath = join(storiesDir, file);
  const raw = readFileSync(filePath, 'utf8');
  const frontmatterMatch = raw.match(FRONTMATTER_RE);
  if (!frontmatterMatch) continue;

  const frontmatter = frontmatterMatch[1];
  const body = frontmatterMatch[2] || '';

  if (!HTML_HINT_RE.test(body)) continue;

  const { protectedHtml, blocks } = protectEmbeds(body);
  const markdownBody = turndown.turndown(protectedHtml);
  const restoredBody = restoreEmbeds(markdownBody, blocks);
  const cleanBody = cleanMarkdown(restoredBody);

  const next = `${frontmatter}${cleanBody}\n`;

  converted += 1;
  if (next !== raw) {
    writeFileSync(filePath, next, 'utf8');
    changed += 1;
  }
}

console.log(`files_scanned=${files.length}`);
console.log(`files_with_html=${converted}`);
console.log(`files_changed=${changed}`);