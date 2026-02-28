import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const projectRoot = process.cwd();
const mediaRoot = path.join(projectRoot, 'public', 'media');
const srcRoot = path.join(projectRoot, 'src');

const TEXT_EXTENSIONS = new Set([
  '.md', '.mdx', '.astro', '.html', '.htm', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.json'
]);

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function depthOf(relativePath) {
  return toPosix(relativePath).split('/').length;
}

function hash8(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 8);
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function moveFile(oldAbs, newAbs) {
  await ensureDir(path.dirname(newAbs));
  try {
    await fs.rename(oldAbs, newAbs);
  } catch {
    await fs.copyFile(oldAbs, newAbs);
    await fs.unlink(oldAbs);
  }
}

async function removeEmptyDirs(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sub = path.join(dir, entry.name);
    await removeEmptyDirs(sub);
  }
  if (dir !== mediaRoot) {
    const after = await fs.readdir(dir);
    if (after.length === 0) {
      await fs.rmdir(dir);
    }
  }
}

function replaceAllSafe(content, find, replacement) {
  return content.split(find).join(replacement);
}

async function main() {
  const allMediaFilesAbs = await walk(mediaRoot);
  const allMediaFilesRel = allMediaFilesAbs
    .map((abs) => toPosix(path.relative(mediaRoot, abs)))
    .sort((a, b) => {
      const d = depthOf(a) - depthOf(b);
      if (d !== 0) return d;
      return a.localeCompare(b);
    });

  const usedNames = new Set();
  const finalNameByRel = new Map();

  for (const rel of allMediaFilesRel) {
    const base = path.basename(rel);
    let candidate = base;

    if (usedNames.has(candidate)) {
      const ext = path.extname(base);
      const stem = base.slice(0, base.length - ext.length);
      candidate = `${stem}--${hash8(rel)}${ext}`;
      let i = 2;
      while (usedNames.has(candidate)) {
        candidate = `${stem}--${hash8(rel)}-${i}${ext}`;
        i += 1;
      }
    }

    usedNames.add(candidate);
    finalNameByRel.set(rel, candidate);
  }

  let movedCount = 0;
  const changedMappings = [];

  for (const rel of allMediaFilesRel) {
    const newName = finalNameByRel.get(rel);
    if (!newName) continue;
    const oldAbs = path.join(mediaRoot, rel);
    const newAbs = path.join(mediaRoot, newName);

    if (toPosix(rel) !== newName) {
      await moveFile(oldAbs, newAbs);
      movedCount += 1;
      changedMappings.push({ oldRel: toPosix(rel), newName });
    }
  }

  const allSrcFiles = await walk(srcRoot);
  let rewrittenFiles = 0;
  let rewrittenRefs = 0;

  for (const fileAbs of allSrcFiles) {
    const ext = path.extname(fileAbs).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;

    let content = await fs.readFile(fileAbs, 'utf8');
    let changed = false;

    for (const { oldRel, newName } of changedMappings) {
      const oldDecoded = `/media/${oldRel}`;
      const oldEncoded = `/media/${encodeURI(oldRel)}`;
      const nextPath = `/media/${encodeURI(newName)}`;

      const before = content;
      content = replaceAllSafe(content, oldDecoded, nextPath);
      content = replaceAllSafe(content, oldEncoded, nextPath);
      if (content !== before) {
        changed = true;
      }
    }

    if (changed) {
      await fs.writeFile(fileAbs, content, 'utf8');
      rewrittenFiles += 1;
    }
  }

  const refRegex = /\/media\/[^\s"')>]+\//g;
  let deepRefCount = 0;
  for (const fileAbs of allSrcFiles) {
    const ext = path.extname(fileAbs).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    const content = await fs.readFile(fileAbs, 'utf8');
    const matches = content.match(refRegex);
    if (matches) {
      deepRefCount += matches.length;
    }
  }

  await removeEmptyDirs(mediaRoot);

  const remainingFiles = await fs.readdir(mediaRoot, { withFileTypes: true });
  const remainingSubdirs = remainingFiles.filter((d) => d.isDirectory()).length;

  console.log(`TOTAL_MEDIA_FILES=${allMediaFilesRel.length}`);
  console.log(`MOVED_TO_FLAT=${movedCount}`);
  console.log(`CONTENT_FILES_REWRITTEN=${rewrittenFiles}`);
  console.log(`DEEP_MEDIA_REFS_REMAINING=${deepRefCount}`);
  console.log(`SUBDIRS_REMAINING_UNDER_MEDIA=${remainingSubdirs}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
