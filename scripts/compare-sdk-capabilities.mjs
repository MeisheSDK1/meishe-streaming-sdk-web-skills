#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
  const args = { symbols: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--target-sdk') args.targetSdk = path.resolve(argv[++index]);
    else if (value === '--symbols') args.symbols.push(...argv[++index].split(',').map((item) => item.trim()).filter(Boolean));
    else if (value === '--feature') args.feature = argv[++index];
    else if (value === '--runtime-sdk-version') args.runtimeSdkVersion = argv[++index];
    else if (value === '--json') args.json = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.targetSdk) throw new Error('Provide --target-sdk <NvStreamingSdk.js>.');
  if (!args.symbols.length && !args.feature) throw new Error('Provide --symbols <a,b> or --feature <domain>.');
  if (args.runtimeSdkVersion && !/^\d+\.\d+\.\d+$/.test(args.runtimeSdkVersion)) {
    throw new Error('--runtime-sdk-version must be an x.y.z value observed from context.getSdkVersion().');
  }
  return args;
}

function countBraces(value) {
  return [...value].reduce((depth, char) => depth + (char === '{' ? 1 : char === '}' ? -1 : 0), 0);
}

function maskCommentsAndStrings(source) {
  let result = '';
  let state = 'code';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (state === 'line-comment') {
      if (char === '\n' || char === '\r') {
        state = 'code';
        result += char;
      } else result += ' ';
      continue;
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        result += '  ';
        index += 1;
        state = 'code';
      } else result += char === '\n' || char === '\r' ? char : ' ';
      continue;
    }
    if (state !== 'code') {
      if (char === '\n' || char === '\r') result += char;
      else result += ' ';
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (
        (state === 'single-quote' && char === "'") ||
        (state === 'double-quote' && char === '"') ||
        (state === 'template' && char === '`')
      ) state = 'code';
      continue;
    }
    if (char === '/' && next === '/') {
      result += '  ';
      index += 1;
      state = 'line-comment';
    } else if (char === '/' && next === '*') {
      result += '  ';
      index += 1;
      state = 'block-comment';
    } else if (char === "'") {
      result += ' ';
      state = 'single-quote';
    } else if (char === '"') {
      result += ' ';
      state = 'double-quote';
    } else if (char === '`') {
      result += ' ';
      state = 'template';
    } else result += char;
  }
  return { source: result, terminated: state === 'code' || state === 'line-comment' };
}

