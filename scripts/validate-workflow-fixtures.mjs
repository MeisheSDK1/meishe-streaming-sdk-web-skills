#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareSdkCapabilities } from './compare-sdk-capabilities.mjs';
import { assertUniqueResourceIds, parseArgs as parseResourceArgs, selectTestResources } from './check-test-resources.mjs';
import { inspectProject, inspectProjectFeatures, parseArgs as parseInspectionArgs } from './inspect-target-project.mjs';
import { installRuntime } from './install-runtime.mjs';
import { validateDistribution } from './validate-distribution.mjs';

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function gate(result, id) {
  return result.conditions.find((condition) => condition.id === id);
}

function write(file, content = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function inspectFixtures(root) {
  const testResources = [
    { id: 'caption' },
    { id: 'sticker' },
  ];
  assert(selectTestResources(testResources, []).length === 2, 'Omitting resource IDs must preserve the full resource audit.');
  assert(selectTestResources(testResources, ['caption']).map(({ id }) => id).join(',') === 'caption', 'A resource ID must select only the requested resource.');
  let unknownResourceRejected = false;
  try {
    selectTestResources(testResources, ['unknown']);
  } catch (error) {
    unknownResourceRejected = /Unknown test resource ID/.test(error.message);
  }
  assert(unknownResourceRejected, 'Unknown test-resource IDs must fail closed.');
  assertUniqueResourceIds(testResources);
  let duplicateResourceRejected = false;
  try {
    assertUniqueResourceIds([{ id: 'caption' }, { id: 'caption' }]);
  } catch (error) {
    duplicateResourceRejected = /Duplicate test resource ID/.test(error.message);
  }
  assert(duplicateResourceRejected, 'Duplicate test-resource IDs must fail closed.');

  for (const argv of [['--id', ','], ['--id']]) {
    let rejected = false;
    try {
      parseResourceArgs(argv);
    } catch (error) {
      rejected = /--id requires at least one resource ID/.test(error.message);
    }
    assert(rejected, 'An empty or missing --id value must fail closed.');
  }

  const empty = path.join(root, 'empty');
  fs.mkdirSync(empty);
  for (const argv of [['--project', empty, '--features', ','], ['--project', empty, '--features']]) {
    let rejected = false;
    try {
      parseInspectionArgs(argv);
    } catch (error) {
      rejected = /--features requires at least one domain/.test(error.message);
    }
    assert(rejected, 'An empty or missing --features value must fail closed.');
  }
  assert(parseInspectionArgs(['--project', empty, '--feature', 'm3u8']).feature === 'media-fs-and-weblocal', 'The m3u8 alias must route to the media domain.');
  assert(parseInspectionArgs(['--project', empty, '--feature', 'transcoding']).feature === 'media-fs-and-weblocal', 'The transcoding alias must route to the media domain.');
  assert(parseInspectionArgs(['--project', empty, '--media-strategy', 'weblocal']).mediaStrategy === 'weblocal', 'An explicit WebLocal choice must be preserved.');
  const previewRecipe = parseInspectionArgs(['--project', empty, '--recipe', 'simple-weblocal-preview']);
  assert(previewRecipe.features.join(',') === 'integration-core,engine-lifecycle,media-fs-and-weblocal,timeline-track-clip,monitor-playback-coordinate', 'The simple WebLocal preview recipe must expand to its complete domain set.');
  assert(previewRecipe.requiredSymbols.includes('NvsStreamingContext.onPlaybackEOF') && previewRecipe.requiredSymbols.includes('NvsVideoResolution.constructor') && previewRecipe.requiredSymbols.includes('NvsStreamingContext.removeTimeline'), 'The simple WebLocal preview recipe must include callbacks, constructors, and cleanup APIs.');
  let unknownRecipeRejected = false;
  try {
    parseInspectionArgs(['--project', empty, '--recipe', 'unknown']);
  } catch (error) {
    unknownRecipeRejected = /Unknown recipe/.test(error.message);
  }
  assert(unknownRecipeRejected, 'Unknown recipe presets must fail closed.');
  let orphanProvenanceRejected = false;
  try {
    parseInspectionArgs(['--project', empty, '--target-sdk-provenance', 'customer-confirmed-delivery']);
  } catch (error) {
    orphanProvenanceRejected = /requires --target-sdk/.test(error.message);
  }
  assert(orphanProvenanceRejected, 'Target-SDK provenance without a target file must fail closed.');
  let queryOnlyTargetRejected = false;
  try {
    parseInspectionArgs(['--project', empty, '--target-sdk', path.join(SKILL_DIR, 'references', 'NvStreamingSdk.js')]);
  } catch (error) {
    queryOnlyTargetRejected = /query-only/.test(error.message);
  }
  assert(queryOnlyTargetRejected, 'The bundled query-only SDK must never satisfy a customer target-SDK gate.');
  const emptyResult = inspectProject({ project: empty, feature: 'captions' });
  assert(emptyResult.schemaVersion === 8, 'Inspector schema must expose provenance, split readiness, media-input consistency, and consolidated gate disclosure.');
  assert(emptyResult.uiDesign.status === 'not-detected', 'An empty project must report no detected reusable UI design system.');
  assert(gate(emptyResult, 'sdk-api').status === 'missing-external', 'Empty project must miss SDK API.');
  assert(emptyResult.staticSdkVersion === 'unknown', 'Empty project must expose an unknown static API-header version.');
  assert(gate(emptyResult, 'runtime-sdk-version').status === 'runtime-required', 'Runtime SDK version must block feature implementation until a browser context exists.');
  assert(gate(emptyResult, 'api-capability-surface').status === 'unknown', 'API capability readiness must require a complete recipe symbol set before mutations.');
  assert(gate(emptyResult, 'wasm-runtime').status === 'missing-external', 'Empty project must miss WASM.');
  assert(gate(emptyResult, 'runtime-delivery-coherence').critical === false, 'Runtime coherence must defer while upstream inputs are missing.');
  assert(gate(emptyResult, 'wasm-loader').status === 'approval-required' && gate(emptyResult, 'wasm-loader').requiresUserApproval, 'Missing loader must require explicit conversational approval.');
  assert(gate(emptyResult, 'wasm-loader').command === 'npm install meishewasmloader', 'Missing loader must expose the exact package-manager command before approval.');
  assert(gate(emptyResult, 'authorization-flow').status === 'decision-required' && gate(emptyResult, 'authorization-flow').critical, 'Authorization must require an explicit customer decision.');
  assert(emptyResult.mutationPolicy.toolOrSandboxApprovalSatisfiesUserConfirmation === false, 'Tool approval must never satisfy customer confirmation.');
  assert(emptyResult.blocking.includes('wasm-loader'), 'Approval-pending loader must block dependent implementation.');
  assert(emptyResult.blocking.includes('authorization-flow'), 'Unconfirmed authorization must block implementation.');
  assert(emptyResult.conditions.filter((item) => item.status === 'approval-required').every((item) => item.requiresApproval && item.requiresUserApproval), 'Every approval-required gate must set both approval fields by construction.');
  assert(emptyResult.gateDisclosure.disclosureIsApproval === false, 'Consolidated gate disclosure must never authorize a mutation.');
  assert(emptyResult.gateDisclosure.currentGateIds.includes('wasm-loader') && emptyResult.gateDisclosure.currentGateIds.includes('cross-origin-isolation'), 'The first disclosure must include unrelated known prerequisites before any gate-specific question.');
  assert(gate(emptyResult, 'media-strategy').critical === false, 'Captions alone must not invent a media requirement.');
  assert(gate(emptyResult, 'caption-font').status === 'unknown' && !gate(emptyResult, 'caption-font').critical, 'Missing caption font must produce a non-blocking warning with an approved fallback.');
  assert(!emptyResult.blocking.includes('caption-font'), 'Missing caption font must never block caption integration.');
  const multiResult = inspectProjectFeatures({ project: empty, features: ['captions', 'asset-package-management'] });
  assert(multiResult.schemaVersion === 9, 'Multi-domain inspection must use its explicit aggregate schema.');
  assert(multiResult.features.join(',') === 'captions,asset-package-management', 'Multi-domain inspection must preserve requested domain order.');
  for (const feature of multiResult.features) {
    const single = inspectProject({ project: empty, feature });
    const domain = multiResult.domains[feature];
    const reconstructed = domain.conditionOrder.map(({ scope, index }) =>
      scope === 'common' ? multiResult.commonConditions[index] : domain.conditions[index]);
    assert(
      JSON.stringify(reconstructed) === JSON.stringify(single.conditions),
      `Multi-domain inspection must preserve every ${feature} condition exactly.`,
    );
    assert(
      JSON.stringify(multiResult.domains[feature].blocking) === JSON.stringify(single.blocking),
      `Multi-domain inspection must preserve every ${feature} blocker exactly.`,
    );
  }
  assert(
    JSON.stringify(multiResult.blocking) === JSON.stringify([...new Set(multiResult.features.flatMap((feature) => multiResult.domains[feature].blocking))]),
    'Multi-domain blocking must be the stable union of all single-domain blockers.',
  );
  const firstVideoIntegration = inspectProject({ project: empty, feature: 'video-editing' });
  assert(firstVideoIntegration.gateDisclosure.currentGateIds.includes('authorization-flow') && firstVideoIntegration.gateDisclosure.currentGateIds.includes('media-strategy'), 'A first media integration must disclose authorization and media decisions together with common prerequisites.');
  assert(firstVideoIntegration.gateDisclosure.approvalGateIds.includes('wasm-loader') && firstVideoIntegration.gateDisclosure.approvalGateIds.includes('cross-origin-isolation'), 'Known dependency and header mutations must be disclosed before media or authorization is chosen.');
  assert(firstVideoIntegration.gateDisclosure.runtimeGateIds.includes('runtime-sdk-version'), 'The first report must disclose pending runtime SDK version validation.');
  assert(['meishe-transcoded-m3u8', 'weblocal', 'mixed'].every((strategy) => firstVideoIntegration.gateDisclosure.conditionalFollowOns.some((item) => item.when === `media-strategy=${strategy}`)), 'Every media strategy must disclose its conditional dependencies, inputs, and runtime validations before the choice is requested.');

  const uiProject = path.join(root, 'ui-design');
  write(path.join(uiProject, 'package.json'), JSON.stringify({ dependencies: { react: '^19.0.0', antd: '^5.0.0' } }));
  write(path.join(uiProject, 'src/theme.css'), ':root { --color-primary: #123456; }');
  const uiResult = inspectProject({ project: uiProject, feature: 'timeline', authorizationMode: 'skip' });
  assert(uiResult.uiDesign.status === 'detected', 'A declared UI library must report a reusable UI design system.');
  assert(uiResult.uiDesign.libraries.includes('antd'), 'UI inspection must preserve detected library evidence.');
  assert(emptyResult.networkAccessPerformed === false, 'Inspector must never access the network.');

  const vueJsProject = path.join(root, 'vue-js-project');
  write(path.join(vueJsProject, 'package.json'), JSON.stringify({ dependencies: { vue: '^3.0.0', vite: '^7.0.0' } }));
  write(path.join(vueJsProject, 'src', 'App.vue'), '<template><main /></template>\n');
  const vueJsResult = inspectProject({ project: vueJsProject, feature: 'captions', authorizationMode: 'skip' });
  assert(gate(vueJsResult, 'cross-origin-isolation').developmentConfigFile === 'vite.config.js', 'A JavaScript Vue project must not be misclassified as TypeScript merely because it contains .vue files.');

  write(path.join(empty, '.env'), 'VITE_MEISHE_AUTH_MODE=skip\nVITE_MEISHE_AUTH_URL=https://example.invalid/license\n');
  const envOnlyResult = inspectProject({ project: empty, feature: 'captions' });
  assert(gate(envOnlyResult, 'authorization-flow').status === 'decision-required', '.env values alone must not count as authorization or authentication URL evidence.');

  const comments = path.join(root, 'comments-only');
  fs.mkdirSync(comments);
  write(path.join(comments, 'notes.ts'), [
    '// const sdkRoot = "https://example.invalid/sdk";',
    '/* const runtime = { wasmRoot: "/runtime", enableMultithreadDecoding: true }; */',
    'export const note = "NvStreamingSdk.js";',
  ].join('\n'));
  const commentsResult = inspectProject({ project: comments, feature: 'captions' });
  assert(gate(commentsResult, 'sdk-api').status === 'missing-external', 'Comments/string mentions must not satisfy the SDK gate.');
  assert(gate(commentsResult, 'wasm-runtime').status === 'missing-external', 'Comments must not satisfy the WASM gate.');
  assert(gate(commentsResult, 'cross-origin-isolation').critical === true, 'Cross-origin isolation must remain critical independently of comments or thread options.');

  const source = path.join(root, 'customer-runtime');
  fs.mkdirSync(source);
  write(path.join(source, 'NvStreamingSdk.js'), '/** @version 3.16.0 */\nclass NvsTimeline {\n    addCaption(a, b, c, d, e) {}\n}\n');
  write(path.join(source, 'NvWasmPlayer.js'), 'export {};\n');
  write(path.join(source, 'NvWasmPlayer.wasm'));
  const runtime = path.join(root, 'runtime-project');
  fs.mkdirSync(runtime);
  write(path.join(runtime, 'package.json'), JSON.stringify({ dependencies: { meishewasmloader: '^2.0.0', vite: '^7.0.0' } }));
  write(path.join(runtime, 'runtime.ts'), 'export const loaderOptions = { enableMultithreadDecoding: false };\n');
  const sourceReady = inspectProject({
    project: runtime,
    runtimeSource: source,
    feature: 'captions',
    authorizationMode: 'skip',
    requiredSymbols: ['NvsTimeline.addCaption'],
  });
  assert(gate(sourceReady, 'runtime-installation').status === 'approval-required', 'A valid external delivery must require explicit approval before installation.');
  assert(gate(sourceReady, 'runtime-installation').approvalKind === 'project-filesystem-mutation', 'Runtime installation must identify its mutation approval kind.');
  assert(gate(sourceReady, 'runtime-installation').destination === path.join(runtime, 'public', 'wasm'), 'Runtime approval must expose the exact destination.');
  assert(gate(sourceReady, 'runtime-installation').files.join(',') === 'NvStreamingSdk.js,NvWasmPlayer.js,NvWasmPlayer.wasm', 'Runtime approval must expose the complete sorted delivery file set.');
  assert(gate(sourceReady, 'runtime-installation').command.includes('--user-confirmed-copy'), 'Runtime approval must expose the guarded copy command.');
  assert(gate(sourceReady, 'sdk-api').status === 'approval-required', 'SDK API must remain approval-gated until copied into public/wasm.');
  assert(gate(sourceReady, 'wasm-runtime').status === 'approval-required', 'WASM must remain approval-gated until copied into public/wasm.');
  assert(gate(sourceReady, 'api-capability-surface').status === 'available', 'The supplied SDK source must be statically checked before runtime installation approval.');
  assert(gate(sourceReady, 'target-sdk-runtime-provenance').status === 'available' && sourceReady.targetSdkOrigin === 'runtime-source', 'A supplied delivery SDK must be directly bound to its runtime source.');
  assert(sourceReady.staticApiHeaderOrigin === 'runtime-source', 'Static header evidence must identify the actual inspected source file.');
  assert(gate(sourceReady, 'api-capability-surface').validationPending.includes('context-getSdkVersion'), 'A passing preflight surface check must retain the runtime-version validation.');
  assert(gate(sourceReady, 'runtime-delivery-coherence').status === 'available', 'A supplied customer directory must not require a separate pairing confirmation.');
  assert(gate(sourceReady, 'wasm-loader').status === 'available', 'An existing declared loader must be reused without an npm latest query.');
  assert(gate(sourceReady, 'cross-origin-isolation').status === 'approval-required' && gate(sourceReady, 'cross-origin-isolation').critical, 'Disabled multithreading must still require approved header changes.');
  assert(gate(sourceReady, 'cross-origin-isolation').requiresApproval && gate(sourceReady, 'cross-origin-isolation').requiresUserApproval, 'Approval-required conditions must keep legacy and canonical approval fields aligned.');
  assert(gate(sourceReady, 'cross-origin-isolation').developmentConfigFile === 'vite.config.ts', 'Vite header approval must identify the proposed project config file.');
  assert(gate(sourceReady, 'cross-origin-isolation').headers['Cross-Origin-Embedder-Policy'] === 'require-corp', 'Header approval must expose one exact recommended COEP value.');
  assert(gate(sourceReady, 'cross-origin-isolation').alternativeCoep.value === 'credentialless', 'Credentialless must remain an explicit alternative instead of an ambiguous combined value.');
  assert(gate(sourceReady, 'authorization-flow').evidenceKind === 'caller-attested-user-decision', 'Authorization flags must remain caller attestations rather than inspector-observed confirmation.');
  assert(sourceReady.bootstrapReady === false && sourceReady.prerequisitesReady === sourceReady.bootstrapReady, 'Unapproved runtime/header mutations must block the minimal bootstrap and its compatibility mirror.');
  const sourceMissingCapability = inspectProject({
    project: runtime,
    runtimeSource: source,
    feature: 'captions',
    authorizationMode: 'skip',
    requiredSymbols: ['NvsTimeline.removeCaption'],
  });
  assert(gate(sourceMissingCapability, 'api-capability-surface').status === 'unknown' && sourceMissingCapability.prerequisiteBlocking.includes('api-capability-surface'), 'A missing API must be detected and block prerequisite mutations before runtime bootstrap.');

  let unconfirmedCopyRejected = false;
  try {
    installRuntime({ source, project: runtime });
  } catch (error) {
    unconfirmedCopyRejected = /explicit conversational approval/.test(error.message);
  }
  assert(unconfirmedCopyRejected && !fs.existsSync(path.join(runtime, 'public')), 'The runtime installer must reject an unconfirmed copy before creating any project directory.');
  const installed = installRuntime({ source, project: runtime, userConfirmed: true });
  assert(installed.status === 'installed', 'The runtime installer must copy a valid delivery.');
  assert(installRuntime({ source, project: runtime, userConfirmed: true }).status === 'unchanged', 'Reinstalling an identical delivery must be idempotent.');
  const emptyDestinationProject = path.join(root, 'empty-runtime-destination');
  fs.mkdirSync(path.join(emptyDestinationProject, 'public', 'wasm'), { recursive: true });
  const installedIntoEmptyDestination = installRuntime({ source, project: emptyDestinationProject, userConfirmed: true });
  assert(installedIntoEmptyDestination.status === 'installed', 'An existing empty public/wasm directory must accept a verified delivery.');
  assert(fs.existsSync(path.join(emptyDestinationProject, 'public', 'wasm', 'NvStreamingSdk.js')), 'Installing into an empty destination must publish the complete staged delivery.');
  assert(fs.readdirSync(path.join(emptyDestinationProject, 'public')).every((name) => !name.startsWith('.wasm-install-')), 'A successful empty-destination install must not leave a staging directory.');
  let unattachedRuntimeVersionRejected = false;
  try {
    inspectProject({ project: empty, feature: 'captions', runtimeSdkVersion: '3.16.0' });
  } catch (error) {
    unattachedRuntimeVersionRejected = /installed or configured runtime/.test(error.message);
  }
  assert(unattachedRuntimeVersionRejected, 'A caller-attested runtime version must be rejected when the project has no runtime evidence.');

  const transactionalProject = path.join(root, 'transactional-runtime-project');
  fs.mkdirSync(transactionalProject);
  let copyFailed = false;
  try {
    installRuntime({ source, project: transactionalProject, userConfirmed: true }, (_source, destination) => {
      write(path.join(destination, 'partial.txt'), 'partial');
      throw new Error('simulated copy failure');
    });
  } catch (error) {
    copyFailed = error.message === 'simulated copy failure';
  }
  assert(copyFailed, 'The runtime installer fixture must exercise a failed copy.');
  const transactionalPublic = path.join(transactionalProject, 'public');
  assert(!fs.existsSync(path.join(transactionalPublic, 'wasm')), 'A failed runtime copy must not expose a partial public/wasm directory.');
  assert(fs.readdirSync(transactionalPublic).length === 0, 'A failed runtime copy must remove its staging directory.');

  const linkedProject = path.join(root, 'linked-runtime-project');
  const outsidePublic = path.join(root, 'outside-public');
  fs.mkdirSync(linkedProject);
  fs.mkdirSync(outsidePublic);
  const linkedPublic = path.join(linkedProject, 'public');
  let linkCreated = false;
  try {
    fs.symlinkSync(outsidePublic, linkedPublic, process.platform === 'win32' ? 'junction' : 'dir');
    linkCreated = true;
    let linkRejected = false;
    try {
      installRuntime({ source, project: linkedProject, userConfirmed: true });
    } catch (error) {
      linkRejected = /must be a real directory/.test(error.message);
    }
    assert(linkRejected, 'The runtime installer must reject a public symlink or junction.');
  } catch (error) {
    if (linkCreated || error.message.includes('must reject')) throw error;
  }

  const existing = inspectProject({
    project: runtime,
    runtimeSource: source,
    feature: 'captions',
    authorizationMode: 'skip',
    runtimeSdkVersion: '3.16.0',
    requiredSymbols: ['NvsTimeline.addCaption'],
  });
  assert(gate(existing, 'sdk-api').evidenceKind === 'actual-file', 'Installed SDK file must be strong evidence.');
  assert(existing.sdkVersion === '3.16.0' && existing.staticSdkVersion === '3.16.0', 'Inspector must separate observed runtime and static header versions.');
  assert(gate(existing, 'runtime-sdk-version').status === 'available', 'An observed getSdkVersion result must satisfy the runtime-version gate.');
  assert(gate(existing, 'runtime-sdk-version').evidenceKind === 'caller-attested-runtime-api-result', 'The inspector must not claim it independently observed getSdkVersion.');
  assert(gate(existing, 'api-capability-surface').status === 'available', 'A present recipe-specific symbol must satisfy the API capability gate.');
  assert(gate(existing, 'types').status === 'unknown' && !gate(existing, 'types').requiresUserApproval, 'Optional absent declarations must not create a phantom approval gate.');
  assert(gate(existing, 'wasm-runtime').evidenceKind === 'actual-file', 'Installed WASM file must be strong evidence.');
  assert(gate(existing, 'runtime-delivery-coherence').status === 'available', 'A content-hash match must establish static delivery coherence.');
  assert(!existing.blocking.includes('runtime-delivery-coherence'), 'A matching runtime must not block on delivery coherence.');
  assert(gate(existing, 'wasm-loader').status === 'available' && !gate(existing, 'wasm-loader').requiresApproval, 'A declared loader must be reused without network approval.');

  const loaderTypesOnlyProject = path.join(root, 'loader-types-only');
  fs.mkdirSync(loaderTypesOnlyProject);
  write(path.join(loaderTypesOnlyProject, 'src', 'meishewasmloader.d.ts'), '// NvsStreamingContext is loaded separately.\ndeclare module "meishewasmloader" { export function loadEmscriptenModule(root: string): Promise<void>; }\n');
  const loaderTypesOnly = inspectProject({ project: loaderTypesOnlyProject, feature: 'integration-core', authorizationMode: 'skip' });
  assert(gate(loaderTypesOnly, 'types').status === 'unknown', 'A loader-only declaration filename must not be mistaken for SDK API declarations.');
  write(path.join(loaderTypesOnlyProject, 'src', 'sdk-globals.d.ts'), 'declare function nvsGetStreamingContextInstance(): NvsStreamingContext;\ninterface NvsStreamingContext {}\n');
  const sdkTypesPresent = inspectProject({ project: loaderTypesOnlyProject, feature: 'integration-core', authorizationMode: 'skip' });
  assert(gate(sdkTypesPresent, 'types').status === 'available' && gate(sdkTypesPresent, 'types').evidence === 'src/sdk-globals.d.ts', 'SDK declaration detection must use declaration content and report the matching project file.');

  const wrongRuntimeHeader = inspectProject({
    project: runtime,
    runtimeSource: source,
    feature: 'captions',
    authorizationMode: 'skip',
    runtimeSdkVersion: '3.15.2',
    requiredSymbols: ['NvsTimeline.addCaption'],
  });
  const wrongRuntimeHeaderGate = gate(wrongRuntimeHeader, 'runtime-sdk-version');
  assert(wrongRuntimeHeaderGate.status === 'available', 'A static/runtime mismatch alone must not block feature integration.');
  assert(wrongRuntimeHeaderGate.staticHeaderMatchesRuntime === false && wrongRuntimeHeaderGate.staticHeaderMismatchBlocking === false, 'Inspector must expose a non-blocking static-header mismatch.');
  assert(wrongRuntimeHeaderGate.validationPending.join(',') === 'static-header-metadata-mismatch', 'A static/runtime mismatch must not imply stale cache or delivery causes.');
  assert(wrongRuntimeHeader.compatibility.posture === 'older-runtime-surface-check', 'Compatibility posture must use the observed runtime version.');

  write(path.join(runtime, 'vite.config.ts'), "export default { headers: { 'Cross-Origin-Opener-Policy': 'same-origin' } };\n");
  const partialHeaders = inspectProject({ project: runtime, runtimeSource: source, feature: 'captions', authorizationMode: 'skip' });
  assert(gate(partialHeaders, 'cross-origin-isolation').status === 'approval-required', 'One isolation header must not satisfy the approval gate.');
  write(path.join(runtime, 'vite.config.ts'), "export default { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } };\n");
  write(path.join(runtime, 'sdk-init.ts'), [
    'loader.loadEmscriptenModule("/wasm/", {});',
    'const context = nvsGetStreamingContextInstance();',
    'context.initInternalResources();',
  ].join('\n'));
  const configured = inspectProject({ project: runtime, runtimeSource: source, feature: 'captions' });
  assert(gate(configured, 'runtime-delivery-coherence').status === 'available', 'Matching source/runtime evidence must establish static delivery coherence.');
  assert(gate(configured, 'cross-origin-isolation').status === 'available', 'Both structured headers must satisfy the static isolation gate.');
  assert(gate(configured, 'production-cross-origin-isolation').status === 'unknown' && !configured.blocking.includes('production-cross-origin-isolation'), 'Production isolation must remain an explicit deployment validation without blocking local integration.');
  assert(gate(configured, 'wasm-loader').status === 'available', 'The declared project loader must release the loader gate automatically.');
  assert(gate(configured, 'authorization-flow').status === 'available' && gate(configured, 'authorization-flow').evidenceKind === 'existing-initialization', 'A complete existing SDK initialization must avoid reopening authorization.');
  assert(gate(configured, 'authorization-flow').validationPending.includes('requested-capability-authorization'), 'Static authorization evidence must retain runtime capability validation.');
  const implementationReady = inspectProject({
    project: runtime,
    runtimeSource: source,
    feature: 'captions',
    runtimeSdkVersion: '3.16.0',
    requiredSymbols: ['NvsTimeline.addCaption'],
  });
  assert(implementationReady.featureImplementationReady === true, 'Feature implementation readiness must require and accept a passing recipe API comparison.');
  const mediaBootstrapReady = inspectProject({
    project: runtime,
    runtimeSource: source,
    feature: 'media-fs-and-weblocal',
    mediaStrategy: 'meishe-transcoded-m3u8',
    requiredSymbols: ['NvsTimeline.addCaption'],
  });
  assert(mediaBootstrapReady.bootstrapReady && mediaBootstrapReady.prerequisitesReady, 'Missing runtime version or feature media must not prevent the already-approved minimal SDK bootstrap.');
  assert(!mediaBootstrapReady.featureInputsReady && !mediaBootstrapReady.featureImplementationReady, 'Bootstrap readiness must never authorize feature work while required media input is absent.');
  assert(mediaBootstrapReady.blocking.includes('runtime-sdk-version') && mediaBootstrapReady.blocking.includes('media-validation-input'), 'Full feature blockers must retain runtime and media requirements after bootstrap is ready.');
  const missingCapability = inspectProject({
    project: runtime,
    runtimeSource: source,
    feature: 'captions',
    runtimeSdkVersion: '3.16.0',
    requiredSymbols: ['NvsTimeline.removeCaption'],
  });
  assert(gate(missingCapability, 'api-capability-surface').status === 'unknown' && !missingCapability.featureImplementationReady, 'A missing recipe API must block feature implementation readiness.');
  write(path.join(runtime, 'caption-font.ts'), 'context.registerFontByFilePath(fontPath); caption.setFontByFilePath(fontPath);\n');
  const configuredWithFont = inspectProject({ project: runtime, runtimeSource: source, feature: 'captions' });
  assert(gate(configuredWithFont, 'caption-font').status === 'available', 'Complete font registration and caption application must be reported as available evidence.');

  const authProject = path.join(root, 'authorization-project');
  fs.mkdirSync(authProject);
  const requiredMissing = inspectProject({ project: authProject, feature: 'captions', authorizationMode: 'required' });
  assert(gate(requiredMissing, 'authorization-flow').status === 'missing-external', 'Required authorization without an implementation must remain blocked.');
  write(path.join(authProject, 'authorization.ts'), 'context.onWebRequestAuthFinish = () => {}; context.verifySdkLicenseFile(authUrl);\n');
  const requiredPresent = inspectProject({ project: authProject, feature: 'captions' });
  assert(gate(requiredPresent, 'authorization-flow').status === 'available', 'Existing authorization calls must release the gate without user reconfirmation.');

  const authUrlProject = path.join(root, 'authorization-url-project');
  fs.mkdirSync(authUrlProject);
  write(path.join(authUrlProject, 'config.ts'), 'export const authUrl = window.runtimeConfig.licenseEndpoint;\n');
  const authUrlPresent = inspectProject({ project: authUrlProject, feature: 'captions' });
  assert(gate(authUrlPresent, 'authorization-flow').status === 'provisionable' && !authUrlPresent.blocking.includes('authorization-flow'), 'An existing authentication URL reference must be directly provisionable without asking for a policy decision.');

  const cdnProject = path.join(root, 'cdn-project');
  fs.mkdirSync(cdnProject);
  write(path.join(cdnProject, 'package.json'), JSON.stringify({ dependencies: { meishewasmloader: '2.0.0' } }));
  write(path.join(cdnProject, 'sdk-init.ts'), [
    "import loader from 'meishewasmloader';",
    "const sdkRoot = 'https://cdn.example.invalid/meishe/';",
    'loader.loadEmscriptenModule(sdkRoot, {});',
    'const context = nvsGetStreamingContextInstance();',
    'context.initInternalResources();',
  ].join('\n'));
  const cdnUnbound = inspectProject({
    project: cdnProject,
    feature: 'captions',
    targetSdk: path.join(source, 'NvStreamingSdk.js'),
    requiredSymbols: ['NvsTimeline.addCaption'],
    runtimeSdkVersion: '3.16.0',
  });
  assert(gate(cdnUnbound, 'api-capability-surface').status === 'available', 'An independent SDK may still produce useful static surface evidence.');
  assert(gate(cdnUnbound, 'target-sdk-runtime-provenance').status === 'decision-required' && !cdnUnbound.featureImplementationReady, 'An unrelated independent SDK file must not release configured-runtime feature readiness.');
  const cdnPresent = inspectProject({
    project: cdnProject,
    feature: 'captions',
    targetSdk: path.join(source, 'NvStreamingSdk.js'),
    targetSdkProvenance: 'configured-runtime-response',
    requiredSymbols: ['NvsTimeline.addCaption'],
    runtimeSdkVersion: '3.16.0',
  });
  assert(gate(cdnPresent, 'runtime-installation').status === 'available' && gate(cdnPresent, 'runtime-installation').evidenceKind === 'configured-runtime', 'A configured CDN runtime must satisfy installation without public/wasm.');
  assert(gate(cdnPresent, 'sdk-api').status === 'available', 'A configured CDN SDK root must satisfy the SDK API gate.');
  assert(gate(cdnPresent, 'wasm-runtime').status === 'available', 'A configured CDN loader root must satisfy the WASM gate.');
  assert(gate(cdnPresent, 'api-capability-surface').status === 'available' && cdnPresent.targetSdk === path.join(source, 'NvStreamingSdk.js'), 'A CDN runtime must accept an independent read-only target SDK file for capability checks.');
  assert(gate(cdnPresent, 'target-sdk-runtime-provenance').status === 'available' && gate(cdnPresent, 'target-sdk-runtime-provenance').normalizedSha256, 'A configured-runtime response attestation must bind the target file and retain its normalized hash.');
  assert(cdnPresent.staticApiHeaderOrigin === 'independent-target' && gate(cdnPresent, 'runtime-sdk-version').staticApiHeaderOrigin === 'independent-target', 'Header evidence must point to the independent target actually inspected, not the configured source file.');
  assert(gate(cdnPresent, 'runtime-delivery-coherence').status === 'unknown' && !cdnPresent.blocking.includes('runtime-delivery-coherence'), 'A CDN flow must remain runtime-pending without asking for pairing reconfirmation.');
  assert(gate(cdnPresent, 'authorization-flow').status === 'available' && gate(cdnPresent, 'authorization-flow').evidenceKind === 'existing-initialization', 'A complete CDN-backed initialization must avoid reopening authorization.');

  write(path.join(runtime, 'public', 'wasm', 'NvWasmPlayer.js'), 'conflict\n');
  const conflict = inspectProject({ project: runtime, runtimeSource: source, feature: 'captions', authorizationMode: 'skip' });
  assert(gate(conflict, 'runtime-installation').status === 'unknown' && conflict.blocking.includes('runtime-installation'), 'A conflicting installed runtime must block.');
  let conflictRejected = false;
  try {
    installRuntime({ source, project: runtime, userConfirmed: true });
  } catch (error) {
    conflictRejected = /Refusing to overwrite/.test(error.message);
  }
  assert(conflictRejected, 'The runtime installer must refuse conflicting files without overwriting them.');

  const incomplete = path.join(root, 'incomplete-runtime');
  fs.mkdirSync(incomplete);
  write(path.join(incomplete, 'NvStreamingSdk.js'), '');
  const incompleteResult = inspectProject({ project: empty, runtimeSource: incomplete, feature: 'captions', authorizationMode: 'skip' });
  assert(gate(incompleteResult, 'runtime-installation').status === 'missing-external', 'An incomplete delivery must be rejected.');

  const webLocal = path.join(root, 'weblocal-project');
  fs.mkdirSync(webLocal);
  write(path.join(webLocal, 'package.json'), JSON.stringify({ dependencies: { mediabunny: '^1.0.0' } }));
  write(path.join(webLocal, 'media.ts'), 'context.registerLocalFile(file); const mediaPath = "/localmedia/item.weblocal";\n');
  const webLocalResult = inspectProject({ project: webLocal, feature: 'media-fs-and-weblocal', authorizationMode: 'skip' });
  assert(gate(webLocalResult, 'media-strategy').status === 'available', 'Existing WebLocal code must satisfy the static media-strategy gate.');
  assert(gate(webLocalResult, 'weblocal-parser').status === 'available', 'A declared mediabunny dependency must satisfy the parser gate.');
  assert(gate(webLocalResult, 'media-validation-input').status === 'missing-external', 'Existing WebLocal code must not masquerade as an actual local validation file.');

  const webLocalLabelOnly = path.join(root, 'weblocal-label-only-project');
  fs.mkdirSync(webLocalLabelOnly);
  write(path.join(webLocalLabelOnly, 'media-card.tsx'), 'export const sourceLabel = "Local WebLocal";\n');
  write(path.join(webLocalLabelOnly, 'sdk.d.ts'), 'declare interface Context { registerLocalFile(file: File): string; }\n');
  const webLocalLabelOnlyResult = inspectProject({ project: webLocalLabelOnly, feature: 'media-fs-and-weblocal', authorizationMode: 'skip' });
  assert(gate(webLocalLabelOnlyResult, 'media-strategy').status === 'decision-required', 'A UI label or SDK declaration containing WebLocal must not count as implementation evidence.');
  assert(!gate(webLocalLabelOnlyResult, 'weblocal-parser'), 'UI-only and declaration-only WebLocal references must not create a parser gate.');

  const chosenWebLocal = inspectProject({
    project: webLocalLabelOnly,
    feature: 'media-fs-and-weblocal',
    authorizationMode: 'skip',
    mediaStrategy: 'weblocal',
    mediaInputKinds: ['local-file'],
  });
  assert(gate(chosenWebLocal, 'media-strategy').status === 'available', 'An explicit customer WebLocal choice must satisfy the strategy decision.');
  assert(gate(chosenWebLocal, 'media-strategy').evidenceKind === 'caller-attested-user-decision', 'Media decision flags must remain caller attestations.');
  assert(gate(chosenWebLocal, 'media-strategy').action.includes('selected WebLocal path'), 'An explicit WebLocal choice must never produce an M3U8 action.');
  assert(gate(chosenWebLocal, 'media-validation-input').status === 'available', 'A strategy-matching local-file input kind must remain visible as available evidence.');
  assert(gate(chosenWebLocal, 'weblocal-parser').status === 'approval-required', 'WebLocal selection must request mediabunny approval only after selection.');
  assert(gate(chosenWebLocal, 'weblocal-parser').command === 'npm install mediabunny', 'WebLocal parser approval must expose the exact install command.');
  assert(gate(chosenWebLocal, 'media-input-consistency').status === 'available' && gate(chosenWebLocal, 'media-input-consistency').unusedInputKinds.length === 0, 'A matching WebLocal input must satisfy media-input consistency.');

  const mismatchedWebLocalInput = inspectProject({
    project: webLocalLabelOnly,
    feature: 'media-fs-and-weblocal',
    authorizationMode: 'skip',
    mediaStrategy: 'weblocal',
    mediaInputKinds: ['meishe-m3u8'],
  });
  assert(gate(mismatchedWebLocalInput, 'media-input-consistency').status === 'unknown', 'An inactive-path input kind must fail closed.');
  assert(gate(mismatchedWebLocalInput, 'media-input-consistency').unusedInputKinds.join(',') === 'meishe-m3u8' && !mismatchedWebLocalInput.featureImplementationReady, 'Unused media input kinds must be exposed and block feature implementation.');

  const orphanMediaInput = inspectProject({
    project: webLocalLabelOnly,
    feature: 'captions',
    authorizationMode: 'skip',
    mediaInputKinds: ['local-file'],
  });
  assert(gate(orphanMediaInput, 'media-input-consistency').status === 'decision-required', 'An input kind without an active strategy must not be silently ignored.');

  const chosenM3u8WithoutInput = inspectProject({
    project: webLocalLabelOnly,
    feature: 'media-fs-and-weblocal',
    authorizationMode: 'skip',
    mediaStrategy: 'meishe-transcoded-m3u8',
  });
  assert(gate(chosenM3u8WithoutInput, 'media-validation-input').status === 'missing-external', 'A selected M3U8 strategy must request actual Meishe-transcoded validation output up front.');
  assert(chosenM3u8WithoutInput.featureInputBlocking.includes('media-validation-input'), 'Missing media must be visible in feature-input readiness.');

  const m3u8 = path.join(root, 'm3u8-project');
  fs.mkdirSync(m3u8);
  write(path.join(m3u8, 'media.ts'), 'const manifestPath = `/m3u8/${crypto.randomUUID()}.m3u8`;\n');
  const m3u8Result = inspectProject({ project: m3u8, feature: 'media-fs-and-weblocal', authorizationMode: 'skip' });
  assert(gate(m3u8Result, 'media-strategy').strategy === 'meishe-transcoded-m3u8', 'An m3u8 path must expose the transcoded-M3U8 strategy candidate.');
  assert(gate(m3u8Result, 'media-strategy').status === 'decision-required', 'An m3u8-looking path must await confirmation that it is Meishe-transcoded output.');
  assert(gate(m3u8Result, 'media-strategy').validationPending.includes('cross-segment-playback'), 'M3U8 evidence must keep cross-segment playback pending.');
  assert(!gate(m3u8Result, 'weblocal-parser'), 'An M3U8-only project must not require a WebLocal parser.');

  const persistedM3u8 = path.join(root, 'persisted-m3u8-project');
  fs.mkdirSync(persistedM3u8);
  write(path.join(persistedM3u8, 'media.ts'), "export const mediaSourceType = 'transcoded-m3u8';\nconst path = '/m3u8/item.m3u8';\n");
  const persistedM3u8Result = inspectProject({ project: persistedM3u8, feature: 'media-fs-and-weblocal', authorizationMode: 'skip' });
  assert(gate(persistedM3u8Result, 'media-strategy').status === 'available', 'A persisted M3U8 discriminator must avoid repeating the initial strategy question.');
  assert(gate(persistedM3u8Result, 'media-strategy').evidenceKind === 'persisted-project-decision', 'Persisted M3U8 choice must be distinguishable from a bare manifest candidate.');
  assert(gate(persistedM3u8Result, 'media-validation-input').status === 'missing-external', 'A persisted strategy decision must not fabricate current validation media.');

  const persistedYaml = path.join(root, 'persisted-yaml-project');
  fs.mkdirSync(persistedYaml);
  write(path.join(persistedYaml, 'media.yaml'), 'mediaStrategy: transcoded-m3u8\n');
  const persistedYamlResult = inspectProject({ project: persistedYaml, feature: 'media-fs-and-weblocal', authorizationMode: 'skip' });
  assert(gate(persistedYamlResult, 'media-strategy').status === 'available' && gate(persistedYamlResult, 'media-strategy').strategy === 'meishe-transcoded-m3u8', 'A valid unquoted YAML strategy value must persist the initial decision.');

  const mediaTypeOnly = path.join(root, 'media-type-only-project');
  fs.mkdirSync(mediaTypeOnly);
  write(path.join(mediaTypeOnly, 'media.ts'), "type Media = { mediaSourceType: 'weblocal' | 'transcoded-m3u8' };\n");
  const mediaTypeOnlyResult = inspectProject({ project: mediaTypeOnly, feature: 'media-fs-and-weblocal', authorizationMode: 'skip' });
  assert(gate(mediaTypeOnlyResult, 'media-strategy').status === 'decision-required', 'Type-only media discriminators must never masquerade as a persisted user decision.');
  const m3u8ProjectChoosingWebLocal = inspectProject({
    project: m3u8,
    feature: 'media-fs-and-weblocal',
    authorizationMode: 'skip',
    mediaStrategy: 'weblocal',
    mediaInputKinds: ['local-file'],
  });
  assert(gate(m3u8ProjectChoosingWebLocal, 'media-strategy').strategy === 'weblocal', 'An explicit media decision must override an unconfirmed strategy candidate instead of silently becoming mixed.');
  assert(!gate(m3u8ProjectChoosingWebLocal, 'media-strategy').validationPending.includes('cross-segment-playback'), 'Choosing WebLocal must exclude M3U8-only runtime validations even when an M3U8 candidate exists.');

  const webLocalProjectChoosingM3u8 = inspectProject({
    project: webLocal,
    feature: 'media-fs-and-weblocal',
    authorizationMode: 'skip',
    mediaStrategy: 'meishe-transcoded-m3u8',
    mediaInputKinds: ['meishe-m3u8'],
  });
  assert(!gate(webLocalProjectChoosingM3u8, 'weblocal-parser'), 'Choosing M3U8 must not add a mediabunny gate merely because inactive WebLocal code exists.');
  assert(gate(webLocalProjectChoosingM3u8, 'media-strategy').reason.includes('selected meishe-transcoded-m3u8'), 'The explicit M3U8 decision must control the media reason.');
  assert(!gate(webLocalProjectChoosingM3u8, 'media-strategy').validationPending.includes('file-registration'), 'Choosing M3U8 must exclude WebLocal-only runtime validations.');

  const mixedMedia = path.join(root, 'mixed-media-project');
  fs.mkdirSync(mixedMedia);
  write(path.join(mixedMedia, 'package.json'), JSON.stringify({ dependencies: { mediabunny: '^1.0.0' } }));
  write(path.join(mixedMedia, 'media.ts'), [
    'context.registerLocalFile(file);',
    'const localPath = "/localmedia/item.weblocal";',
    'const remotePath = "/m3u8/item.m3u8";',
  ].join('\n'));
  const mixedMediaResult = inspectProject({ project: mixedMedia, feature: 'media-fs-and-weblocal', authorizationMode: 'skip' });
  const mixedMediaStrategy = gate(mixedMediaResult, 'media-strategy');
  assert(mixedMediaStrategy.strategy === 'mixed', 'A project using both media paths must report a mixed strategy.');
  assert(mixedMediaStrategy.strategies.join(',') === 'weblocal,meishe-transcoded-m3u8', 'Mixed media inspection must preserve both detected strategies.');
  assert(mixedMediaStrategy.evidence.length === 1 && mixedMediaStrategy.evidence[0] === 'media.ts', 'Mixed media evidence must remain deduplicated.');
  assert(gate(mixedMediaResult, 'weblocal-parser').status === 'available', 'A mixed project must retain the WebLocal parser gate.');
  assert(gate(mixedMediaResult, 'media-validation-input').status === 'missing-external', 'Detected mixed workflows must still request actual validation inputs.');
  const selectedMixedMedia = inspectProject({
    project: mixedMedia,
    feature: 'media-fs-and-weblocal',
    authorizationMode: 'skip',
    mediaStrategy: 'mixed',
    mediaInputKinds: ['meishe-m3u8', 'local-file'],
  });
  assert(gate(selectedMixedMedia, 'media-strategy').strategy === 'mixed', 'The customer must be able to explicitly keep M3U8 and WebLocal active together.');
  assert(gate(selectedMixedMedia, 'media-validation-input').status === 'available', 'Mixed selection must require and accept one matching input kind for each path.');
  assert(gate(selectedMixedMedia, 'media-strategy').validationPending.includes('cross-segment-playback') && gate(selectedMixedMedia, 'media-strategy').validationPending.includes('file-registration'), 'Mixed selection must preserve validations for both active paths.');

  const persistedMixed = path.join(root, 'persisted-mixed-project');
  fs.mkdirSync(persistedMixed);
  write(path.join(persistedMixed, 'package.json'), JSON.stringify({ dependencies: { mediabunny: '^1.0.0' } }));
  write(path.join(persistedMixed, 'media.ts'), [
    "const remoteMediaSourceType = 'transcoded-m3u8';",
    "const localMediaSourceType = 'weblocal';",
  ].join('\n'));
  const persistedMixedResult = inspectProject({ project: persistedMixed, feature: 'media-fs-and-weblocal', authorizationMode: 'skip' });
  assert(gate(persistedMixedResult, 'media-strategy').status === 'available' && gate(persistedMixedResult, 'media-strategy').strategy === 'mixed', 'Persisted discriminators must allow both strategies without a repeated choice.');
}

function runCompare(target, symbols, runtimeSdkVersion) {
  const result = compareSdkCapabilities({ targetSdk: target, symbols: symbols.split(','), runtimeSdkVersion, json: true });
  return {
    status: result.exitCode,
    stdout: JSON.stringify(result.payload),
    stderr: '',
    payload: result.payload,
  };
}

function compareFixtures(root) {
  const staticOnly = runCompare(path.join(SKILL_DIR, 'references', 'NvStreamingSdk.js'), 'NvsTimeline.addCaption');
  assert(staticOnly.status === 0 && staticOnly.payload.runtimeSdkVersion === null, 'Static API surface comparison must run before a runtime version is available.');
  assert(staticOnly.payload.posture === 'exact-baseline-file-runtime-pending', 'Static baseline-file identity must not claim an exact runtime match.');
  assert(staticOnly.payload.surfaceDiagnostics.strategy === 'baseline-manifest', 'An exact baseline hash must use the trusted API manifest instead of reparsing source formatting.');
  const baselineInternalResources = runCompare(path.join(SKILL_DIR, 'references', 'NvStreamingSdk.js'), 'NvsStreamingContext.initInternalResources');
  assert(baselineInternalResources.status === 0, 'The exact baseline manifest must preserve initInternalResources regardless of its source indentation.');
  assert(baselineInternalResources.payload.results[0].targetLine === 2536, 'Baseline-manifest results must retain the source line for diagnostics.');
  const exact = runCompare(path.join(SKILL_DIR, 'references', 'NvStreamingSdk.js'), 'NvsTimeline.addCaption', '3.16.0');
  assert(exact.status === 0, `Exact baseline surface fixture must pass (exit=${exact.status}, stderr=${exact.stderr || 'none'}).`);
  assert(exact.payload.posture === 'exact-baseline', 'Exact baseline hash must produce exact-baseline posture.');
  assert(exact.payload.results[0].status === 'surface-present', 'Present symbols must use surface-present status.');

  const newer = path.join(root, 'newer-sdk.js');
  write(newer, '/** @version 3.17.0 */\nclass NvsTimeline {\n    addCaption(a, b, c, d, e) {}\n}\n');
  const newerResult = runCompare(newer, 'NvsTimeline.addCaption', '3.17.0');
  assert(newerResult.status === 0, 'Newer target with baseline surface must pass the surface fixture.');
  assert(newerResult.payload.posture === 'newer-version-baseline-surface-only', 'Newer target must use baseline-only posture.');
  assert(newerResult.payload.surfaceDiagnostics.strategy === 'structural-scanner', 'Unknown SDK hashes must use the lightweight structural scanner.');

  for (const [name, indent] of [['none', ''], ['two spaces', '  '], ['three spaces', '   '], ['four spaces', '    '], ['tab', '\t']]) {
    const formatted = path.join(root, `formatted-${name.replace(/\s+/g, '-')}.js`);
    write(formatted, [
      '/** @version 3.17.0 */',
      'class NvsStreamingContext {',
      `${indent}initInternalResources() {`,
      `${indent}  const braces = "{ ignored }"; // } ignored`,
      `${indent}}`,
      '}',
      '',
    ].join('\n'));
    const formattedResult = runCompare(formatted, 'NvsStreamingContext.initInternalResources', '3.17.0');
    assert(formattedResult.status === 0, `${name} method indentation must not affect SDK surface detection.`);
  }

  const changed = path.join(root, 'changed-sdk.js');
  write(changed, '/** @version 3.15.0 */\nclass NvsTimeline {\n    addCaption(a, b, c, d) {}\n}\n');
  const changedResult = runCompare(changed, 'NvsTimeline.addCaption', '3.15.0');
  assert(changedResult.status === 2, 'Changed parameter shape must return exit code 2.');
  assert(changedResult.payload.results[0].status === 'changed', 'Changed parameter shape must be labeled changed.');

  const compact = path.join(root, 'compact-sdk.js');
  write(compact, '/** @version 3.16.0 */ class NvsTimeline { addCaption(a, b, c, d, e) {} }');
  const compactResult = runCompare(compact, 'NvsTimeline.addCaption', '3.16.0');
  assert(compactResult.status === 2, 'An unsupported compact SDK layout must remain non-successful.');
  assert(compactResult.payload.results[0].status === 'unparseable', 'An unsupported SDK layout must not be reported as a missing API.');
  assert(compactResult.payload.surfaceDiagnostics.parseable === false, 'Compact SDK diagnostics must expose parser uncertainty.');

  const truncated = path.join(root, 'truncated-sdk.js');
  write(truncated, '/** @version 3.17.0 */\nclass NvsStreamingContext {\n  getSdkVersion() {\n    return {};\n');
  const truncatedResult = runCompare(truncated, 'NvsStreamingContext.initInternalResources', '3.17.0');
  assert(truncatedResult.status === 2, 'A truncated owner class must not pass compatibility comparison.');
  assert(truncatedResult.payload.results[0].status === 'unparseable', 'A missing symbol in an incomplete owner class must not be reported as missing.');

  const completeMissing = path.join(root, 'complete-missing-sdk.js');
  write(completeMissing, '/** @version 3.17.0 */\nclass NvsStreamingContext {\n  getSdkVersion() {}\n}\n');
  const completeMissingResult = runCompare(completeMissing, 'NvsStreamingContext.initInternalResources', '3.17.0');
  assert(completeMissingResult.payload.results[0].status === 'missing', 'A completely parsed owner class may prove that a required method is missing.');

  const unknownResult = runCompare(newer, 'NvsTimeline.notInBaseline', '3.17.0');
  assert(unknownResult.status === 2 && unknownResult.payload.results[0].status === 'unknown', 'Unknown baseline symbol must return exit code 2.');

  const wrongHeader = path.join(root, 'wrong-header-sdk.js');
  write(wrongHeader, '/** @version 3.15.0 */\nclass NvsTimeline {\n    addCaption(a, b, c, d, e) {}\n}\n');
  const wrongHeaderResult = runCompare(wrongHeader, 'NvsTimeline.addCaption', '3.16.0');
  assert(wrongHeaderResult.status === 0, 'A wrong @version header alone must not block a present required surface.');
  assert(wrongHeaderResult.payload.staticHeaderMatchesRuntime === false && wrongHeaderResult.payload.staticHeaderMismatchBlocking === false, 'Static/runtime mismatch must remain a non-blocking warning.');
}

function domainFixtures() {
  const manifest = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'references', 'api-manifest.json'), 'utf8'));
  const symbol = (name) => manifest.symbols.find((item) => item.fullName === name);
  assert(symbol('NvsAudioFileWriter').domains.includes('audio-editing'), 'NvsAudioFileWriter must be routed to audio-editing.');
  assert(!symbol('NvsAudioFileWriter.close').domains.includes('engine-lifecycle'), 'NvsAudioFileWriter.close must not be routed to engine-lifecycle.');
  assert(symbol('NvsTimeline.getAudioTrackByIndex').domains.includes('timeline-track-clip'), 'Audio track accessors must be routed to timeline.');
  assert(symbol('NvsTimeline.getAudioTrackByIndex').domains.includes('audio-editing'), 'Audio track accessors must be routed to audio.');
  assert(symbol('NvsTimeline.getVideoTrackByIndex').domains.includes('timeline-track-clip'), 'Video track accessors must be routed to timeline.');
  assert(symbol('NvsTimeline.getVideoTrackByIndex').domains.includes('video-editing'), 'Video track accessors must be routed to video.');
  for (const name of [
    'NvsVideoClip.enableClipFreezeFrame',
    'NvsVideoClip.isClipFreezeFrameEnabled',
    'NvsVideoClip.setClipFreezeFrameTrimPosition',
    'NvsVideoClip.getClipFreezeFrameTrimPosition',
  ]) {
    assert(symbol(name).domains.includes('video-editing'), `${name} must be routed to video editing.`);
    assert(!symbol(name).domains.includes('metadata-thumbnail-waveform'), `${name} must not be routed to metadata.`);
  }
}

