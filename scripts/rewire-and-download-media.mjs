import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const contentRoot = path.join(root, 'src', 'content');
const mediaRoot = path.join(root, 'public', 'media');
const origin = 'https://codeforpakistan.org';

const rewired = [];
const downloadQueue = new Map();

function hash(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 10);
}

function normalizePathname(pathname) {
  if (!pathname || pathname === '/') return '/index.bin';
  return pathname;
}

function withQuerySuffix(pathname, query) {
  if (!query) return pathname;
  const ext = path.extname(pathname);
  const base = ext ? pathname.slice(0, -ext.length) : pathname;
  const suffix = `__q_${hash(query)}`;
  return `${base}${suffix}${ext || '.bin'}`;
}

function toFsPathFromWebPath(webPath) {
  const normalized = webPath.replace(/^\/+/, '');
  if (!normalized.startsWith('media/')) {
    throw new Error(`Unsupported web path for media download: ${webPath}`);
  }
  const relative = normalized.replace(/^media\/?/, '').split('/').join(path.sep);
  return path.join(mediaRoot, relative);
}

function sanitizeSegment(segment) {
  const safe = segment.replace(/[<>:"\\|?*]/g, '_').trim();
  return safe || '_';
}

function sanitizePathname(pathname) {
  const hasLeadingSlash = pathname.startsWith('/');
  const parts = pathname.split('/').filter((part, index) => !(index === 0 && hasLeadingSlash));
  const safeParts = parts.map((part) => sanitizeSegment(part));
  return `${hasLeadingSlash ? '/' : ''}${safeParts.join('/')}`;
}

function recoverExternalPath(pathname) {
  return pathname
    .replace(/^\/_\//, '/')
    .split('/')
    .map((segment) => {
      if (/^resize_fit_\d+$/i.test(segment)) {
        return segment.replace(/^resize_fit_(\d+)$/i, 'resize:fit:$1');
      }
      if (/^\d_[^/]+\.[a-z0-9]+$/i.test(segment)) {
        const idx = segment.indexOf('_');
        return `${segment.slice(0, idx)}*${segment.slice(idx + 1)}`;
      }
      return segment;
    })
    .join('/');
}

function mapUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/media_/')) {
    return {
      sourceUrl: `${origin}${trimmed.replace(/^\/media_\//, '/').replace(/^\//, '/')}`,
      webPath: trimmed.replace(/^\/media_\//, '/media/'),
    };
  }

  if (trimmed.startsWith('/img/') || trimmed.startsWith('/media/')) {
    if (!trimmed.startsWith('/media/external/')) return null;

    const remainder = trimmed.slice('/media/external/'.length);
    const slash = remainder.indexOf('/');
    if (slash <= 0) return null;

    const host = remainder.slice(0, slash).replace(/_+$/, '');
    const currentPath = `/${remainder.slice(slash + 1)}`;
    const sanitized = sanitizePathname(currentPath);
    const normalizedPath = withQuerySuffix(normalizePathname(sanitized), '');
    const webPath = `/media/external/${host}${normalizedPath}`;

    if (webPath === trimmed) return null;
    return {
      sourceUrl: `https://${host}${recoverExternalPath(currentPath)}`,
      webPath,
    };
  }

  if (trimmed.startsWith('/sites/') || trimmed.startsWith('/web/sites/')) {
    const sourceUrl = `${origin}${trimmed}`;
    const webPath = `/media${trimmed}`;
    return { sourceUrl, webPath };
  }

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return null;
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const pathname = normalizePathname(url.pathname);

  if (url.hostname === 'codeforpakistan.org' && (pathname.startsWith('/sites/') || pathname.startsWith('/web/sites/'))) {
    const safePathname = sanitizePathname(pathname);
    const webPath = `/media${withQuerySuffix(safePathname, url.search)}`;
    return { sourceUrl: url.toString(), webPath };
  }

  const extPath = withQuerySuffix(sanitizePathname(pathname), url.search);
  const webPath = `/media/external/${url.hostname}${extPath}`;
  return { sourceUrl: url.toString(), webPath };
}

async function walkMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(full);
    }
  }

  return files;
}

function queueDownload(sourceUrl, webPath) {
  if (!downloadQueue.has(webPath)) {
    downloadQueue.set(webPath, sourceUrl);
  }
}

