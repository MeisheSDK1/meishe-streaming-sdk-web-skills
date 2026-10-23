#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DOMAIN_REQUIREMENTS, FEATURE_ALIASES } from './build-api-artifacts.mjs';

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function main() {
  const errors = [];
  const manifest = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'references', 'api-manifest.json'), 'utf8'));
  const featureMap = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'references', 'feature-map.json'), 'utf8'));
  const baseline = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'references', 'sdk-baseline.json'), 'utf8'));
  if (baseline.sdkVersion !== '3.16.0' || manifest.sdkVersion !== '3.16.0' || featureMap.sdkVersion !== '3.16.0') errors.push('SDK version mismatch across generated artifacts.');
  if (featureMap.schemaVersion !== 4) errors.push('Feature-map schema must match the routing format with generated aliases.');
  const domainIds = new Set(featureMap.domains.map((domain) => domain.id));
  if (JSON.stringify(featureMap.aliases) !== JSON.stringify(FEATURE_ALIASES)) errors.push('Feature aliases drifted from the generated routing source.');
  for (const [alias, domain] of Object.entries(featureMap.aliases || {})) {
    if (!alias || !domainIds.has(domain)) errors.push(`Invalid feature alias: ${alias} -> ${domain}`);
  }
  for (const domain of featureMap.domains) {
    const reference = path.join(SKILL_DIR, 'references', domain.reference);
    if (!fs.existsSync(reference)) errors.push(`Missing domain reference: ${domain.reference}`);
  }
  for (const [domainId, requiredSymbols] of Object.entries(DOMAIN_REQUIREMENTS)) {
    const domain = featureMap.domains.find((item) => item.id === domainId);
    if (!domain) {
      errors.push(`Missing required domain definition: ${domainId}`);
      continue;
    }
    for (const symbol of requiredSymbols) {
      if (!manifest.symbols.some((item) => item.fullName === symbol && item.domains.includes(domainId))) {
        errors.push(`Required domain symbol missing: ${domainId} -> ${symbol}`);
      }
      if (!(domain.requiredSymbols || []).includes(symbol)) errors.push(`Generated semantic anchor missing: ${domainId} -> ${symbol}`);
    }
  }
  for (const symbol of manifest.symbols) {
    if (!Array.isArray(symbol.domains) || symbol.domains.length === 0) {
      errors.push(`Missing domain list for ${symbol.fullName}`);
    } else {
      if (!symbol.domains.includes(symbol.domain)) errors.push(`Primary domain missing from domain list for ${symbol.fullName}: ${symbol.domain}`);
      for (const domain of symbol.domains) {
        if (!domainIds.has(domain)) errors.push(`Unknown domain for ${symbol.fullName}: ${domain}`);
      }
    }
  }
  const topLevel = new Set(manifest.symbols.filter((item) => !item.owner).map((item) => item.name));
  const memberNames = new Set(manifest.symbols.filter((item) => item.owner).map((item) => item.name));
  const files = [
    path.join(SKILL_DIR, 'SKILL.md'),
    ...walk(path.join(SKILL_DIR, 'references')).filter((file) => file.endsWith('.md')),
    ...walk(path.join(SKILL_DIR, 'assets', 'samples')).filter((file) => /\.(?:ts|js)$/.test(file)),
  ];
  const ignoredCalls = new Set([
    'add', 'analyzePath', 'append', 'arrayBuffer', 'assertReady', 'attribute', 'catch', 'clear', 'createElement', 'delete', 'find',
    'create', 'element', 'encode', 'endsWith', 'error', 'exec', 'fetch', 'filter', 'finally', 'floor',
    'abs', 'assign', 'at', 'cos', 'entries', 'every', 'forEach', 'from', 'get', 'getBoundingClientRect', 'getElementById', 'has', 'hasData', 'includes', 'isArray', 'isFinite', 'isInteger', 'join', 'lastIndexOf',
    'loadEmscriptenModule', 'log', 'map', 'max', 'min', 'mkdir', 'push', 'push_back',
    'onStartElement', 'padStart', 'parseInt', 'readFile', 'reduce', 'reject', 'remove', 'replace', 'resolve', 'reverse', 'rotate', 'round', 'scale', 'segment', 'set', 'shift', 'size', 'slice',
    'sin', 'some', 'sort', 'split', 'startsWith', 'stringify', 'sub', 'supports', 'test', 'then', 'toString', 'transformMat3', 'trim', 'values',
    'unlink', 'warn', 'writeFile', 'Segmenter', 'getUserMedia', 'resume', 'createMediaStreamSource',
    'createScriptProcessor', 'getChannelData', 'connect', 'disconnect', 'getTracks',
    'addEventListener', 'removeEventListener', 'getItem', 'setItem', 'now', 'ceil',
    'prepareTimeline', 'seek', 'dispose', 'all', 'observe', 'install', 'restore',
    'assertRequest', 'installOne', 'waitForReady', 'startInstall',
  ]);
  const sampleSpecificCalls = new Map([
    ['editor-bootstrap.ts', new Set(['restoreTimeline'])],
    ['project-loading.ts', new Set(['readProjectXml', 'timelineFromProject', 'restoreProject'])],
    ['web-local-media.ts', new Set([
      'pop', 'toLowerCase', 'getFormat', 'getCodec', 'computeDuration', 'computePacketStats',
      'isVideoTrack', 'getCodedWidth', 'getCodedHeight', 'getPixelAspectRatio', 'getRotation',
      'isAudioTrack', 'getSampleRate', 'getNumberOfChannels', 'randomUUID',
    ])],
    ['transcoded-m3u8-media.ts', new Set(['throwIfAborted', 'randomUUID'])],
    ['font-registration.ts', new Set(['match', 'toLowerCase', 'randomUUID', 'abort', 'setTimeout', 'clearTimeout'])],
    ['asset-package.ts', new Set(['run'])],
    ['insert-freeze-frame.ts', new Set(['snapshot', 'captureSourceState', 'restoreCreatedClipState', 'synchronizeDuration', 'commit'])],
    ['timeline-adjustment-workflow.ts', new Set(['pop', 'findIndex', 'begin', 'reset', 'commit', 'cancel'])],
    ['timed-object-operations.ts', new Set(['findIndex'])],
  ]);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/\b(Nvs[A-Za-z0-9_$]+|nvs[A-Z][A-Za-z0-9_$]+)\b/g)) {
      if (!topLevel.has(match[1]) && !memberNames.has(match[1])) errors.push(`Unknown SDK identifier ${match[1]} in ${path.relative(SKILL_DIR, file)}`);
    }
    if (file.includes(`${path.sep}assets${path.sep}samples${path.sep}`)) {
      const allowedForFile = sampleSpecificCalls.get(path.basename(file)) || new Set();
      for (const match of content.matchAll(/(?<!\.)\.([A-Za-z_$][\w$]*)\s*\(/g)) {
        if (!memberNames.has(match[1]) && !ignoredCalls.has(match[1]) && !allowedForFile.has(match[1])) errors.push(`Unverified method ${match[1]} in ${path.relative(SKILL_DIR, file)}`);
      }
    }
  }
  const skill = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
  for (const match of skill.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    if (/^(?:https?:|#)/.test(match[1])) continue;
    const target = path.resolve(SKILL_DIR, match[1].split('#')[0]);
    if (!fs.existsSync(target)) errors.push(`Broken SKILL.md link: ${match[1]}`);
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ status: 'pass', symbols: manifest.symbols.length, domains: featureMap.domains.length, checkedFiles: files.length }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
