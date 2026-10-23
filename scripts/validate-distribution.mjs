#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FORBIDDEN_FILES = new Set(['README.md', 'CHANGELOG.md', 'INSTALLATION_GUIDE.md', '.env', '.env.local']);
const ALLOWED_SAMPLE_PACKAGES = new Set(['meishewasmloader', 'mediabunny', 'react']);

function insideSkill(skillDir, target) {
  const relative = path.relative(skillDir, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function walk(directory, symlinks = []) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) symlinks.push(full);
    else if (entry.isDirectory()) files.push(...walk(full, symlinks));
    else files.push(full);
  }
  return files;
}

function hash(file) {
  const normalized = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(Buffer.from(normalized, 'utf8')).digest('hex').toUpperCase();
}

function relative(skillDir, file) {
  return path.relative(skillDir, file).replace(/\\/g, '/');
}

function localTarget(baseDirectory, reference) {
  const clean = decodeURIComponent(reference.split('#')[0].split('?')[0]);
  return clean ? path.resolve(baseDirectory, clean) : null;
}

function validateMarkdownLinks(skillDir, files, errors) {
  for (const file of files.filter((item) => item.endsWith('.md'))) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const reference = match[1].trim().replace(/^<|>$/g, '');
      if (/^(?:https?:|mailto:|#)/i.test(reference)) continue;
      let target;
      try {
        target = localTarget(path.dirname(file), reference);
      } catch {
        errors.push(`Invalid encoded Markdown link in ${relative(skillDir, file)}: ${reference}`);
        continue;
      }
      if (!target || !insideSkill(skillDir, target)) errors.push(`Markdown link escapes Skill root in ${relative(skillDir, file)}: ${reference}`);
      else if (!fs.existsSync(target)) errors.push(`Broken Markdown link in ${relative(skillDir, file)}: ${reference}`);
    }
  }
}

function validateSkillMetadata(skillDir, errors) {
  const skillFile = path.join(skillDir, 'SKILL.md');
  const skill = fs.readFileSync(skillFile, 'utf8');
  const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) {
    errors.push('SKILL.md must start with closed YAML frontmatter.');
    return;
  }
  const fields = new Map();
  for (const line of frontmatter[1].split(/\r?\n/)) {
    const match = line.match(/^([a-z_]+):\s*(.+)$/);
    if (!match) errors.push(`Invalid SKILL.md frontmatter line: ${line}`);
    else fields.set(match[1], match[2].trim());
  }
  const unexpected = [...fields.keys()].filter((field) => !['name', 'description'].includes(field));
  if (unexpected.length) errors.push(`Unexpected SKILL.md frontmatter fields: ${unexpected.join(', ')}`);
  const folderName = path.basename(skillDir);
  if (fields.get('name') !== folderName) errors.push(`SKILL.md name must match the Skill directory: ${folderName}`);
  if (!/^[a-z0-9-]{1,64}$/.test(fields.get('name') || '')) errors.push('SKILL.md name must contain only lowercase letters, digits, and hyphens and be at most 64 characters.');
  if (!fields.get('description')) errors.push('SKILL.md description must be non-empty.');

  const openaiFile = path.join(skillDir, 'agents', 'openai.yaml');
  if (!fs.existsSync(openaiFile)) {
    errors.push('agents/openai.yaml is missing.');
    return;
  }
  const openai = fs.readFileSync(openaiFile, 'utf8');
  const interfaceValues = new Map();
  for (const field of ['display_name', 'short_description', 'brand_color', 'default_prompt']) {
    const match = openai.match(new RegExp(`^\\s+${field}:\\s+(["'])(.*?)\\1\\s*$`, 'm'));
    if (!match) errors.push(`agents/openai.yaml ${field} must exist and use a quoted string value.`);
    else interfaceValues.set(field, match[2]);
  }
  for (const field of ['icon_small', 'icon_large']) {
    const declared = openai.match(new RegExp(`^\\s+${field}:`, 'm'));
    const match = openai.match(new RegExp(`^\\s+${field}:\\s+(["'])(.*?)\\1\\s*$`, 'm'));
    if (declared && !match) errors.push(`agents/openai.yaml ${field} must use a quoted string value when present.`);
    else if (match) interfaceValues.set(field, match[2]);
  }
  const shortDescription = interfaceValues.get('short_description') || '';
  if (shortDescription && (shortDescription.length < 25 || shortDescription.length > 64)) errors.push('agents/openai.yaml short_description must contain 25-64 characters.');
  const defaultPrompt = interfaceValues.get('default_prompt') || '';
  if (defaultPrompt && !defaultPrompt.includes(`$${folderName}`)) errors.push(`agents/openai.yaml default_prompt must name $${folderName}.`);
  for (const field of ['icon_small', 'icon_large']) {
    const iconValue = interfaceValues.get(field);
    if (!iconValue) continue;
    const icon = path.resolve(skillDir, iconValue);
    if (!insideSkill(skillDir, icon) || !fs.existsSync(icon)) errors.push(`Invalid agents/openai.yaml icon path: ${iconValue}`);
  }
}

