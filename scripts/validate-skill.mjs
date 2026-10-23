#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCRIPT_DIR = path.join(SKILL_DIR, 'scripts');

function parseArgs(argv) {
  const args = { requireTypescript: false, features: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--tsc') args.tsc = path.resolve(argv[++index]);
    else if (value === '--require-typescript') args.requireTypescript = true;
    else if (value === '--features') {
      const featureList = argv[++index];
      if (!featureList || featureList.startsWith('--')) throw new Error('--features requires at least one domain.');
      args.features = [...new Set(featureList.split(',').map((item) => item.trim()).filter(Boolean))];
      if (!args.features.length) throw new Error('--features requires at least one domain.');
    }
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function runWorker(check, scriptPath, args) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let workerError = '';
    const worker = new Worker(pathToFileURL(scriptPath), { argv: args, stdout: true, stderr: true });
    worker.stdout.on('data', (chunk) => { stdout += chunk; });
    worker.stderr.on('data', (chunk) => { stderr += chunk; });
    worker.on('error', (error) => { workerError = error.stack || error.message; });
    worker.on('exit', (exitCode) => resolve({
      check,
      status: exitCode === 0 ? 'pass' : 'failed',
      exitCode,
      stdout: stdout.trim(),
      stderr: (workerError || stderr).trim(),
      execution: 'worker-fallback',
    }));
  });
}

async function runNode(script, args = []) {
  const scriptPath = path.join(SCRIPT_DIR, script);
  const result = spawnSync(process.execPath, [path.join(SCRIPT_DIR, script), ...args], {
    cwd: SKILL_DIR,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error?.code === 'EPERM') return runWorker(script, scriptPath, args);
  const spawnError = result.error ? `${result.error.code || 'SPAWN_ERROR'}: ${result.error.message}` : '';
  return {
    check: script,
    status: result.error ? 'tool-unavailable' : result.status === 0 ? 'pass' : 'failed',
    exitCode: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: spawnError || (result.stderr || '').trim(),
  };
}

function resolveTsc(requested) {
  const candidates = [
    requested,
    process.env.MEISHE_SKILL_TSC,
    path.join(SKILL_DIR, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(SKILL_DIR, '..', 'validation', 'tooling', 'node_modules', 'typescript', 'bin', 'tsc'),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function runtimeValidation(features) {
  if (!features.length) {
    return {
      status: 'not-run',
      scope: 'skill-distribution',
      reason: 'Target-project runtime validation is outside a Skill distribution audit. Pass --features only for an explicit capability-runtime audit.',
      required: [],
    };
  }
  const featureMap = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'references', 'feature-map.json'), 'utf8'));
  const known = new Set(featureMap.domains.map((domain) => domain.id));
  const unknown = features.filter((feature) => !known.has(feature));
  if (unknown.length) throw new Error(`Unknown feature domain: ${unknown.join(', ')}.`);
  const common = [
    'structurally complete local SDK/WASM or configured CDN runtime',
    'JavaScript/WASM runtime compatibility',
    'crossOriginIsolated and SharedArrayBuffer in each deployed environment',
    'authorization callback and requested capabilities',
    'SDK/context initialization and cleanup',
  ];
  const byFeature = {
    'integration-core': ['prescribed SDK FS roots created before internal-resource initialization'],
    'engine-lifecycle': ['project-session ownership, initialization, and cleanup'],
    'media-fs-and-weblocal': ['selected Meishe-transcoded M3U8 or WebLocal media path', 'rendered seek and media cleanup'],
    'timeline-track-clip': ['requested Timeline mutation, retained seek position, and cleanup'],
    'monitor-playback-coordinate': ['connected LiveWindow, seek/playback or coordinate result, and cleanup'],
    'video-editing': ['selected media, requested video result, rendered seek, and cleanup'],
    'audio-editing': ['selected media, requested audio result or callback, and cleanup'],
    captions: ['caption glyph rendering and any requested font/package flow'],
    stickers: ['requested sticker package/result and rendered seek'],
    'effects-transitions': ['requested effect/transition result and rendered seek'],
    'keyframes-and-animation': ['requested keyframe/animation values and rendered frames'],
    'templates-and-nested-timelines': ['template resources, created Timeline, rendered seek, and nested ownership cleanup'],
    'advanced-effects': ['requested models/materials, parameter round-trip, rendered frame, and cleanup'],
    'asset-package-management': ['requested package/license, callback result, Ready status, and temporary-file cleanup'],
    'metadata-thumbnail-waveform': ['requested metadata, thumbnail, waveform, or frame result'],
    'project-xml-and-persistence': ['project resources, round trip/restoration, rendered seek, and cleanup'],
  };
  return {
    status: 'pending-user-runtime',
    scope: 'selected-features',
    features,
    required: [...new Set([...common, ...features.flatMap((feature) => byFeature[feature] || [])])],
  };
}

async function runTypescript(tscPath) {
  const config = path.join(SCRIPT_DIR, 'validation', 'tsconfig.samples.json');
  if (!tscPath) return { check: 'typescript-samples', status: 'tool-unavailable', exitCode: null, stdout: '', stderr: 'Provide --tsc <typescript/bin/tsc> to reproduce strict sample type-checking.' };
  const result = spawnSync(process.execPath, [tscPath, '-p', config], {
    cwd: SKILL_DIR,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error?.code === 'EPERM') return runWorker('typescript-samples', tscPath, ['-p', config]);
  const spawnError = result.error ? `${result.error.code || 'SPAWN_ERROR'}: ${result.error.message}` : '';
  return {
    check: 'typescript-samples',
    status: result.error ? 'tool-unavailable' : result.status === 0 ? 'pass' : 'failed',
    exitCode: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: spawnError || (result.stderr || '').trim(),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const checks = await Promise.all([
    runNode('build-api-artifacts.mjs', ['--check']),
    runNode('validate-api-coverage.mjs'),
    runNode('validate-sample-contracts.mjs'),
    runNode('validate-editor-contracts.mjs'),
    runNode('validate-sdk-fs-contracts.mjs'),
    runNode('validate-workflow-fixtures.mjs'),
    runNode('validate-distribution.mjs'),
    runNode('check-test-resources.mjs', ['--metadata-only']),
    runTypescript(resolveTsc(args.tsc)),
  ]);
  const failed = checks.filter((check) => check.status === 'failed' || (check.check !== 'typescript-samples' && check.status === 'tool-unavailable'));
  const typescript = checks.find((check) => check.check === 'typescript-samples');
  if (args.requireTypescript && typescript.status !== 'pass') failed.push(typescript);
  const payload = {
    status: failed.length ? 'failed' : typescript.status === 'pass' ? 'pass' : 'partial',
    staticChecks: checks,
    runtimeValidation: runtimeValidation(args.features),
  };
  console.log(JSON.stringify(payload, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
