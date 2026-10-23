#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function parseArgs(argv) {
  const args = { file: path.join(SKILL_DIR, 'references', 'test-resources.json'), ids: [], allowEmpty: false, metadataOnly: false, timeout: 12_000, maxBytes: 2_000_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--file') args.file = path.resolve(argv[++index]);
    else if (value === '--id') {
      const idList = argv[++index];
      if (!idList || idList.startsWith('--')) throw new Error('--id requires at least one resource ID.');
      const ids = idList.split(',').map((item) => item.trim()).filter(Boolean);
      if (!ids.length) throw new Error('--id requires at least one resource ID.');
      args.ids.push(...ids);
    }
    else if (value === '--allow-empty') args.allowEmpty = true;
    else if (value === '--metadata-only') args.metadataOnly = true;
    else if (value === '--timeout-ms') args.timeout = Number(argv[++index]);
    else if (value === '--max-bytes') args.maxBytes = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

export function selectTestResources(resources, ids) {
  if (!ids.length) return resources;
  const requested = [...new Set(ids)];
  const selected = requested.map((id) => resources.find((resource) => resource.id === id));
  const missing = requested.filter((_id, index) => !selected[index]);
  if (missing.length) throw new Error(`Unknown test resource ID: ${missing.join(', ')}`);
  return selected;
}

export function assertUniqueResourceIds(resources) {
  const seen = new Set();
  for (const resource of resources) {
    if (seen.has(resource.id)) throw new Error(`Duplicate test resource ID: ${resource.id}`);
    seen.add(resource.id);
  }
}

async function inspectResource(resource, args) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeout);
  try {
    const response = await fetch(resource.url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers: { Range: `bytes=0-${Math.min(args.maxBytes, 65_535)}` } });
    const contentType = response.headers.get('content-type') || '';
    const contentLength = Number(response.headers.get('content-length') || 0);
    const cors = response.headers.get('access-control-allow-origin');
    const reader = response.body?.getReader();
    const chunks = [];
    let bytesRead = 0;
    let truncated = false;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        if (bytesRead > args.maxBytes) {
          truncated = true;
          await reader.cancel('limited-download policy');
          break;
        }
        chunks.push(value);
      }
    }
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    const hash = resource.sha256 && !truncated && response.status !== 206
      ? crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase()
      : null;
    const errors = [];
    if (!response.ok && response.status !== 206) errors.push(`HTTP ${response.status}`);
    if (resource.mimeType && !contentType.toLowerCase().includes(resource.mimeType.toLowerCase())) errors.push(`MIME mismatch: ${contentType || 'missing'}`);
    if (resource.requireCors !== false && !cors) errors.push('CORS header missing');
    if (truncated || (contentLength > args.maxBytes && response.status !== 206)) errors.push(`Response exceeds limited-download policy (${contentLength || bytesRead} bytes)`);
    if (resource.sha256 && response.status === 206) errors.push('SHA-256 cannot be verified from a partial response');
    if (resource.sha256 && hash && hash !== resource.sha256.toUpperCase()) errors.push('SHA-256 mismatch');
    return { id: resource.id, status: errors.length ? 'failed' : 'available', finalHost: new URL(response.url).host, contentType, contentLength, cors: Boolean(cors), errors };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(fs.readFileSync(args.file, 'utf8'));
  if (!Array.isArray(manifest.resources)) throw new Error('test-resources.json must contain a resources array.');
  for (const resource of manifest.resources) {
    for (const field of ['id', 'url', 'purpose', 'source', 'license', 'mimeType']) {
      if (!resource[field]) throw new Error(`Resource ${resource.id || '(unknown)'} is missing ${field}.`);
    }
    if (!/^https:\/\//i.test(resource.url)) throw new Error(`Resource ${resource.id} must use HTTPS.`);
  }
  assertUniqueResourceIds(manifest.resources);
  if (!manifest.resources.length) {
    const message = 'No approved public test resources are configured.';
    if (args.allowEmpty) {
      console.log(JSON.stringify({ status: 'blocked-external', message, resources: [] }, null, 2));
      return;
    }
    throw new Error(message);
  }
  const selected = selectTestResources(manifest.resources, args.ids);
  if (args.metadataOnly) {
    console.log(JSON.stringify({ status: 'pass', environment: manifest.environment, productionDefault: manifest.productionDefault, resources: selected.map(({ id, purpose }) => ({ id, purpose })) }, null, 2));
    return;
  }
  const results = [];
  for (const resource of selected) {
    try {
      results.push(await inspectResource(resource, args));
    } catch (error) {
      results.push({ id: resource.id, status: 'failed', errors: [error.name === 'AbortError' ? 'Request timed out' : error.message] });
    }
  }
  console.log(JSON.stringify({ status: results.every((item) => item.status === 'available') ? 'available' : 'failed', resources: results }, null, 2));
  if (results.some((item) => item.status !== 'available')) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