function validateInlineSkillPaths(skillDir, files, errors) {
  const sampleNames = new Set(files
    .filter((file) => file.includes(`${path.sep}assets${path.sep}samples${path.sep}`) && file.endsWith('.ts'))
    .map((file) => path.basename(file)));
  for (const file of files.filter((item) => item.endsWith('.md'))) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/`((?:assets|references|scripts)\/[A-Za-z0-9_./-]+)`/g)) {
      const target = path.resolve(skillDir, match[1]);
      if (!insideSkill(skillDir, target) || !fs.existsSync(target)) {
        errors.push(`Invalid inline Skill path in ${relative(skillDir, file)}: ${match[1]}`);
      }
    }
    for (const match of content.matchAll(/`([A-Za-z0-9_-]+\.ts)`/g)) {
      if (sampleNames.has(match[1])) {
        errors.push(`Ambiguous sample filename in ${relative(skillDir, file)}; use a Markdown link: ${match[1]}`);
      }
    }
  }
}

function resolveImport(file, specifier) {
  const base = path.resolve(path.dirname(file), specifier);
  const candidates = [base, `${base}.ts`, `${base}.js`, `${base}.mjs`, `${base}.json`, path.join(base, 'index.ts'), path.join(base, 'index.js')];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function validateSampleImports(skillDir, samples, errors) {
  for (const file of samples) {
    const content = fs.readFileSync(file, 'utf8');
    const specifiers = new Set();
    for (const match of content.matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)) specifiers.add(match[1]);
    for (const match of content.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) specifiers.add(match[1]);
    for (const specifier of specifiers) {
      if (!specifier.startsWith('.')) {
        if (!ALLOWED_SAMPLE_PACKAGES.has(specifier)) errors.push(`Unapproved sample package import in ${relative(skillDir, file)}: ${specifier}`);
        continue;
      }
      const target = resolveImport(file, specifier);
      if (!target) errors.push(`Unresolved sample import in ${relative(skillDir, file)}: ${specifier}`);
      else if (!insideSkill(skillDir, target)) errors.push(`Sample import escapes Skill root in ${relative(skillDir, file)}: ${specifier}`);
    }
  }
}

function validateSourceMaps(skillDir, files, errors) {
  for (const file of files) {
    if (fs.statSync(file).size > 2_000_000) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/[#@]\s*sourceMappingURL\s*=\s*([^\s*]+)/g)) {
      const reference = match[1].trim();
      if (/^data:/i.test(reference)) continue;
      const target = localTarget(path.dirname(file), reference);
      if (!target || !insideSkill(skillDir, target)) errors.push(`Source map escapes Skill root in ${relative(skillDir, file)}: ${reference}`);
      else if (!fs.existsSync(target)) errors.push(`Missing source map in ${relative(skillDir, file)}: ${reference}`);
    }
  }
}