function runDistribution(skillCopy) {
  const result = validateDistribution(skillCopy);
  return { status: result.errors.length ? 1 : 0, stderr: result.errors.join('\n') };
}

function distributionNegativeFixtures(root) {
  const copy = path.join(root, path.basename(SKILL_DIR));
  fs.cpSync(SKILL_DIR, copy, { recursive: true });
  const badPath = path.join(copy, 'bad-path.txt');
  write(badPath, ['C:', '\\Users', 'Example', 'private.txt'].join('\\'));
  assert(runDistribution(copy).status !== 0, 'Absolute Windows user paths must fail distribution validation.');
  fs.unlinkSync(badPath);

  const badMap = path.join(copy, 'bad-map.ts');
  write(badMap, ['//# source', 'MappingURL=missing.map'].join(''));
  assert(runDistribution(copy).status !== 0, 'Missing source maps must fail distribution validation.');
  fs.unlinkSync(badMap);

  const badLink = path.join(copy, 'bad-link.md');
  write(badLink, '[outside](../../outside.txt)\n');
  assert(runDistribution(copy).status !== 0, 'Markdown links escaping the Skill must fail distribution validation.');
  fs.unlinkSync(badLink);

  const target = path.join(copy, 'link-target.txt');
  const link = path.join(copy, 'link.txt');
  write(target, 'target');
  try {
    fs.symlinkSync(target, link, 'file');
    assert(runDistribution(copy).status !== 0, 'Symbolic links must fail distribution validation.');
    fs.unlinkSync(link);
  } catch (error) {
    if (fs.existsSync(link)) fs.unlinkSync(link);
    if (error.message.includes('Symbolic links must fail')) throw error;
  }
  fs.unlinkSync(target);

  const openaiFile = path.join(copy, 'agents', 'openai.yaml');
  const validOpenai = fs.readFileSync(openaiFile, 'utf8');
  write(openaiFile, validOpenai.replace(/default_prompt:\s+"([^"]+)"/, 'default_prompt: $1'));
  assert(runDistribution(copy).status !== 0, 'Unquoted agents/openai.yaml string values must fail Skill metadata validation.');
  write(openaiFile, validOpenai);
  assert(runDistribution(copy).status === 0, 'Clean copied distribution must pass after negative fixtures are removed.');
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meishe-skill-fixtures-'));
  try {
    inspectFixtures(root);
    compareFixtures(root);
    domainFixtures();
    distributionNegativeFixtures(root);
    console.log(JSON.stringify({ status: 'pass', suites: ['inspection', 'compatibility', 'domain-routing', 'distribution-negative'] }, null, 2));
  } finally {
    const resolvedRoot = path.resolve(root);
    const resolvedTemp = path.resolve(os.tmpdir());
    if (!resolvedRoot.startsWith(`${resolvedTemp}${path.sep}`)) throw new Error(`Refusing to remove unexpected fixture directory: ${resolvedRoot}`);
    fs.rmSync(resolvedRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
