import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'src', 'data', 'content.json');
const outputRoot = path.join(root, 'src', 'content');

const collectionModels = {
  people: 'core.person',
  projects: 'core.project',
  stories: 'core.story',
  events: 'core.event',
  reports: 'core.report',
};

const fallbackImage = '/img/cfp_logomark.png';

function normalizeImage(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return fallbackImage;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/sites/')) return `https://codeforpakistan.org${value}`;
  return `/media/${value}`;
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ''));
}

function toFilename(slug, pk) {
  const cleaned = String(slug || `entry-${pk}`)
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._%\-]/g, '-');

  return `${cleaned || `entry-${pk}`}.md`;
}

async function ensureCleanDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

const raw = await fs.readFile(sourcePath, 'utf8');
const records = JSON.parse(raw);

const imageMap = new Map(
  records
    .filter((item) => item.model === 'core.image')
    .map((item) => [item.pk, normalizeImage(item.fields?.image)]),
);

for (const [collection, model] of Object.entries(collectionModels)) {
  const dirPath = path.join(outputRoot, collection);
  await ensureCleanDir(dirPath);

  const items = records.filter(
    (item) => item.model === model && item.fields?.is_published !== false,
  );

  for (const item of items) {
    const fields = item.fields ?? {};
    const slug = String(fields.slug ?? '').trim();
    if (!slug) continue;

    const frontmatterFields =
      collection === 'people'
        ? [
            `title: ${yamlString(fields.title)}`,
            `slug: ${yamlString(slug)}`,
            `image: ${yamlString(imageMap.get(fields.image) ?? fallbackImage)}`,
            `group: ${yamlString('')}`,
            `sortOrder: 0`,
            `designation: ${yamlString(fields.designation)}`,
            `linkedin: ${yamlString('')}`,
            `github: ${yamlString('')}`,
            `twitter: ${yamlString('')}`,
          ]
        : [
            `title: ${yamlString(fields.title)}`,
            `slug: ${yamlString(slug)}`,
            `summary: ${yamlString(fields.summary)}`,
            `image: ${yamlString(imageMap.get(fields.image) ?? fallbackImage)}`,
            `group: ${yamlString('')}`,
            `sortOrder: 0`,
            `designation: ${yamlString(fields.designation)}`,
            `bio: ${yamlString(fields.summary)}`,
            `linkedin: ${yamlString('')}`,
            `github: ${yamlString('')}`,
            `twitter: ${yamlString('')}`,
            `location: ${yamlString(fields.location)}`,
            `createdAt: ${yamlString(fields.created_at)}`,
            `startDate: ${yamlString(fields.start_date)}`,
            `dueDate: ${yamlString(fields.due_date)}`,
          ];

    const frontmatter = ['---', ...frontmatterFields, '---', ''].join('\n');

    const body = String(fields.content ?? '').trim();
    const fileName = toFilename(slug, item.pk);
    const filePath = path.join(dirPath, fileName);

    await fs.writeFile(filePath, `${frontmatter}${body}\n`, 'utf8');
  }
}

console.log('Markdown content generated under src/content for people, projects, stories, events, reports.');
