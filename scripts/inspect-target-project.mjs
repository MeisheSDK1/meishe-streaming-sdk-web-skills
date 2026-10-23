#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compareDirectories, inspectRuntimeDirectory } from './install-runtime.mjs';
import { compareSdkCapabilities } from './compare-sdk-capabilities.mjs';

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const EXCLUDED_DIRS = new Set(['.git', '.svn', '.hg', 'node_modules', 'dist', 'build', 'coverage', '.cache', '.next', '.nuxt']);
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.html', '.css', '.scss', '.sass', '.less', '.json', '.yaml', '.yml']);
const UI_DEPENDENCIES = ['antd', '@mui/material', '@chakra-ui/react', '@mantine/core', 'element-plus', 'vuetify', 'naive-ui', '@arco-design/web-react', '@douyinfe/semi-ui'];
const FEATURE_MAP = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'references', 'feature-map.json'), 'utf8'));
const RECIPE_PRESETS = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'references', 'recipe-presets.json'), 'utf8')).recipes;
const SDK_BASELINE = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'references', 'sdk-baseline.json'), 'utf8'));
const QUERY_ONLY_SDK = path.join(SKILL_DIR, 'references', 'NvStreamingSdk.js');
const FEATURE_ALIASES = new Map(Object.entries(FEATURE_MAP.aliases || {}));
const MEDIA_STRATEGIES = ['meishe-transcoded-m3u8', 'weblocal', 'mixed'];
const MEDIA_INPUT_KINDS = ['meishe-m3u8', 'backend-contract', 'local-file'];
const TARGET_SDK_PROVENANCE = ['configured-runtime-response', 'customer-confirmed-delivery'];
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

function resolveFeature(value) {
  const normalized = (value || 'integration-core').toLowerCase();
  const canonical = FEATURE_ALIASES.get(normalized) || normalized;
  return FEATURE_MAP.domains.some((domain) => domain.id === canonical) ? canonical : null;
}

export function parseArgs(argv) {
  const args = { listFeatures: false, listRecipes: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--project') args.project = path.resolve(argv[++index]);
    else if (value === '--feature') args.feature = argv[++index];
    else if (value === '--features') {
      const featureList = argv[++index];
      if (!featureList || featureList.startsWith('--')) throw new Error('--features requires at least one domain.');
      args.features = featureList.split(',').map((item) => item.trim()).filter(Boolean);
      if (!args.features.length) throw new Error('--features requires at least one domain.');
    }
    else if (value === '--runtime-source') args.runtimeSource = path.resolve(argv[++index]);
    else if (value === '--recipe') args.recipe = argv[++index];
    else if (value === '--authorization-mode') args.authorizationMode = argv[++index];
    else if (value === '--media-strategy') args.mediaStrategy = argv[++index];
    else if (value === '--media-input-kind') {
      const inputKinds = argv[++index];
      if (!inputKinds || inputKinds.startsWith('--')) throw new Error('--media-input-kind requires at least one kind.');
      args.mediaInputKinds = inputKinds.split(',').map((item) => item.trim()).filter(Boolean);
    }
    else if (value === '--required-symbols') {
      const symbols = argv[++index];
      if (!symbols || symbols.startsWith('--')) throw new Error('--required-symbols requires at least one SDK symbol.');
      args.requiredSymbols = symbols.split(',').map((item) => item.trim()).filter(Boolean);
    }
    else if (value === '--runtime-sdk-version') args.runtimeSdkVersion = argv[++index];
    else if (value === '--target-sdk') args.targetSdk = path.resolve(argv[++index]);
    else if (value === '--target-sdk-provenance') args.targetSdkProvenance = argv[++index];
    else if (value === '--list-features') args.listFeatures = true;
    else if (value === '--list-recipes') args.listRecipes = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (args.listFeatures || args.listRecipes) return args;
  if (!args.project) throw new Error('Provide --project <directory>.');
  if (args.authorizationMode !== undefined && !['required', 'skip'].includes(args.authorizationMode)) {
    throw new Error('--authorization-mode must be required or skip.');
  }
  if (args.mediaStrategy !== undefined && !MEDIA_STRATEGIES.includes(args.mediaStrategy)) {
    throw new Error(`--media-strategy must be one of: ${MEDIA_STRATEGIES.join(', ')}.`);
  }
  if (args.mediaInputKinds?.some((kind) => !MEDIA_INPUT_KINDS.includes(kind))) {
    throw new Error(`--media-input-kind must contain only: ${MEDIA_INPUT_KINDS.join(', ')}.`);
  }
  if (args.runtimeSdkVersion !== undefined && !VERSION_PATTERN.test(args.runtimeSdkVersion)) {
    throw new Error('--runtime-sdk-version must be the x.y.z value actually returned by context.getSdkVersion().');
  }
  if (args.targetSdkProvenance !== undefined && !TARGET_SDK_PROVENANCE.includes(args.targetSdkProvenance)) {
    throw new Error(`--target-sdk-provenance must be one of: ${TARGET_SDK_PROVENANCE.join(', ')}.`);
  }
  if (args.targetSdkProvenance && !args.targetSdk) {
    throw new Error('--target-sdk-provenance requires --target-sdk.');
  }
  if (!fs.existsSync(args.project) || !fs.statSync(args.project).isDirectory()) throw new Error(`Project directory does not exist: ${args.project}`);
  if (args.runtimeSource && (!fs.existsSync(args.runtimeSource) || !fs.statSync(args.runtimeSource).isDirectory())) {
    throw new Error(`Runtime source directory does not exist: ${args.runtimeSource}`);
  }
  if (args.targetSdk && (!fs.existsSync(args.targetSdk) || !fs.statSync(args.targetSdk).isFile())) {
    throw new Error(`Target SDK file does not exist: ${args.targetSdk}`);
  }
  if (args.targetSdk && fs.realpathSync(args.targetSdk) === fs.realpathSync(QUERY_ONLY_SDK)) {
    throw new Error('The bundled query-only NvStreamingSdk.js cannot be used as a customer target SDK.');
  }
  if (args.feature && args.features) throw new Error('Use either --feature or --features, not both.');
  if (args.recipe && (args.feature || args.features)) throw new Error('Use --recipe instead of --feature or --features.');
  const recipe = args.recipe ? RECIPE_PRESETS.find((item) => item.id === args.recipe) : null;
  if (args.recipe && !recipe) throw new Error(`Unknown recipe: ${args.recipe}. Run with --list-recipes.`);
  const requested = recipe?.features || args.features || [args.feature || 'integration-core'];
  args.features = [...new Set(requested.map((feature) => {
    const resolved = resolveFeature(feature);
    if (!resolved) throw new Error(`Unknown feature domain: ${feature}. Run with --list-features.`);
    return resolved;
  }))];
  args.feature = args.features[0];
  if (recipe) args.requiredSymbols = [...new Set([...recipe.requiredSymbols, ...(args.requiredSymbols || [])])];
  return args;
}

function walk(root) {
  const files = [];
  const rootReal = fs.realpathSync(root);
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name) && !fs.existsSync(path.join(fullPath, 'SKILL.md'))) visit(fullPath);
      } else {
        const extension = path.extname(entry.name).toLowerCase();
        if (extension === '.wasm' || (TEXT_EXTENSIONS.has(extension) && fs.statSync(fullPath).size <= 2_000_000)) {
          const real = fs.realpathSync(fullPath);
          if (real === rootReal || real.startsWith(`${rootReal}${path.sep}`)) files.push(fullPath);
        }
      }
    }
  };
  visit(root);
  return files.sort();
}

function readSafe(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

// Preserve string literals because structured configuration commonly uses string
// keys, while removing comments that must never count as runtime evidence.
export function stripComments(source) {
  let result = '';
  let quote = null;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quote) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      result += char;
      continue;
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      result += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length - 1 && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
      index += 1;
      result += ' ';
      continue;
    }
    result += char;
  }
  return result;
}

function relative(root, file) {
  return file ? path.relative(root, file).replace(/\\/g, '/') : null;
}

function firstEvidence(root, entries, matcher) {
  const match = entries.find((entry) => matcher(entry.code, entry.file));
  return match ? relative(root, match.file) : null;
}