export function validateDistribution(skillDirectory = SKILL_DIR) {
  const skillDir = path.resolve(skillDirectory);
  const errors = [];
  const warnings = [];
  const symlinks = [];
  const files = walk(skillDir, symlinks);
  for (const link of symlinks) errors.push(`Symbolic link is not distributable: ${relative(skillDir, link)}`);

  const baseline = JSON.parse(fs.readFileSync(path.join(skillDir, 'references', 'sdk-baseline.json'), 'utf8'));
  const featureMap = JSON.parse(fs.readFileSync(path.join(skillDir, 'references', 'feature-map.json'), 'utf8'));
  for (const file of files) {
    const name = relative(skillDir, file);
    if (FORBIDDEN_FILES.has(path.basename(file)) || /\.map$/i.test(file)) errors.push(`Forbidden distributed file: ${name}`);
    if (name === 'scripts/validate-distribution.mjs' || fs.statSync(file).size > 2_000_000 || /\.(?:png|jpe?g|gif|webp|ico)$/i.test(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const patterns = [
      [/[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]/i, 'absolute Windows user path'],
      [/\\\\[^\\\s]+\\[^\\\s]+/, 'UNC path'],
      [/(?:^|[\s'"(])\/(?:Users|home)\//m, 'absolute POSIX user path'],
      [/file:\/\//i, 'file URI'],
      [/(?:^|[^A-Za-z])(?:10\.|127\.0\.0\.1|192\.168\.)\d{1,3}(?:\.\d{1,3}){2}/, 'private or loopback IP'],
      [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
      [/(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*['"][^'"$<{][^'"]{7,}['"]/i, 'embedded credential'],
      [/\b(?:TODO|TBD|PLACEHOLDER)\b/, 'placeholder marker'],
      [/sourceCode[\\/]/, 'internal source path'],
    ];
    for (const [pattern, label] of patterns) if (pattern.test(content)) errors.push(`${label} in ${name}`);
  }

  const apiPath = path.resolve(skillDir, baseline.apiFile);
  const typePath = path.resolve(skillDir, baseline.typeFile);
  for (const [label, target] of [['API', apiPath], ['type', typePath]]) {
    if (!insideSkill(skillDir, target) || !fs.existsSync(target)) errors.push(`${label} baseline path is missing or outside the Skill.`);
  }
  if (fs.existsSync(apiPath) && hash(apiPath) !== baseline.apiFileSha256) errors.push('NvStreamingSdk.js SHA-256 differs from sdk-baseline.json.');
  if (fs.existsSync(typePath) && hash(typePath) !== baseline.typeFileSha256) errors.push('sdk.d.ts SHA-256 differs from sdk-baseline.json.');
  for (const domain of featureMap.domains || []) {
    const target = path.resolve(skillDir, 'references', domain.reference);
    if (!insideSkill(skillDir, target) || !fs.existsSync(target)) errors.push(`Feature reference is missing or outside the Skill: ${domain.reference}`);
  }

  const samples = walk(path.join(skillDir, 'assets', 'samples'));
  const sampleIndex = fs.readFileSync(path.join(skillDir, 'references', 'sample-index.md'), 'utf8');
  for (const sample of samples) {
    const content = fs.readFileSync(sample, 'utf8');
    const indexedPath = `../${relative(skillDir, sample)}`;
    if (!sampleIndex.includes(indexedPath)) errors.push(`Sample is not routed from sample-index.md: ${relative(skillDir, sample)}`);
    if (/references[\\/]NvStreamingSdk\.js|Copy-Item.*NvStreamingSdk|copy.*NvStreamingSdk/i.test(content)) errors.push(`Sample attempts to use the query-only SDK source: ${relative(skillDir, sample)}`);
  }
  validateSampleImports(skillDir, samples, errors);
  validateSkillMetadata(skillDir, errors);
  validateMarkdownLinks(skillDir, files, errors);
  validateInlineSkillPaths(skillDir, files, errors);
  validateSourceMaps(skillDir, files, errors);

  return {
    errors: [...new Set(errors)],
    payload: {
      status: errors.length ? 'failed' : 'pass',
      files: files.length,
      unpackedBytes: files.reduce((total, file) => total + fs.statSync(file).size, 0),
      symlinks: symlinks.length,
      warnings,
    },
  };
}

function main() {
  const result = validateDistribution();
  if (result.errors.length) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(result.payload, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
