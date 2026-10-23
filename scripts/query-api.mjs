#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
  const args = { bilingual: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--symbol') args.symbol = argv[++index];
    else if (value === '--member') args.member = argv[++index];
    else if (value === '--domain') args.domain = argv[++index];
    else if (value === '--query') args.query = argv[++index];
    else if (value === '--bilingual') args.bilingual = true;
    else if (value === '--json') args.json = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.symbol && !args.member && !args.domain && !args.query) {
    throw new Error('Provide --symbol, --member, --domain, or --query.');
  }
  return args;
}

function contains(value, expected) {
  return String(value || '').toLowerCase().includes(String(expected || '').toLowerCase());
}

function formatSymbol(symbol, bilingual) {
  const lines = [
    `${symbol.fullName} [${symbol.kind}]`,
    `Domains: ${symbol.domains.join(', ')}`,
    `Signature: ${symbol.signature}`,
    `Summary: ${symbol.summary.en || '(not documented)'}`,
  ];
  if (bilingual) lines.push(`中文：${symbol.summary.zh || '（无中文摘要）'}`);
  lines.push(`Source: references/NvStreamingSdk.js:${symbol.sourceLine || 'unknown'}`);
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.join(SKILL_DIR, 'references', 'api-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  let results = manifest.symbols;
  if (args.symbol) results = results.filter((item) => contains(item.fullName, args.symbol));
  if (args.member) results = results.filter((item) => contains(item.name, args.member));
  if (args.domain) results = results.filter((item) => item.domains.includes(args.domain));
  if (args.query) {
    results = results.filter((item) => [item.fullName, item.signature, item.summary.en, item.summary.zh, ...item.domains].some((value) => contains(value, args.query)));
  }
  if (!results.length) {
    const hint = manifest.symbols
      .filter((item) => [args.symbol, args.member, args.query].filter(Boolean).some((value) => contains(item.fullName, String(value).slice(0, 4))))
      .slice(0, 10)
      .map((item) => item.fullName);
    console.error(`No API symbol matched.${hint.length ? ` Candidates: ${hint.join(', ')}` : ''}`);
    process.exitCode = 2;
    return;
  }
  if (args.json) console.log(JSON.stringify(results, null, 2));
  else console.log(results.map((item) => formatSymbol(item, args.bilingual)).join('\n\n'));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