export function extractJsSurface(source) {
  const masked = maskCommentsAndStrings(source);
  const lines = source.split(/\r?\n/);
  const codeLines = masked.source.split(/\r?\n/);
  const surface = new Map();
  let owner = null;
  let ownerDepth = 0;
  let enumOwner = null;
  let enumDepth = 0;
  let sourceClassCount = 0;
  const completeClasses = new Set();
  const incompleteClasses = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const codeLine = codeLines[index];
    const trimmed = codeLine.trim();
    if (!owner && !enumOwner) {
      let match = trimmed.match(/^class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$]*))?\s*\{/);
      if (match) {
        owner = match[1];
        sourceClassCount += 1;
        surface.set(owner, { fullName: owner, kind: 'class', params: null, line: index + 1 });
        ownerDepth = countBraces(codeLine.slice(codeLine.indexOf('{')));
        if (ownerDepth <= 0) {
          incompleteClasses.add(owner);
          owner = null;
        }
        continue;
      }
      match = trimmed.match(/^function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/);
      if (match) {
        surface.set(match[1], { fullName: match[1], kind: 'globalFunction', params: splitJsParams(match[2]), line: index + 1 });
        continue;
      }
      match = trimmed.match(/^(?:const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*Object\.freeze\s*\(\s*\{/);
      if (match) {
        enumOwner = match[1];
        enumDepth = countBraces(line);
        surface.set(enumOwner, { fullName: enumOwner, kind: 'enum', params: null, line: index + 1 });
        continue;
      }
      match = trimmed.match(/^(?:const|var)\s+([A-Za-z_$][\w$]*)\b/);
      if (match) surface.set(match[1], { fullName: match[1], kind: 'constant', params: null, line: index + 1 });
      continue;
    }
    if (enumOwner) {
      const member = trimmed.match(/^(?:['"]([^'"]+)['"]|([A-Za-z_$][\w$]*))\s*:/);
      if (member) {
        const name = member[1] || member[2];
        surface.set(`${enumOwner}.${name}`, { fullName: `${enumOwner}.${name}`, kind: 'enumMember', params: null, line: index + 1 });
      }
      enumDepth += countBraces(line);
      if (enumDepth <= 0 || /^}\);?/.test(trimmed)) enumOwner = null;
      continue;
    }
    if (owner) {
      if (ownerDepth === 1) {
        const method = trimmed.match(/^(?:static\s+)?(?:(get|set)\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/);
        if (method) {
          const kind = method[2] === 'constructor' ? 'constructor' : method[1] === 'get' ? 'getter' : method[1] === 'set' ? 'setter' : 'method';
          surface.set(`${owner}.${method[2]}`, { fullName: `${owner}.${method[2]}`, kind, params: splitJsParams(method[3]), line: index + 1 });
        }
      }
      for (const match of codeLine.matchAll(/this\.([A-Za-z_$][\w$]*)\s*=/g)) {
        surface.set(`${owner}.${match[1]}`, { fullName: `${owner}.${match[1]}`, kind: /^on[A-Z_]/.test(match[1]) ? 'callback' : 'property', params: null, line: index + 1 });
      }
      ownerDepth += countBraces(codeLine);
      if (ownerDepth === 0) {
        completeClasses.add(owner);
        owner = null;
      } else if (ownerDepth < 0) {
        incompleteClasses.add(owner);
        owner = null;
      }
    }
  }
  if (owner) incompleteClasses.add(owner);
  const parsedClassCount = [...surface.values()].filter((item) => item.kind === 'class').length;
  const sourceLineCount = lines.length;
  const parseable = masked.terminated
    && sourceClassCount > 0
    && parsedClassCount === sourceClassCount
    && incompleteClasses.size === 0;
  Object.defineProperty(surface, 'diagnostics', {
    value: {
      strategy: 'structural-scanner',
      parseable,
      sourceClassCount,
      parsedClassCount,
      sourceLineCount,
      completeClassCount: completeClasses.size,
      incompleteClasses: [...incompleteClasses].sort(),
    },
    enumerable: false,
  });
  Object.defineProperty(surface, 'completeClasses', { value: completeClasses, enumerable: false });
  return surface;
}

function splitJsParams(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean).map((item) => item.replace(/\s*=.*$/, ''));
}

function manifestParamCount(symbol) {
  return Array.isArray(symbol.parameters) ? symbol.parameters.length : null;
}