function firstPersistedMediaDecision(root, entries, valuePattern) {
  const keyPattern = '(?:mediaStrategy|mediaSourceType|mediaSourceKind|sourceType|sourceKind|sourceStrategy)';
  return firstEvidence(root, entries, (code, file) => {
    if (file.endsWith('.d.ts')) return false;
    const extension = path.extname(file).toLowerCase();
    if (extension === '.json') {
      return new RegExp(`["']?${keyPattern}["']?\\s*:\\s*["']${valuePattern}["']`, 'i').test(code);
    }
    if (['.yaml', '.yml'].includes(extension)) {
      return new RegExp(`^\\s*["']?${keyPattern}["']?\\s*:\\s*(?:["']${valuePattern}["']|${valuePattern})(?:\\s|$)`, 'im').test(code);
    }
    const assignedVariable = new RegExp(`\\b(?:const|let|var)\\s+[A-Za-z_$][\\w$]*${keyPattern}\\s*=\\s*["']${valuePattern}["']`, 'i');
    const assignedProperty = new RegExp(`\\.\\s*${keyPattern}\\s*=\\s*["']${valuePattern}["']`, 'i');
    return assignedVariable.test(code) || assignedProperty.test(code);
  });
}

function packageInstallCommand(packageManager, packageName) {
  if (packageManager === 'pnpm') return `pnpm add ${packageName}`;
  if (packageManager === 'yarn') return `yarn add ${packageName}`;
  if (packageManager === 'bun') return `bun add ${packageName}`;
  return `npm install ${packageName}`;
}

function commandArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function detectPackageManager(project) {
  if (fs.existsSync(path.join(project, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(project, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(project, 'bun.lock')) || fs.existsSync(path.join(project, 'bun.lockb'))) return 'bun';
  return 'npm';
}

function condition(id, status, critical, reason, action, options = {}) {
  const requiresUserApproval = status === 'approval-required' || Boolean(options.requiresUserApproval || options.requiresApproval);
  return {
    id,
    status,
    critical,
    reason,
    action,
    evidence: options.evidence || null,
    evidenceKind: options.evidenceKind || 'none',
    confidence: options.confidence || 'low',
    evidencePhase: options.evidencePhase || 'static',
    validationPending: options.validationPending || [],
    requiresApproval: requiresUserApproval,
    requiresUserApproval,
    approvalKind: options.approvalKind || null,
    ...(options.details || {}),
  };
}

function buildGateDisclosure(conditions, { requiresMedia, dependencies, packageManager }) {
  const conditionalFollowOns = [];
  const mediaDecisionPending = conditions.some((item) => item.id === 'media-strategy' && item.status === 'decision-required');
  if (requiresMedia && mediaDecisionPending) {
    const parserAvailable = Boolean(dependencies.mediabunny);
    const webLocalRequirements = [
      {
        id: 'weblocal-parser',
        status: parserAvailable ? 'available' : 'approval-required',
        requirement: parserAvailable
          ? `Reuse declared mediabunny ${dependencies.mediabunny}.`
          : `Install mediabunny with ${packageInstallCommand(packageManager, 'mediabunny')}; request explicit approval only after WebLocal is selected.`,
      },
      {
        id: 'media-validation-input',
        status: 'missing-external',
        requirement: 'Provide a supported local validation file and accept WebLocal format, resolution, memory, and session-only registration limits.',
      },
    ];
    conditionalFollowOns.push(
      {
        when: 'media-strategy=meishe-transcoded-m3u8',
        gates: [{
          id: 'media-validation-input',
          status: 'missing-external',
          requirement: 'Provide actual Meishe-transcoded M3U8 output or its backend contract; ordinary HLS is not interchangeable.',
        }],
        runtimeValidations: ['meishe-transcoding-contract', 'sdk-file-info', 'rendered-seek', 'cross-segment-playback'],
      },
      {
        when: 'media-strategy=weblocal',
        gates: webLocalRequirements,
        runtimeValidations: ['weblocal-metadata', 'file-registration', 'sdk-file-info', 'rendered-seek', 'playback', 'resource-cleanup'],
      },
      {
        when: 'media-strategy=mixed',
        gates: [
          ...webLocalRequirements,
          {
            id: 'media-validation-input',
            status: 'missing-external',
            requirement: 'Also provide actual Meishe-transcoded M3U8 output or its backend contract.',
          },
        ],
        runtimeValidations: ['weblocal-metadata', 'file-registration', 'meishe-transcoding-contract', 'sdk-file-info', 'rendered-seek', 'cross-segment-playback', 'resource-cleanup'],
      },
    );
  }

  if (conditions.some((item) => item.id === 'authorization-flow' && item.status === 'decision-required')) {
    conditionalFollowOns.push(
      {
        when: 'authorization-mode=required',
        gates: [{
          id: 'authorization-input',
          status: 'missing-external',
          requirement: 'Provide the project-accessible customer authentication URL without logging or persisting it in task output.',
        }],
        runtimeValidations: ['authorization-callback-result', 'requested-capability-authorization'],
      },
      {
        when: 'authorization-mode=skip',
        gates: [],
        runtimeValidations: ['watermark-impact', 'requested-capability-authorization'],
      },
    );
  }

  const idsFor = (status) => conditions.filter((item) => item.status === status).map((item) => item.id);
  return {
    timing: 'before-first-gate-specific-question',
    scope: 'all-known-and-conditionally-applicable-gates',
    disclosureIsApproval: false,
    stagingPolicy: {
      disclosure: 'Disclose all current gates and conditional follow-ons together after read-only preflight.',
      decisions: 'Request unresolved policy and strategy decisions without hiding unrelated prerequisites.',
      approvals: 'Request mutation approval only after the required static checks pass.',
      execution: 'Apply only explicitly approved mutations, then rerun inspection and runtime validation.',
    },
    currentGateIds: conditions.map((item) => item.id),
    decisionGateIds: idsFor('decision-required'),
    approvalGateIds: idsFor('approval-required'),
    externalInputGateIds: idsFor('missing-external'),
    runtimeGateIds: idsFor('runtime-required'),
    conditionalFollowOns,
    pendingRuntimeValidations: [...new Set(conditions.flatMap((item) => item.validationPending))],
  };
}

function sameFile(left, right) {
  return Boolean(left && right && fs.realpathSync(left) === fs.realpathSync(right));
}

function normalizedFileSha256(file) {
  const source = readSafe(file).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(Buffer.from(source, 'utf8')).digest('hex').toUpperCase();
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

function runtimeVersionPosture(runtimeVersion) {
  if (!runtimeVersion) return 'runtime-version-pending';
  const order = compareVersions(runtimeVersion, SDK_BASELINE.sdkVersion);
  if (order < 0) return 'older-runtime-surface-check';
  if (order > 0) return 'newer-runtime-baseline-surface-only';
  return 'exact-runtime-baseline';
}

export function inspectProject(args, cache = {}) {
  if (args.targetSdk && path.resolve(args.targetSdk) === path.resolve(QUERY_ONLY_SDK)) {
    throw new Error('The bundled query-only NvStreamingSdk.js cannot be used as a customer target SDK.');
  }
  if (args.runtimeSdkVersion && !VERSION_PATTERN.test(args.runtimeSdkVersion)) {
    throw new Error('runtimeSdkVersion must be the x.y.z value actually returned by context.getSdkVersion().');
  }
  if (args.mediaStrategy && !MEDIA_STRATEGIES.includes(args.mediaStrategy)) {
    throw new Error(`mediaStrategy must be one of: ${MEDIA_STRATEGIES.join(', ')}.`);
  }
  if (args.mediaInputKinds?.some((kind) => !MEDIA_INPUT_KINDS.includes(kind))) {
    throw new Error(`mediaInputKinds must contain only: ${MEDIA_INPUT_KINDS.join(', ')}.`);
  }
  if (args.targetSdkProvenance && !TARGET_SDK_PROVENANCE.includes(args.targetSdkProvenance)) {
    throw new Error(`targetSdkProvenance must be one of: ${TARGET_SDK_PROVENANCE.join(', ')}.`);
  }
  if (args.targetSdkProvenance && !args.targetSdk) {
    throw new Error('targetSdkProvenance requires targetSdk.');
  }
  const files = cache.files || (cache.files = walk(args.project));
  const installedRuntime = path.join(args.project, 'public', 'wasm');
  const installedInspection = 'installedInspection' in cache
    ? cache.installedInspection
    : (cache.installedInspection = fs.existsSync(installedRuntime) && fs.statSync(installedRuntime).isDirectory()
      ? inspectRuntimeDirectory(installedRuntime)
      : null);
  const sourceInspection = 'sourceInspection' in cache
    ? cache.sourceInspection
    : (cache.sourceInspection = args.runtimeSource ? inspectRuntimeDirectory(args.runtimeSource) : null);
  const sourceValid = Boolean(sourceInspection && sourceInspection.errors.length === 0);
  const installedStructurallyComplete = Boolean(installedInspection && installedInspection.errors.length === 0);
  const runtimeComparison = 'runtimeComparison' in cache
    ? cache.runtimeComparison
    : (cache.runtimeComparison = sourceValid && installedStructurallyComplete
      ? compareDirectories(args.runtimeSource, installedRuntime)
      : null);
  const packagePath = path.join(args.project, 'package.json');
  let packageJson = cache.packageJson;
  if (!packageJson && fs.existsSync(packagePath)) {
    try {
      packageJson = cache.packageJson = JSON.parse(readSafe(packagePath));
    } catch (error) {
      throw new Error(`Invalid package.json: ${error.message}`);
    }
  }
  packageJson ||= (cache.packageJson = {});
  const dependencies = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
  const entries = cache.entries || (cache.entries = files
    .filter((file) => path.extname(file).toLowerCase() !== '.wasm' && file !== installedRuntime && !file.startsWith(`${installedRuntime}${path.sep}`))
    .map((file) => ({ file, code: stripComments(readSafe(file)) })));
  const sdkFile = installedStructurallyComplete ? path.join(installedRuntime, installedInspection.sdkApi) : null;
  const wasmFile = installedStructurallyComplete ? path.join(installedRuntime, installedInspection.wasmFiles[0]) : null;
  const sdkConfig = firstEvidence(args.project, entries, (code) =>
    /(?:sdk[_-]?(?:root|cdn[_-]?url|url))\s*[:=]\s*['"][^'"]+['"]/i.test(code) ||
    /['"](?:https?:)?\/\/[^'"]*NvStreamingSdk\.js(?:\?[^'"]*)?['"]/i.test(code));
  const wasmConfig = firstEvidence(args.project, entries, (code) => /(?:wasm[_-]?(?:root|path|url))\s*[:=]\s*['"][^'"]+['"]/i.test(code));
  const loaderCall = firstEvidence(args.project, entries, (code) => /\.loadEmscriptenModule\s*\(/.test(code));
  const contextCall = firstEvidence(args.project, entries, (code) => /\bnvsGetStreamingContextInstance\s*\(/.test(code));
  const internalResourcesCall = firstEvidence(args.project, entries, (code) => /\.initInternalResources\s*\(/.test(code));
  const sdkCall = contextCall || loaderCall;
  const loaderImport = firstEvidence(args.project, entries, (code) => /(?:from\s*|import\s*\()\s*['"]meishewasmloader['"]/.test(code));
  const canvasEvidence = firstEvidence(args.project, entries, (code) => /<canvas\b|\.createLiveWindow\s*\(/i.test(code));
  const coopEvidence = firstEvidence(args.project, entries, (code) => /['"]Cross-Origin-Opener-Policy['"]\s*:\s*['"]same-origin['"]/i.test(code));
  const coepEvidence = firstEvidence(args.project, entries, (code) => /['"]Cross-Origin-Embedder-Policy['"]\s*:\s*['"](?:require-corp|credentialless)['"]/i.test(code));
  const headerEvidence = coopEvidence && coepEvidence ? [...new Set([coopEvidence, coepEvidence])] : null;
  const multithreadEnabled = firstEvidence(args.project, entries, (code) => /enableMultithreadDecoding\s*:\s*true\b/.test(code));
  const multithreadDisabled = firstEvidence(args.project, entries, (code) => /enableMultithreadDecoding\s*:\s*false\b/.test(code));
  const sdkDeclarationPattern = /\b(?:class|interface|namespace|enum)\s+(?:NvsStreamingContext|NvsTimeline)\b|\b(?:function|const|let|var)\s+nvsGetStreamingContextInstance\b/;
  const typeEvidence = files.find((file) => file.endsWith('.d.ts') && sdkDeclarationPattern.test(stripComments(readSafe(file))));
  const webLocalEvidence = firstEvidence(args.project, entries, (code, file) => !file.endsWith('.d.ts') && /\bregisterLocalFile\s*\(|\.weblocal\b/i.test(code));
  const persistedWebLocalEvidence = firstPersistedMediaDecision(args.project, entries, 'weblocal');
  const persistedM3u8Evidence = firstPersistedMediaDecision(args.project, entries, '(?:meishe-)?transcoded-m3u8');
  const m3u8CandidateEvidence = firstEvidence(args.project, entries, (code, file) => !file.endsWith('.d.ts') && /\.m3u8(?:\b|['"?])/i.test(code));
  const authRequiredEvidence = firstEvidence(args.project, entries, (code) => /\.verifySdkLicenseFile(?:WithExtraUserData)?\s*\(/.test(code));
  const authUrlEvidence = firstEvidence(args.project, entries, (code) =>
    /\b(?:MEISHE[_-]?)?(?:AUTH|LICENSE)[_-]?URL\b|\b(?:auth(?:entication)?|license)(?:Url|Address|Endpoint)\b/i.test(code));
  const captionFontEvidence = firstEvidence(args.project, entries, (code) =>
    /\.registerFontByFilePath\s*\(/.test(code) && /\.setFontByFilePath\s*\(/.test(code));
  const completeInitializationEvidence = loaderCall && contextCall && internalResourcesCall
    ? [...new Set([loaderCall, contextCall, internalResourcesCall])]
    : null;
  const packageManager = cache.packageManager || (cache.packageManager = detectPackageManager(args.project));
  const runtimeDestination = path.join(args.project, 'public', 'wasm');
  const runtimeInstallCommand = args.runtimeSource
    ? `node ${commandArg(path.join(SKILL_DIR, 'scripts', 'install-runtime.mjs'))} --source ${commandArg(args.runtimeSource)} --project ${commandArg(args.project)} --user-confirmed-copy`
    : null;
  const viteConfig = files.find((file) => /^vite\.config\.(?:js|mjs|cjs|ts|mts|cts)$/i.test(path.basename(file)));
  const webpackConfig = files.find((file) => /^webpack\.config\.(?:js|mjs|cjs|ts)$/i.test(path.basename(file)));
  const usesTypeScript = files.some((file) => /^tsconfig(?:\.[^.]+)?\.json$/i.test(path.basename(file)) || /\.(?:ts|tsx)$/i.test(file));
  const proposedIsolationConfig = viteConfig || webpackConfig || (dependencies.vite
    ? path.join(args.project, usesTypeScript ? 'vite.config.ts' : 'vite.config.js')
    : dependencies.webpack ? path.join(args.project, 'webpack.config.js') : null);
  const sourceSdkFile = sourceValid ? path.join(args.runtimeSource, sourceInspection.sdkApi) : null;
  const targetSdkFile = args.targetSdk || sdkFile || sourceSdkFile;
  const targetSdkOrigin = !targetSdkFile
    ? null
    : sameFile(targetSdkFile, sdkFile)
      ? 'installed-runtime'
      : sameFile(targetSdkFile, sourceSdkFile)
        ? 'runtime-source'
        : 'independent-target';
  const staticApiHeaderVersion = cache.staticApiHeaderVersion || (cache.staticApiHeaderVersion = targetSdkFile ? readSafe(targetSdkFile).match(/@version\s+([0-9.]+)/)?.[1] || 'unknown' : 'unknown');
  const runtimeSdkVersion = args.runtimeSdkVersion || null;
  const requiredSymbols = [...new Set(args.requiredSymbols || [])];
  const mediaInputKinds = [...new Set(args.mediaInputKinds || [])];
  const requiresMonitor = /monitor|playback|livewindow|timeline|caption|sticker|effect|video|audio/.test(args.feature.toLowerCase());
  const requiresMedia = /media|video|audio|timeline|template|project-xml/.test(args.feature.toLowerCase());
  const uiDesign = cache.uiDesign || (cache.uiDesign = inspectUiDesign(args.project, files, entries, dependencies));

  const configuredRuntime = Boolean(sdkConfig && loaderCall);
  const sdkAvailable = Boolean(sdkFile || sdkConfig);
  const wasmAvailable = Boolean(wasmFile || wasmConfig || configuredRuntime);
  if (runtimeSdkVersion && !installedStructurallyComplete && !configuredRuntime) {
    throw new Error('A runtime SDK version cannot be accepted until an installed or configured runtime is detected.');
  }
  const conditions = [];
  if (runtimeComparison && !runtimeComparison.identical) {
    conditions.push(condition('runtime-installation', 'unknown', true,
      'The installed public/wasm directory differs from the supplied customer delivery.',
      'Stop before copying; ask the user how to resolve the conflicting runtime directory.', {
        evidence: runtimeComparison.differences.slice(0, 10),
        evidenceKind: 'content-hash-conflict',
        confidence: 'high',
      }));
  } else if (installedStructurallyComplete) {
    conditions.push(condition('runtime-installation', 'available', true,
      runtimeComparison ? 'public/wasm exactly matches the supplied customer delivery.' : 'A structurally complete runtime candidate is installed in public/wasm.',
      'Load /wasm/NvStreamingSdk.js and use /wasm/ as the loader root.', {
        evidence: 'public/wasm',
        evidenceKind: runtimeComparison ? 'content-hash-match' : 'installed-runtime',
        confidence: runtimeComparison ? 'high' : 'medium',
        validationPending: runtimeComparison ? ['browser-runtime-loading'] : ['customer-delivery-provenance', 'browser-runtime-loading'],
      }));
  } else if (configuredRuntime) {
    conditions.push(condition('runtime-installation', 'available', true,
      'The existing project configures and loads its SDK JavaScript/WASM runtime by URL; the URL may be local or CDN-hosted.',
      'Reuse the existing runtime URL and loading flow without relocating it to public/wasm.', {
        evidence: [...new Set([sdkConfig, wasmConfig, loaderCall].filter(Boolean))],
        evidenceKind: 'configured-runtime',
        confidence: 'high',
        validationPending: ['configured-url-response', 'browser-runtime-loading'],
      }));
  } else if (sourceValid) {
    conditions.push(condition('runtime-installation', 'approval-required', true,
      'A complete customer runtime source was supplied, but public/wasm is not installed.',
      'Explain the source, destination, and files to be copied; wait for explicit user confirmation in the conversation, then run install-runtime.mjs and rerun this inspector.', {
        evidence: args.runtimeSource,
        evidenceKind: 'customer-runtime-source',
        confidence: 'high',
        requiresUserApproval: true,
        approvalKind: 'project-filesystem-mutation',
        details: {
          source: args.runtimeSource,
          destination: runtimeDestination,
          files: sourceInspection.files,
          fileCount: sourceInspection.files.length,
          command: runtimeInstallCommand,
          conflictPolicy: 'Accept an identical destination; reject incomplete, symlinked, or conflicting content without overwrite.',
        },
      }));
  } else {
    conditions.push(condition('runtime-installation', 'missing-external', true,
      sourceInspection ? `The supplied runtime source is incomplete: ${sourceInspection.errors.join(' ')}` : 'No complete customer runtime source, local installation, or configured runtime URL was found.',
      'Ask for the complete customer SDK delivery directory or its project-approved CDN/runtime URL.'));
  }
  if (sdkAvailable) {
    conditions.push(condition('sdk-api', 'available', true, 'An SDK API file or explicit SDK root configuration was detected.', 'Use only the customer-approved SDK delivery.', {
      evidence: sdkFile ? relative(args.project, sdkFile) : sdkConfig,
      evidenceKind: sdkFile ? 'actual-file' : 'structured-config',
      confidence: sdkFile ? 'high' : 'medium',
    }));
  } else if (sourceValid) {
    conditions.push(condition('sdk-api', 'approval-required', true, 'NvStreamingSdk.js exists in the supplied customer delivery but is not installed in public/wasm.', 'Resolve the runtime-installation approval before copying the complete delivery.', {
      evidence: args.runtimeSource,
      evidenceKind: 'customer-runtime-source',
      confidence: 'high',
      requiresUserApproval: true,
      approvalKind: 'project-filesystem-mutation',
    }));
  } else if (sdkCall || sdkConfig) {
    conditions.push(condition('sdk-api', 'unknown', true, 'SDK calls exist, but no SDK file or explicit SDK root was found.', 'Ask for the customer-approved SDK JavaScript/root.', {
      evidence: sdkCall || sdkConfig,
      evidenceKind: 'source-call',
      confidence: 'medium',
    }));
  } else {
    conditions.push(condition('sdk-api', 'missing-external', true, 'No customer SDK API file or root was detected.', 'Ask for the customer-approved SDK JavaScript/root.'));
  }

  if (targetSdkFile) {
    const independentlySupplied = targetSdkOrigin === 'independent-target';
    const provenanceAttested = independentlySupplied && Boolean(args.targetSdkProvenance);
    conditions.push(condition('target-sdk-runtime-provenance', independentlySupplied && !provenanceAttested ? 'decision-required' : 'available', true,
      independentlySupplied
        ? provenanceAttested
          ? `The caller attests that the independent target SDK is bound to the configured runtime by ${args.targetSdkProvenance}.`
          : 'The independent target SDK file is not yet proven to be the JavaScript delivered by the configured runtime.'
        : `The inspected SDK file comes directly from the ${targetSdkOrigin}.`,
      independentlySupplied
        ? provenanceAttested
          ? 'Retain the configured URL/response evidence and validate the observed runtime version and requested behavior in the browser.'
          : 'Obtain the configured SDK URL response or explicit customer confirmation that this exact file is the deployed delivery, then rerun with --target-sdk-provenance.'
        : 'Use this runtime-bound file for the static capability comparison.', {
        evidence: independentlySupplied ? args.targetSdk : relative(args.project, targetSdkFile) || targetSdkFile,
        evidenceKind: independentlySupplied
          ? provenanceAttested ? 'caller-attested-runtime-provenance' : 'independent-target-file'
          : targetSdkOrigin === 'installed-runtime' ? 'installed-runtime-file' : 'customer-runtime-source',
        confidence: independentlySupplied ? provenanceAttested && args.targetSdkProvenance === 'configured-runtime-response' ? 'high' : 'medium' : 'high',
        validationPending: independentlySupplied && provenanceAttested ? ['javascript-wasm-runtime-compatibility'] : [],
        requiresUserApproval: independentlySupplied && !provenanceAttested,
        approvalKind: independentlySupplied && !provenanceAttested ? 'target-sdk-provenance-decision' : null,
        details: {
          targetSdkOrigin,
          targetSdkProvenance: args.targetSdkProvenance || null,
          normalizedSha256: normalizedFileSha256(targetSdkFile),
        },
      }));
  }

  const headerMatchesRuntime = runtimeSdkVersion && staticApiHeaderVersion !== 'unknown'
    ? runtimeSdkVersion === staticApiHeaderVersion
    : null;
  conditions.push(runtimeSdkVersion
    ? condition('runtime-sdk-version', 'available', true,
      `The caller attests that context.getSdkVersion() reported ${runtimeSdkVersion}; API-header @version is non-authoritative metadata.`,
      'Use the runtime version for compatibility posture and compare every API required by the requested recipe.', {
        evidence: 'caller-attested context.getSdkVersion() result',
        evidenceKind: 'caller-attested-runtime-api-result',
        confidence: 'medium',
        evidencePhase: 'runtime',
        validationPending: headerMatchesRuntime === false ? ['static-header-metadata-mismatch'] : [],
        details: {
          baselineSdkVersion: SDK_BASELINE.sdkVersion,
          staticApiHeaderVersion,
          staticApiHeaderOrigin: targetSdkOrigin,
          runtimeSdkVersion,
          staticHeaderMatchesRuntime: headerMatchesRuntime,
          posture: runtimeVersionPosture(runtimeSdkVersion),
          staticHeaderMismatchBlocking: false,
        },
      })
    : condition('runtime-sdk-version', 'runtime-required', true,
      staticApiHeaderVersion === 'unknown'
        ? 'Static inspection found no API-header version; the actual SDK version has not been observed from the WASM-backed context.'
        : `Static inspection found API-header @version ${staticApiHeaderVersion}; it is a clue only and cannot establish the actual SDK version.`,
      'After the user-approved runtime bootstrap and before creating feature objects, call context.getSdkVersion(); pass that observed x.y.z value back with --runtime-sdk-version.', {
        evidence: staticApiHeaderVersion === 'unknown' ? undefined : relative(args.project, targetSdkFile) || targetSdkFile,
        evidenceKind: staticApiHeaderVersion === 'unknown' ? 'static-inspection' : 'api-header-version',
        confidence: staticApiHeaderVersion === 'unknown' ? 'low' : 'medium',
        validationPending: ['context-getSdkVersion'],
        details: {
          baselineSdkVersion: SDK_BASELINE.sdkVersion,
          staticApiHeaderVersion,
          staticApiHeaderOrigin: targetSdkOrigin,
          runtimeSdkVersion: null,
          posture: 'runtime-version-pending',
        },
      }));

  if (!requiredSymbols.length) {
    conditions.push(condition('api-capability-surface', 'unknown', true,
      'No complete recipe-specific SDK symbol set was supplied, so feature readiness cannot be established.',
      'Identify creation, mutation, callback, query, rollback, and cleanup symbols, then rerun with --required-symbols <a,b>.'));
  } else if (!targetSdkFile) {
    conditions.push(condition('api-capability-surface', 'missing-external', true,
      'The runtime version is known, but no inspectable official target SDK JavaScript file is available for capability comparison.',
      'Provide the customer-approved unminified SDK JavaScript with --target-sdk, or a complete customer delivery with --runtime-source, before feature implementation.', {
        details: { requiredSymbols },
      }));
  } else {
    const capabilityResult = compareSdkCapabilities({ targetSdk: targetSdkFile, runtimeSdkVersion, symbols: requiredSymbols });
    const capabilityPassed = capabilityResult.exitCode === 0;
    conditions.push(condition('api-capability-surface', capabilityPassed ? 'available' : 'unknown', true,
      capabilityPassed
        ? `Every declared recipe-specific SDK symbol is present with a compatible observable parameter count; runtime version is ${runtimeSdkVersion ? 'attested' : 'still pending'}.`
        : 'One or more declared recipe-specific SDK symbols are missing, changed, unknown, or not safely parseable.',
      capabilityPassed
        ? 'Proceed while preserving runtime behavior validations for return values, callbacks, and JavaScript/WASM pairing.'
        : 'Resolve every non-surface-present result before feature implementation; request an unminified official SDK or documentation for unparseable/unknown results.', {
        evidence: relative(args.project, targetSdkFile) || targetSdkFile,
        evidenceKind: 'sdk-surface-comparison',
        confidence: capabilityPassed ? 'high' : 'medium',
        evidencePhase: 'static',
        validationPending: capabilityPassed
          ? [...(!runtimeSdkVersion ? ['context-getSdkVersion'] : []), 'recipe-runtime-behavior']
          : [],
        details: {
          requiredSymbols,
          capabilityPosture: capabilityResult.payload.posture,
          capabilityResults: capabilityResult.payload.results,
        },
      }));
  }

  conditions.push(wasmAvailable
    ? condition('wasm-runtime', 'available', true, 'A WASM file or explicit WASM root configuration was detected.', 'Use only the WASM runtime from the customer SDK delivery.', {
      evidence: wasmFile ? relative(args.project, wasmFile) : wasmConfig || loaderCall,
      evidenceKind: wasmFile ? 'actual-file' : configuredRuntime ? 'configured-runtime' : 'structured-config',
      confidence: wasmFile ? 'high' : 'medium',
    })
    : sourceValid
      ? condition('wasm-runtime', 'approval-required', true, 'Matching WASM runtime files exist in the supplied customer delivery but are not installed in public/wasm.', 'Resolve the runtime-installation approval before copying the complete delivery.', {
        evidence: args.runtimeSource,
        evidenceKind: 'customer-runtime-source',
        confidence: 'high',
        requiresUserApproval: true,
        approvalKind: 'project-filesystem-mutation',
      })
      : condition('wasm-runtime', 'missing-external', true, 'No installed WASM runtime or complete customer delivery was detected.', 'Ask for the matching customer SDK delivery directory.'));

  if (runtimeComparison?.identical) {
    conditions.push(condition('runtime-delivery-coherence', 'available', true, 'The installed runtime content exactly matches the supplied customer delivery.', 'Reuse the installed runtime without asking for another pairing confirmation.', {
      evidence: 'public/wasm',
      evidenceKind: 'content-hash-match',
      confidence: 'high',
      validationPending: ['browser-runtime-loading'],
    }));
  } else if (installedStructurallyComplete) {
    conditions.push(condition('runtime-delivery-coherence', 'unknown', false, 'The installed JavaScript/WASM structure is coherent, but no delivery hash or runtime result proves provenance or version pairing.', 'Reuse the existing installation without asking for reconfirmation; revisit only on conflicting evidence or a concrete runtime failure.', {
      evidence: 'public/wasm',
      evidenceKind: 'installed-runtime-structure',
      confidence: 'medium',
      validationPending: ['customer-delivery-provenance', 'javascript-wasm-runtime-compatibility'],
    }));
  } else if (configuredRuntime) {
    conditions.push(condition('runtime-delivery-coherence', 'unknown', false, 'The existing project loads a configured local/CDN runtime, but static source inspection cannot prove the remote JavaScript/WASM pairing.', 'Reuse the configured flow without asking for reconfirmation and verify it in the browser.', {
      evidence: [...new Set([sdkConfig, wasmConfig, loaderCall].filter(Boolean))],
      evidenceKind: 'configured-runtime',
      confidence: 'medium',
      validationPending: ['configured-url-response', 'javascript-wasm-runtime-compatibility'],
    }));
  } else if (sourceValid) {
    conditions.push(condition('runtime-delivery-coherence', 'available', true, 'The supplied customer directory contains the required SDK API and paired JavaScript/WASM structure.', 'Install the delivery as one unit; do not ask for an additional pairing confirmation.', {
      evidence: args.runtimeSource,
      evidenceKind: 'customer-runtime-source',
      confidence: 'high',
      validationPending: ['browser-runtime-loading'],
    }));
  } else {
    conditions.push(condition('runtime-delivery-coherence', 'unknown', false, 'Runtime coherence is deferred until both SDK and WASM evidence exist.', 'Resolve the SDK and WASM gates first.'));
  }

  const declaredLoader = dependencies.meishewasmloader;
  if (declaredLoader) {
    conditions.push(condition('wasm-loader', 'available', true, 'The existing project declares meishewasmloader.', 'Reuse the declared project version; do not query npm or update it unless runtime diagnostics later identify a loader problem.', {
      evidence: 'package.json',
      evidenceKind: 'structured-config',
      confidence: 'high',
      details: { declaredVersion: declaredLoader, packageManager },
    }));
  } else {
    const installCommand = packageInstallCommand(packageManager, 'meishewasmloader');
    conditions.push(condition('wasm-loader', 'approval-required', true,
      loaderImport ? 'The project imports meishewasmloader but does not declare it.' : 'meishewasmloader is not declared.',
      `Explain the dependency and exact command (${installCommand}); wait for explicit user confirmation in the conversation before running it.`, {
        evidence: loaderImport,
        evidenceKind: loaderImport ? 'source-import' : 'none',
        confidence: loaderImport ? 'medium' : 'low',
        requiresApproval: true,
        requiresUserApproval: true,
        approvalKind: 'network-dependency-install',
        details: { declaredVersion: null, packageManager, package: 'meishewasmloader', command: installCommand, affectedFile: 'package.json and the active lockfile' },
      }));
  }

  conditions.push(condition('canvas', canvasEvidence ? 'available' : requiresMonitor ? 'provisionable' : 'unknown', false,
    canvasEvidence ? 'A Canvas or LiveWindow call was detected.' : requiresMonitor ? 'The requested domain normally needs a Canvas/LiveWindow.' : 'The requested domain does not establish a Canvas requirement.',
    canvasEvidence ? 'Reuse the existing canvas ownership.' : requiresMonitor ? 'Create and wire a project-owned Canvas before LiveWindow creation.' : 'No action unless preview is requested.', {
      evidence: canvasEvidence,
      evidenceKind: canvasEvidence ? 'source-structure' : 'none',
      confidence: canvasEvidence ? 'medium' : 'low',
    }));

  conditions.push(condition('cross-origin-isolation', headerEvidence ? 'available' : 'approval-required', true,
    headerEvidence ? 'Development/preview cross-origin isolation headers were detected; browser verification remains required.' : 'Required development/preview COOP/COEP headers were not detected.',
    headerEvidence ? 'Verify crossOriginIsolated and SharedArrayBuffer in development and preview.' : 'Explain the development/preview configuration change and production hosting requirement; wait for explicit user confirmation before editing Vite or server configuration.', {
      evidence: headerEvidence || multithreadEnabled || multithreadDisabled,
      evidenceKind: headerEvidence ? 'structured-config' : multithreadEnabled || multithreadDisabled ? 'source-config' : 'none',
      confidence: headerEvidence ? 'high' : 'medium',
      validationPending: headerEvidence ? ['development-crossOriginIsolated', 'preview-crossOriginIsolated'] : [],
      requiresUserApproval: !headerEvidence,
      approvalKind: headerEvidence ? null : 'project-configuration-mutation',
      details: {
        developmentConfigFile: proposedIsolationConfig ? relative(args.project, proposedIsolationConfig) : null,
        headers: {
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        },
        alternativeCoep: {
          value: 'credentialless',
          useOnlyAfter: 'Confirm that credentialless loading semantics match every cross-origin SDK/media resource.',
        },
        productionHostChangeRequired: true,
      },
    }));
  conditions.push(condition('production-cross-origin-isolation', 'unknown', false,
    'Static project inspection cannot prove the production host response headers.',
    'Require the production host to provide matching COOP/COEP, then verify crossOriginIsolated and SharedArrayBuffer after deployment.', {
      evidence: headerEvidence,
      evidenceKind: headerEvidence ? 'development-config-reference' : 'none',
      confidence: 'low',
      validationPending: ['production-hosting-headers', 'production-crossOriginIsolated'],
    }));

  conditions.push(condition('types', typeEvidence ? 'available' : 'unknown', false,
    typeEvidence ? 'SDK type declarations were detected.' : 'No project-owned SDK declarations were detected; declarations are optional until the implementation actually needs them.',
    typeEvidence ? 'Keep the existing project type ownership.' : 'Do not copy declarations during preflight. If implementation later needs them, first establish exact 3.16.0 runtime compatibility and request explicit confirmation for that separate mutation.', {
      evidence: typeEvidence ? relative(args.project, typeEvidence) : null,
      evidenceKind: typeEvidence ? 'actual-file' : 'none',
      confidence: typeEvidence ? 'high' : 'low',
      validationPending: typeEvidence ? [] : ['types-required-by-implementation'],
    }));
  if (authRequiredEvidence) {
    conditions.push(condition('authorization-flow', 'available', true,
      'An existing verifySdkLicenseFile authorization flow was detected without reading any secret value.',
      'Reuse the existing flow and validate its runtime result when exercising the requested feature.', {
        evidence: authRequiredEvidence,
        evidenceKind: 'source-call',
        confidence: 'high',
        validationPending: ['authorization-callback-result', 'requested-capability-authorization'],
      }));
  } else if (completeInitializationEvidence) {
    conditions.push(condition('authorization-flow', 'available', true,
      'The existing project has a complete SDK loading, context creation, and internal-resource initialization flow.',
      'Preserve the project initialization flow and do not request a separate authorization decision for this feature integration.', {
        evidence: completeInitializationEvidence,
        evidenceKind: 'existing-initialization',
        confidence: 'high',
        validationPending: ['authorization-policy-inherited', 'requested-capability-authorization'],
      }));
  } else if (authUrlEvidence) {
    conditions.push(condition('authorization-flow', 'provisionable', true,
      'A project authentication URL reference was detected without reading its value.',
      'Use the existing project reference when implementing verifySdkLicenseFile and its result callback.', {
        evidence: authUrlEvidence,
        evidenceKind: 'source-config',
        confidence: 'medium',
        validationPending: ['authorization-callback-result', 'requested-capability-authorization'],
      }));
  } else if (args.authorizationMode === 'skip') {
    conditions.push(condition('authorization-flow', 'available', true,
      'The caller attests that the customer accepted the impact and chose to skip SDK authorization.',
      'Record the confirmation without logging an authentication URL.', {
        evidence: 'caller-attested customer authorization decision',
        evidenceKind: 'caller-attested-user-decision',
        confidence: 'medium',
        validationPending: ['watermark-impact', 'requested-capability-authorization'],
      }));
  } else if (args.authorizationMode === 'required') {
    conditions.push(condition('authorization-flow', 'missing-external', true,
      'The caller attests that the customer requires authorization, but no authorization flow was detected.',
      'Request the customer project authentication URL and implement the callback/retry flow without logging the URL.', {
        evidence: 'caller-attested customer authorization decision',
        evidenceKind: 'caller-attested-user-decision',
        confidence: 'medium',
      }));
  } else {
    conditions.push(condition('authorization-flow', 'decision-required', true,
      'No complete SDK initialization, verifySdkLicenseFile call, authentication URL reference, or explicit customer decision was detected.',
      'Explain watermark/licensed-capability impact and ask the customer to choose required or skip; pass --authorization-mode only after that explicit answer.', {
        requiresUserApproval: true,
        approvalKind: 'authorization-policy-decision',
      }));
  }

  const selectedMediaStrategies = args.mediaStrategy === 'mixed'
    ? ['weblocal', 'meishe-transcoded-m3u8']
    : args.mediaStrategy ? [args.mediaStrategy] : [];
  const confirmedWebLocalEvidence = webLocalEvidence || persistedWebLocalEvidence;
  const confirmedM3u8Evidence = persistedM3u8Evidence;
  if (confirmedWebLocalEvidence || confirmedM3u8Evidence || m3u8CandidateEvidence || selectedMediaStrategies.length) {
    const detectedMediaStrategies = [
      confirmedWebLocalEvidence ? 'weblocal' : null,
      confirmedM3u8Evidence ? 'meishe-transcoded-m3u8' : null,
    ].filter(Boolean);
    const explicitSelection = selectedMediaStrategies.length > 0;
    const unconfirmedM3u8Candidate = Boolean(m3u8CandidateEvidence && !confirmedM3u8Evidence && !explicitSelection);
    const activeMediaStrategies = explicitSelection
      ? selectedMediaStrategies
      : unconfirmedM3u8Candidate
        ? [...new Set([...detectedMediaStrategies, 'meishe-transcoded-m3u8'])]
        : detectedMediaStrategies;
    const mixed = activeMediaStrategies.length === 2;
    conditions.push(condition('media-strategy', unconfirmedM3u8Candidate ? 'decision-required' : 'available', requiresMedia,
      explicitSelection
        ? `The caller attests that the customer selected ${args.mediaStrategy}; mixed means both M3U8 and WebLocal remain active.`
        : mixed
          ? 'Both a confirmed WebLocal path and an m3u8-looking candidate were detected; the candidate still needs customer confirmation as Meishe-transcoded output.'
          : confirmedWebLocalEvidence
            ? 'An existing WebLocal path or persisted WebLocal strategy discriminator was detected.'
            : confirmedM3u8Evidence
              ? 'A persisted Meishe-transcoded M3U8 strategy discriminator was detected.'
              : 'An m3u8-looking media path was detected, but static inspection cannot prove it was produced by Meishe transcoding.',
      mixed
        ? unconfirmedM3u8Candidate
          ? 'Preserve the existing WebLocal path and confirm whether the m3u8 candidate is Meishe-transcoded output before activating both paths.'
          : 'Preserve both ownership models and validate WebLocal registration plus Meishe-transcoded M3U8 playback.'
        : activeMediaStrategies[0] === 'weblocal'
          ? 'Use the selected WebLocal path and validate its descriptor, supported media limits, and File registration at runtime.'
          : unconfirmedM3u8Candidate
            ? 'Ask the customer to confirm that this is Meishe-transcoded output; ordinary HLS is not interchangeable.'
            : 'Use the selected Meishe-transcoded path and retain its manifest/segment ownership rules.', {
      evidence: explicitSelection ? 'caller-attested customer media decision' : [...new Set([confirmedWebLocalEvidence, confirmedM3u8Evidence, m3u8CandidateEvidence].filter(Boolean))],
      evidenceKind: explicitSelection
        ? 'caller-attested-user-decision'
        : persistedWebLocalEvidence || persistedM3u8Evidence
          ? 'persisted-project-decision'
          : mixed ? 'source-structure' : webLocalEvidence ? 'source-call' : 'source-config',
      confidence: explicitSelection ? 'medium' : unconfirmedM3u8Candidate ? 'medium' : 'high',
      validationPending: [
        ...(activeMediaStrategies.includes('weblocal') ? ['weblocal-metadata', 'file-registration'] : []),
        ...(activeMediaStrategies.includes('meishe-transcoded-m3u8') ? ['meishe-transcoding-contract', 'cross-segment-playback'] : []),
        'rendered-seek',
      ],
      requiresUserApproval: unconfirmedM3u8Candidate,
      approvalKind: unconfirmedM3u8Candidate ? 'media-strategy-decision' : null,
      details: {
        strategy: mixed ? 'mixed' : activeMediaStrategies[0],
        strategies: activeMediaStrategies,
        detectedStrategies: detectedMediaStrategies,
        persistedDecisionEvidence: [...new Set([persistedWebLocalEvidence, persistedM3u8Evidence].filter(Boolean))],
        unconfirmedM3u8Candidate: m3u8CandidateEvidence || null,
      },
    }));

    if (activeMediaStrategies.includes('weblocal')) {
      const mediaBunnyVersion = dependencies.mediabunny;
      const installCommand = packageInstallCommand(packageManager, 'mediabunny');
      conditions.push(condition('weblocal-parser', mediaBunnyVersion ? 'available' : 'approval-required', true,
        mediaBunnyVersion ? 'The project declares mediabunny for WebLocal metadata extraction.' : 'WebLocal is selected but mediabunny is not declared.',
        mediaBunnyVersion ? 'Reuse the declared parser version.' : `Explain the WebLocal parser dependency and exact command (${installCommand}); wait for explicit user confirmation before running it.`, {
          evidence: mediaBunnyVersion ? 'package.json' : confirmedWebLocalEvidence,
          evidenceKind: mediaBunnyVersion ? 'structured-config' : 'source-call',
          confidence: mediaBunnyVersion ? 'high' : 'medium',
          requiresApproval: !mediaBunnyVersion,
          requiresUserApproval: !mediaBunnyVersion,
          approvalKind: mediaBunnyVersion ? null : 'network-dependency-install',
          details: { declaredVersion: mediaBunnyVersion || null, packageManager, package: 'mediabunny', command: mediaBunnyVersion ? null : installCommand, affectedFile: mediaBunnyVersion ? null : 'package.json and the active lockfile' },
        }));
    }

    const needsM3u8 = activeMediaStrategies.includes('meishe-transcoded-m3u8');
    const needsWebLocal = activeMediaStrategies.includes('weblocal');
    const allowedMediaInputKinds = [
      ...(needsM3u8 ? ['meishe-m3u8', 'backend-contract'] : []),
      ...(needsWebLocal ? ['local-file'] : []),
    ];
    const unusedInputKinds = mediaInputKinds.filter((kind) => !allowedMediaInputKinds.includes(kind));
    conditions.push(condition('media-input-consistency', unusedInputKinds.length ? 'unknown' : 'available', true,
      unusedInputKinds.length
        ? `The supplied media input kind(s) do not belong to the active strategy: ${unusedInputKinds.join(', ')}.`
        : 'Every supplied media input kind belongs to the active media strategy.',
      unusedInputKinds.length
        ? 'Remove the unused input kinds or explicitly select mixed if both paths are intended.'
        : 'Keep each input scoped to its active media path.', {
        evidence: mediaInputKinds.length ? mediaInputKinds : null,
        evidenceKind: mediaInputKinds.length ? 'caller-attested-input-kind' : 'none',
        confidence: 'high',
        details: { allowedMediaInputKinds, unusedInputKinds },
      }));
    const hasM3u8Input = mediaInputKinds.includes('meishe-m3u8') || mediaInputKinds.includes('backend-contract');
    const hasWebLocalInput = mediaInputKinds.includes('local-file');
    const inputSatisfied = (!needsM3u8 || hasM3u8Input) && (!needsWebLocal || hasWebLocalInput);
    if (requiresMedia && activeMediaStrategies.length) {
      conditions.push(condition('media-validation-input', inputSatisfied ? 'available' : 'missing-external', true,
        inputSatisfied
          ? 'Strategy-matching media validation input evidence is available.'
          : needsM3u8 && needsWebLocal
            ? 'The selected mixed strategy needs customer-approved Meishe-transcoded m3u8 output or backend contract and a supported local validation file.'
            : needsM3u8
              ? 'The selected production strategy needs actual Meishe-transcoded m3u8 output or its backend integration contract; ordinary HLS is not a substitute.'
              : 'The selected WebLocal strategy needs a supported local validation file and customer acceptance of its limits.',
        inputSatisfied
          ? 'Use only the declared input kinds and preserve actual runtime media validation.'
          : needsM3u8 && needsWebLocal
            ? 'Ask for both inputs, then pass --media-input-kind meishe-m3u8,local-file (or backend-contract,local-file).'
            : needsM3u8
              ? 'Ask for a project-accessible Meishe-transcoded m3u8 test URL or backend integration contract, then pass the matching --media-input-kind.'
              : 'Ask for a supported local validation file and acceptance of WebLocal limits, then pass --media-input-kind local-file.', {
          evidence: mediaInputKinds.length ? mediaInputKinds : null,
          evidenceKind: mediaInputKinds.length ? 'caller-attested-input-kind' : 'none',
          confidence: mediaInputKinds.length ? 'medium' : 'low',
          validationPending: inputSatisfied ? ['media-runtime-access', 'sdk-file-info', 'rendered-seek'] : [],
          details: { mediaInputKinds, needsM3u8, needsWebLocal, allowedMediaInputKinds, unusedInputKinds },
        }));
    }
  } else {
    conditions.push(condition('media-strategy', requiresMedia ? 'decision-required' : 'unknown', requiresMedia,
      requiresMedia ? 'The requested domain needs media, but no existing Meishe-transcoded m3u8 or WebLocal path was detected.' : 'The requested domain does not establish a media requirement.',
      requiresMedia ? 'Recommend Meishe-transcoded m3u8 for general production use, explain both strategies and required inputs, then pass --media-strategy only after the customer chooses.' : 'No action unless the requested recipe uses media.', {
        requiresUserApproval: requiresMedia,
        approvalKind: requiresMedia ? 'media-strategy-decision' : null,
        details: requiresMedia ? {
          recommendedStrategy: 'meishe-transcoded-m3u8',
          alternatives: ['meishe-transcoded-m3u8', 'weblocal', 'mixed'],
        } : undefined,
      }));
    if (mediaInputKinds.length) {
      conditions.push(condition('media-input-consistency', 'decision-required', true,
        'Media input kinds were supplied before an active media strategy was selected or detected.',
        'Choose or detect the media strategy first, then pass only strategy-matching input kinds.', {
          evidence: mediaInputKinds,
          evidenceKind: 'caller-attested-input-kind',
          confidence: 'high',
          requiresUserApproval: true,
          approvalKind: 'media-strategy-decision',
          details: { allowedMediaInputKinds: [], unusedInputKinds: mediaInputKinds },
        }));
    }
  }

  if (args.feature === 'captions') {
    conditions.push(captionFontEvidence
      ? condition('caption-font', 'available', false,
        'The project registers an explicit font and applies its SDK FS path to captions.',
        'Reuse the existing font ownership and verify CJK glyph rendering at runtime.', {
          evidence: captionFontEvidence,
          evidenceKind: 'source-call',
          confidence: 'high',
          validationPending: ['font-url-or-file-loading', 'font-registration-result', 'cjk-glyph-rendering'],
        })
      : condition('caption-font', 'unknown', false,
        'No complete explicit font registration/application flow was detected. The SDK can still add captions, but text may render as mojibake or missing glyphs.',
        'Inform the user without blocking integration. Use their .otf/.ttf/.ttc file or URL if requested; if absent, offer the approved Noto Sans CJK fallback from the captions guide.', {
          evidenceKind: 'approved-fallback-policy',
          confidence: 'high',
          validationPending: ['caption-glyph-rendering', 'optional-fallback-font-cors'],
        }));
  }

  const externalByDomain = {
    'advanced-effects': ['models', 'material packages', 'effect licenses'],
    'asset-package-management': ['material packages', 'package licenses'],
    captions: ['caption packages'],
    stickers: ['sticker packages'],
    'templates-and-nested-timelines': ['template packages', 'fonts', 'media'],
    'project-xml-and-persistence': ['project resources', 'packages', 'fonts', 'media'],
  };
  const domainResources = externalByDomain[args.feature];
  if (domainResources) {
    conditions.push(condition('domain-external-resources', 'unknown', false,
      `The selected domain may require customer-owned ${domainResources.join(', ')} depending on the exact recipe.`,
      'Inspect the requested recipe and promote each required resource to available or missing-external before dependent implementation.', {
        details: { candidates: domainResources },
      }));
  }

  const blocking = conditions
    .filter((item) => item.status === 'missing-external'
      || item.status === 'decision-required'
      || item.status === 'runtime-required'
      || (item.status === 'unknown' && item.critical)
      || item.status === 'approval-required'
      || (item.status === 'provisionable' && item.requiresUserApproval))
    .map((item) => item.id);
  const bootstrapGateIds = new Set([
    'runtime-installation',
    'sdk-api',
    'target-sdk-runtime-provenance',
    'api-capability-surface',
    'wasm-runtime',
    'runtime-delivery-coherence',
    'wasm-loader',
    'cross-origin-isolation',
  ]);
  const bootstrapBlocking = blocking.filter((id) => bootstrapGateIds.has(id));
  const featureInputGateIds = new Set(['authorization-flow', 'media-strategy', 'media-input-consistency', 'media-validation-input', 'domain-external-resources']);
  const featureInputBlocking = blocking.filter((id) => featureInputGateIds.has(id));
  const prerequisiteBlocking = bootstrapBlocking;
  const gateDisclosure = buildGateDisclosure(conditions, { requiresMedia, dependencies, packageManager });
  return {
    schemaVersion: 8,
    phase: 'preflight',
    project: path.basename(args.project),
    feature: args.feature,
    framework: dependencies.react ? 'react' : dependencies.vue ? 'vue' : 'generic',
    buildTool: dependencies.vite ? 'vite' : dependencies.webpack ? 'webpack' : 'unknown',
    packageManager,
    baselineSdkVersion: SDK_BASELINE.sdkVersion,
    sdkVersion: runtimeSdkVersion || 'unknown',
    staticSdkVersion: staticApiHeaderVersion,
    staticApiHeaderVersion,
    staticApiHeaderOrigin: targetSdkOrigin,
    runtimeSdkVersion,
    sdkVersionEvidence: runtimeSdkVersion ? 'caller-attested-context-getSdkVersion' : 'runtime-pending',
    compatibility: {
      baselineSdkVersion: SDK_BASELINE.sdkVersion,
      runtimeSdkVersion,
      staticApiHeaderVersion,
      staticApiHeaderOrigin: targetSdkOrigin,
      posture: runtimeVersionPosture(runtimeSdkVersion),
      staticHeaderMatchesRuntime: headerMatchesRuntime,
      staticHeaderMismatchBlocking: false,
    },
    networkAccessPerformed: false,
    runtimeSource: args.runtimeSource || null,
    targetSdk: args.targetSdk || null,
    targetSdkOrigin,
    uiDesign,
    conditions,
    gateDisclosure,
    mutationPolicy: {
      preflightIsReadOnly: true,
      projectWritesRequireExplicitUserConfirmation: true,
      toolOrSandboxApprovalSatisfiesUserConfirmation: false,
    },
    bootstrapBlocking,
    bootstrapReady: bootstrapBlocking.length === 0,
    prerequisiteBlocking,
    prerequisitesReady: prerequisiteBlocking.length === 0,
    featureInputBlocking,
    featureInputsReady: featureInputBlocking.length === 0,
    blocking,
    featureImplementationReady: blocking.length === 0,
  };
}

export function inspectProjectFeatures(args) {
  const features = args.features?.length ? args.features : [args.feature || 'integration-core'];
  const cache = {};
  const results = features.map((feature) => inspectProject({ ...args, feature }, cache));
  if (results.length === 1) return results[0];

  const conditionFeatures = new Map();
  for (const result of results) {
    for (const item of result.conditions) {
      const key = JSON.stringify(item);
      const owners = conditionFeatures.get(key) || new Set();
      owners.add(result.feature);
      conditionFeatures.set(key, owners);
    }
  }
  const commonKeys = new Set([...conditionFeatures.entries()]
    .filter(([, owners]) => owners.size === results.length)
    .map(([key]) => key));
  const first = results[0];
  const commonConditions = first.conditions.filter((item) => commonKeys.has(JSON.stringify(item)));
  const domains = Object.fromEntries(results.map((result) => {
    const domainConditions = result.conditions.filter((item) => !commonKeys.has(JSON.stringify(item)));
    const conditionOrder = result.conditions.map((item) => {
      const collection = commonKeys.has(JSON.stringify(item)) ? commonConditions : domainConditions;
      return {
        scope: collection === commonConditions ? 'common' : 'domain',
        index: collection.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)),
      };
    });
    return [result.feature, { conditions: domainConditions, conditionOrder, blocking: result.blocking }];
  }));
  const mergeDisclosureList = (key) => [...new Set(results.flatMap((result) => result.gateDisclosure[key]))];
  const conditionalFollowOns = [...new Map(results
    .flatMap((result) => result.gateDisclosure.conditionalFollowOns)
    .map((item) => [JSON.stringify(item), item])).values()];
  return {
    schemaVersion: 9,
    phase: first.phase,
    project: first.project,
    features,
    framework: first.framework,
    buildTool: first.buildTool,
    packageManager: first.packageManager,
    baselineSdkVersion: first.baselineSdkVersion,
    sdkVersion: first.sdkVersion,
    staticSdkVersion: first.staticSdkVersion,
    staticApiHeaderVersion: first.staticApiHeaderVersion,
    staticApiHeaderOrigin: first.staticApiHeaderOrigin,
    runtimeSdkVersion: first.runtimeSdkVersion,
    sdkVersionEvidence: first.sdkVersionEvidence,
    compatibility: first.compatibility,
    networkAccessPerformed: false,
    runtimeSource: first.runtimeSource,
    targetSdk: first.targetSdk,
    targetSdkOrigin: first.targetSdkOrigin,
    uiDesign: first.uiDesign,
    mutationPolicy: first.mutationPolicy,
    gateDisclosure: {
      ...first.gateDisclosure,
      currentGateIds: mergeDisclosureList('currentGateIds'),
      decisionGateIds: mergeDisclosureList('decisionGateIds'),
      approvalGateIds: mergeDisclosureList('approvalGateIds'),
      externalInputGateIds: mergeDisclosureList('externalInputGateIds'),
      runtimeGateIds: mergeDisclosureList('runtimeGateIds'),
      conditionalFollowOns,
      pendingRuntimeValidations: mergeDisclosureList('pendingRuntimeValidations'),
    },
    commonConditions,
    domains,
    bootstrapBlocking: [...new Set(results.flatMap((result) => result.bootstrapBlocking))],
    bootstrapReady: results.every((result) => result.bootstrapReady),
    prerequisiteBlocking: [...new Set(results.flatMap((result) => result.prerequisiteBlocking))],
    prerequisitesReady: results.every((result) => result.prerequisitesReady),
    featureInputBlocking: [...new Set(results.flatMap((result) => result.featureInputBlocking))],
    featureInputsReady: results.every((result) => result.featureInputsReady),
    blocking: [...new Set(results.flatMap((result) => result.blocking))],
    featureImplementationReady: results.every((result) => result.featureImplementationReady),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.listFeatures) {
    console.log(JSON.stringify({
      domains: FEATURE_MAP.domains.map(({ id, description }) => ({ id, description })),
      aliases: Object.fromEntries(FEATURE_ALIASES),
    }, null, 2));
    return;
  }
  if (args.listRecipes) {
    console.log(JSON.stringify({
      recipes: RECIPE_PRESETS.map(({ id, description, features }) => ({ id, description, features })),
    }, null, 2));
    return;
  }
  console.log(JSON.stringify(inspectProjectFeatures(args), null, 2));
}

function inspectUiDesign(project, files, entries, dependencies) {
  const libraries = UI_DEPENDENCIES.filter((name) => dependencies[name]);
  const designDirectory = files.find((file) => /(?:^|\/)(?:design-system|design_system|ui-kit|ui_kit)(?:\/|$)/i.test(relative(project, file)));
  const reusableComponents = files.find((file) => /(?:^|\/)src\/(?:components|ui)\//i.test(relative(project, file)));
  const themeEvidence = firstEvidence(project, entries, (code) =>
    /\b(?:ThemeProvider|createTheme|ConfigProvider)\b/.test(code) ||
    /:root\s*\{[\s\S]*--(?:color|surface|background|foreground|primary|spacing|radius)-/i.test(code));
  const evidence = [libraries.length ? 'package.json' : null, designDirectory ? relative(project, designDirectory) : null, reusableComponents ? relative(project, reusableComponents) : null, themeEvidence].filter(Boolean);
  const status = libraries.length || designDirectory || (reusableComponents && themeEvidence) ? 'detected' : evidence.length ? 'ambiguous' : 'not-detected';
  return {
    status,
    libraries,
    evidence: [...new Set(evidence)],
    action: status === 'detected'
      ? 'Reuse the established project UI before considering the default editor sample.'
      : status === 'ambiguous'
        ? 'Inspect the cited UI files before deciding whether the project has a reusable design system.'
        : 'Use the default editor description and routed UI sample only when the request also contains no user-provided UI reference.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