function rewriteFileContent(filePath, content) {
  let updated = content;
  let fileChanged = false;

  const isLikelyImageRef = (url) => {
    if (!url) return false;
    const cleaned = String(url).split('?')[0].toLowerCase();
    return /\.(png|jpe?g|gif|webp|svg|avif)$/.test(cleaned);
  };

  updated = updated.replace(/^(image:\s*")([^"]+)("\s*)$/m, (match, p1, url, p3) => {
    const mapped = mapUrl(url);
    if (!mapped) return match;
    fileChanged = true;
    queueDownload(mapped.sourceUrl, mapped.webPath);
    return `${p1}${mapped.webPath}${p3}`;
  });

  updated = updated.replace(/(<img\b[^>]*?\ssrc=")([^"]+)("[^>]*>)/gi, (match, p1, url, p3) => {
    const mapped = mapUrl(url);
    if (!mapped) return match;
    fileChanged = true;
    queueDownload(mapped.sourceUrl, mapped.webPath);
    return `${p1}${mapped.webPath}${p3}`;
  });

  updated = updated.replace(/(<img\b[^>]*?\ssrc=')([^']+)('[^>]*>)/gi, (match, p1, url, p3) => {
    const mapped = mapUrl(url);
    if (!mapped) return match;
    fileChanged = true;
    queueDownload(mapped.sourceUrl, mapped.webPath);
    return `${p1}${mapped.webPath}${p3}`;
  });

  updated = updated.replace(/(<a\b[^>]*?\shref=")([^"]+)("[^>]*>)/gi, (match, p1, url, p3) => {
    if (!isLikelyImageRef(url)) return match;
    const mapped = mapUrl(url);
    if (!mapped) return match;
    fileChanged = true;
    queueDownload(mapped.sourceUrl, mapped.webPath);
    return `${p1}${mapped.webPath}${p3}`;
  });

  updated = updated.replace(/(<a\b[^>]*?\shref=')([^']+)('[^>]*>)/gi, (match, p1, url, p3) => {
    if (!isLikelyImageRef(url)) return match;
    const mapped = mapUrl(url);
    if (!mapped) return match;
    fileChanged = true;
    queueDownload(mapped.sourceUrl, mapped.webPath);
    return `${p1}${mapped.webPath}${p3}`;
  });

  if (fileChanged) {
    rewired.push(path.relative(root, filePath).split(path.sep).join('/'));
  }

  return { updated, fileChanged };
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function downloadFile(sourceUrl, webPath) {
  const outPath = toFsPathFromWebPath(webPath);

  try {
    await fs.access(outPath);
    return { status: 'skipped', webPath, sourceUrl };
  } catch {}

  await ensureParentDir(outPath);

  const response = await fetch(sourceUrl, { redirect: 'follow' });
  if (!response.ok) {
    return { status: 'failed', webPath, sourceUrl, code: response.status };
  }

  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(outPath, Buffer.from(arrayBuffer));
  return { status: 'downloaded', webPath, sourceUrl };
}

async function runDownloads(limit = 8) {
  const entries = Array.from(downloadQueue.entries());
  const results = [];
  let index = 0;

  async function worker() {
    while (index < entries.length) {
      const current = index;
      index += 1;
      const [webPath, sourceUrl] = entries[current];
      try {
        const result = await downloadFile(sourceUrl, webPath);
        results.push(result);
      } catch (error) {
        results.push({
          status: 'failed',
          webPath,
          sourceUrl,
          error: String(error),
        });
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

const markdownFiles = await walkMarkdownFiles(contentRoot);
for (const file of markdownFiles) {
  const content = await fs.readFile(file, 'utf8');
  const { updated, fileChanged } = rewriteFileContent(file, content);
  if (fileChanged) {
    await fs.writeFile(file, updated, 'utf8');
  }
}

await fs.mkdir(mediaRoot, { recursive: true });
const downloadResults = await runDownloads(8);

const downloaded = downloadResults.filter((r) => r.status === 'downloaded').length;
const skipped = downloadResults.filter((r) => r.status === 'skipped').length;
const failed = downloadResults.filter((r) => r.status === 'failed');

const report = {
  rewiredFiles: rewired.length,
  uniqueAssetsReferenced: downloadQueue.size,
  downloaded,
  skipped,
  failed: failed.length,
  failures: failed,
};

await fs.writeFile(
  path.join(root, 'scripts', 'rewire-media-report.json'),
  JSON.stringify(report, null, 2),
  'utf8',
);

console.log(`Rewired files: ${report.rewiredFiles}`);
console.log(`Assets referenced: ${report.uniqueAssetsReferenced}`);
console.log(`Downloaded: ${downloaded}, skipped: ${skipped}, failed: ${failed.length}`);
console.log('Report: scripts/rewire-media-report.json');