function compareVersions(left, right) {
  const parse = (value) => value.split('.').map((part) => Number(part));
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function normalizedSourceHash(target) {
  const normalized = target.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(Buffer.from(normalized, 'utf8')).digest('hex').toUpperCase();
}

function targetPosture(hash, runtimeVersion, baseline) {
  if (!runtimeVersion) {
    return hash === baseline.apiFileSha256
      ? 'exact-baseline-file-runtime-pending'
      : 'runtime-version-pending-surface-check';
  }
  const order = compareVersions(runtimeVersion, baseline.sdkVersion);
  if (order < 0) return 'older-version-surface-check';
  if (order > 0) return 'newer-version-baseline-surface-only';
  if (hash === baseline.apiFileSha256) return 'exact-baseline';
  return 'same-version-variant-surface-check';
}

function createBaselineManifestSurface(manifest, sourceLineCount) {
  const surface = new Map();
  const completeClasses = new Set();
  for (const symbol of manifest.symbols) {
    if (symbol.kind === 'class') completeClasses.add(symbol.fullName);
    surface.set(symbol.fullName, {
      fullName: symbol.fullName,
      kind: symbol.kind,
      params: Array.isArray(symbol.parameters) ? symbol.parameters : null,
      line: symbol.sourceLine ?? symbol.typeLine ?? null,
    });
  }
  Object.defineProperty(surface, 'diagnostics', {
    value: {
      strategy: 'baseline-manifest',
      parseable: true,
      sourceClassCount: manifest.symbols.filter((item) => item.kind === 'class').length,
      parsedClassCount: manifest.symbols.filter((item) => item.kind === 'class').length,
      sourceLineCount,
      completeClassCount: completeClasses.size,
      incompleteClasses: [],
    },
    enumerable: false,
  });
  Object.defineProperty(surface, 'completeClasses', { value: completeClasses, enumerable: false });
  return surface;
}

export function compareSdkCapabilities(args) {
  if (args.runtimeSdkVersion && !/^\d+\.\d+\.\d+$/.test(args.runtimeSdkVersion)) {
    throw new Error('runtimeSdkVersion must be an x.y.z value observed from context.getSdkVersion().');
  }
  const target = fs.readFileSync(args.targetSdk, 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'references', 'api-manifest.json'), 'utf8'));
  const featureMap = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'references', 'feature-map.json'), 'utf8'));
  const baselineInfo = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'references', 'sdk-baseline.json'), 'utf8'));
  const requested = new Set(args.symbols);
  if (args.feature) {
    const domain = featureMap.domains.find((item) => item.id === args.feature);
    if (!domain) throw new Error(`Unknown feature domain: ${args.feature}`);
    manifest.symbols
      .filter((item) => item.domains.includes(domain.id))
      .forEach((item) => requested.add(item.fullName));
  }
  const targetHash = normalizedSourceHash(target);
  const targetSurface = targetHash === baselineInfo.apiFileSha256
    ? createBaselineManifestSurface(manifest, target.split(/\r?\n/).length)
    : extractJsSurface(target);
  const surfaceDiagnostics = targetSurface.diagnostics;
  const results = [];
  for (const name of [...requested].sort()) {
    const baseline = manifest.symbols.filter((item) => item.fullName === name);
    if (!baseline.length) {
      results.push({ symbol: name, status: 'unknown', reason: 'Not found in the 3.16.0 baseline manifest.' });
      continue;
    }
    const targetSymbol = targetSurface.get(name);
    if (!targetSymbol) {
      const owner = baseline[0].owner;
      const ownerComplete = !owner || targetSurface.completeClasses.has(owner);
      results.push(surfaceDiagnostics.parseable && ownerComplete
        ? { symbol: name, status: 'missing', reason: 'Symbol is absent from the target SDK surface.' }
        : {
            symbol: name,
            status: 'unparseable',
            reason: owner && !ownerComplete
              ? `The ${owner} class was not completely parsed; absence is not proven.`
              : `The target SDK layout is unsupported by the surface parser (${surfaceDiagnostics.parsedClassCount}/${surfaceDiagnostics.sourceClassCount} class declarations parsed across ${surfaceDiagnostics.sourceLineCount} lines); absence is not proven.`,
          });
      continue;
    }
    const expectedCounts = [...new Set(baseline.map(manifestParamCount).filter((item) => item !== null))];
    if (targetSymbol.params && expectedCounts.length && !expectedCounts.includes(targetSymbol.params.length)) {
      results.push({ symbol: name, status: 'changed', reason: `Parameter count is ${targetSymbol.params.length}; baseline expects ${expectedCounts.join(' or ')}.`, targetLine: targetSymbol.line });
    } else {
      results.push({ symbol: name, status: 'surface-present', reason: 'The symbol and observable parameter count are present; runtime compatibility is not proven.', targetLine: targetSymbol.line });
    }
  }
  const staticApiHeaderVersion = target.match(/@version\s+([0-9.]+)/)?.[1] || 'unknown';
  const runtimeSdkVersion = args.runtimeSdkVersion || null;
  const payload = {
    targetVersion: runtimeSdkVersion || 'unknown',
    runtimeSdkVersion,
    staticApiHeaderVersion,
    staticHeaderMatchesRuntime: !runtimeSdkVersion || staticApiHeaderVersion === 'unknown' ? null : staticApiHeaderVersion === runtimeSdkVersion,
    staticHeaderMismatchBlocking: false,
    baselineVersion: baselineInfo.sdkVersion,
    posture: targetPosture(targetHash, runtimeSdkVersion, baselineInfo),
    limitation: 'Surface checks do not prove runtime behavior, return types, enum values, callback contracts, or WASM pairing.',
    surfaceDiagnostics,
    results,
  };
  return {
    payload,
    exitCode: results.some((item) => item.status !== 'surface-present') ? 2 : 0,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = compareSdkCapabilities(args);
  if (args.json) console.log(JSON.stringify(result.payload, null, 2));
  else for (const item of result.payload.results) console.log(`${item.status}\t${item.symbol}\t${item.reason}`);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
