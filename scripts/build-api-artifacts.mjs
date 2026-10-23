#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.dirname(SCRIPT_DIR);

export const DOMAIN_DEFINITIONS = [
  ['integration-core', 'integration-core.md', 'SDK loading, authorization, shared values, and core integration.'],
  ['engine-lifecycle', 'engine-lifecycle.md', 'Streaming context lifecycle, initialization, state, and cleanup.'],
  ['media-fs-and-weblocal', 'media-fs-and-weblocal.md', 'Virtual FS, local/network media, fonts, and WebLocal resources.'],
  ['timeline-track-clip', 'timeline-track-clip.md', 'Timeline, track, and clip object structure and editing operations.'],
  ['monitor-playback-coordinate', 'monitor-playback-coordinate.md', 'LiveWindow, playback, seek, canvas, and coordinate conversion.'],
  ['video-editing', 'video-editing.md', 'Video/image clips, transforms, speed, blending, and watermarks.'],
  ['audio-editing', 'audio-editing.md', 'Audio tracks, clips, volume, fades, channels, and audio effects.'],
  ['captions', 'captions.md', 'Timeline/track/clip captions and text styling.'],
  ['stickers', 'stickers.md', 'Timeline/track/clip animated stickers and custom stickers.'],
  ['effects-transitions', 'effects-transitions.md', 'Video/audio effects, filters, color, and transitions.'],
  ['keyframes-and-animation', 'keyframes-and-animation.md', 'Keyframes, curves, motion, and animation timing.'],
  ['templates-and-nested-timelines', 'templates-and-nested-timelines.md', 'Templates, template footage, and nested timelines.'],
  ['advanced-effects', 'advanced-effects.md', 'Particles, AR, masks, keying, human detection, and advanced effects.'],
  ['asset-package-management', 'asset-package-management.md', 'Asset package install, status, upgrade, authorization, and removal.'],
  ['metadata-thumbnail-waveform', 'metadata-thumbnail-waveform.md', 'AV metadata, thumbnails, icons, waveforms, codecs, and frame grabbing.'],
  ['project-xml-and-persistence', 'project-xml-and-persistence.md', 'Project/XML persistence and project/template package generation.'],
];

// These audited anchors make domain validation semantic rather than merely
// proving that every symbol was assigned somewhere.
export const DOMAIN_REQUIREMENTS = {
  'integration-core': ['Module', 'FS'],
  'engine-lifecycle': ['NvsStreamingContext.initInternalResources', 'NvsStreamingContext.streamingEngineReadyForTimelineModification'],
  'media-fs-and-weblocal': ['NvsStreamingContext.registerLocalFile'],
  'timeline-track-clip': ['NvsTimeline', 'NvsTimeline.getAudioTrackByIndex'],
  'monitor-playback-coordinate': ['NvsStreamingContext.createLiveWindow'],
  'video-editing': ['NvsVideoClip', 'NvsTimeline.getVideoTrackByIndex'],
  'audio-editing': ['NvsAudioFileWriter', 'NvsAudioFileWriter.close', 'NvsTimeline.getAudioTrackByIndex'],
  captions: ['NvsTimeline.addCaption'],
  stickers: ['NvsTimeline.addAnimatedSticker'],
  'effects-transitions': ['NvsFx.setFloatVal', 'NvsTimeline.addBuiltinTimelineVideoFx'],
  'keyframes-and-animation': ['NvsFx.setParamKeyframeAtTime'],
  'templates-and-nested-timelines': ['NvsStreamingContext.createTemplateTimeline'],
  'advanced-effects': ['NvsFx.getARSceneManipulate'],
  'asset-package-management': ['NvsAssetPackageManager.installAssetPackage'],
  'metadata-thumbnail-waveform': ['NvsStreamingContext.getAVFileInfo'],
  'project-xml-and-persistence': ['NvsStreamingContext.loadProject'],
};

export const FEATURE_ALIASES = {
  sdk: 'integration-core',
  core: 'integration-core',
  loading: 'integration-core',
  lifecycle: 'engine-lifecycle',
  authorization: 'engine-lifecycle',
  media: 'media-fs-and-weblocal',
  weblocal: 'media-fs-and-weblocal',
  m3u8: 'media-fs-and-weblocal',
  transcoding: 'media-fs-and-weblocal',
  timeline: 'timeline-track-clip',
  tracks: 'timeline-track-clip',
  clips: 'timeline-track-clip',
  monitor: 'monitor-playback-coordinate',
  playback: 'monitor-playback-coordinate',
  livewindow: 'monitor-playback-coordinate',
  video: 'video-editing',
  audio: 'audio-editing',
  effects: 'effects-transitions',
  transitions: 'effects-transitions',
  keyframes: 'keyframes-and-animation',
  templates: 'templates-and-nested-timelines',
  masks: 'advanced-effects',
  packages: 'asset-package-management',
  metadata: 'metadata-thumbnail-waveform',
  xml: 'project-xml-and-persistence',
  persistence: 'project-xml-and-persistence',
};

const SUMMARY_OVERRIDES = {
  'NvsVideoClip.enableClipFreezeFrame': {
    en: 'Enables or disables freeze frame for the video clip.',
    zh: '启用或禁用视频片段冻结帧。',
  },
};

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function normalizeSpace(value = '') {
  return value.replace(/\s+/g, ' ').trim();
}

function declarationComplete(value) {
  let round = 0;
  let square = 0;
  let curly = 0;
  for (const char of value) {
    if (char === '(') round += 1;
    else if (char === ')') round -= 1;
    else if (char === '[') square += 1;
    else if (char === ']') square -= 1;
    else if (char === '{') curly += 1;
    else if (char === '}') curly -= 1;
  }
  return value.endsWith(';') && round === 0 && square === 0 && curly === 0;
}

function cleanDoc(lines) {
  const cleaned = lines.map((line) => line
    .replace(/^\s*\/\*\*?\s?/, '')
    .replace(/^\s*\*\s?/, '')
    .replace(/\s*\*\/\s*$/, '')
    .trim());
  let language = 'en';
  const summaries = { en: '', zh: '' };
  for (const line of cleaned) {
    if (line === '@if ENGLISH') {
      language = 'en';
      continue;
    }
    if (line === '@else') {
      language = 'zh';
      continue;
    }
    if (line === '@endif') continue;
    if (line.startsWith('@brief ')) {
      summaries[language] = normalizeSpace(line.slice(7));
    }
  }
  if (!summaries.en) {
    const fallback = cleaned.find((line) => line && !line.startsWith('@'));
    summaries.en = normalizeSpace(fallback || '');
  }
  return summaries;
}

function splitParams(signature) {
  const start = signature.indexOf('(');
  const end = signature.lastIndexOf(')');
  if (start < 0 || end < start) return [];
  const source = signature.slice(start + 1, end).trim();
  if (!source) return [];
  const params = [];
  let current = '';
  let depth = 0;
  for (const char of source) {
    if ('<([{'.includes(char)) depth += 1;
    if ('>)]}'.includes(char)) depth -= 1;
    if (char === ',' && depth === 0) {
      params.push(normalizeSpace(current));
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) params.push(normalizeSpace(current));
  return params;
}

function symbolRecord({ name, kind, owner = null, signature, summary, typeLine }) {
  const fullName = owner ? `${owner}.${name}` : name;
  return {
    fullName,
    name,
    kind,
    owner,
    signature: normalizeSpace(signature),
    parameters: splitParams(signature),
    summary,
    typeLine,
  };
}

export function parseTypeDeclarations(typeSource) {
  const lines = typeSource.split(/\r?\n/);
  const symbols = [];
  let doc = [];
  let collectingDoc = false;
  let currentClass = null;
  let currentEnum = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    let trimmed = line.trim();
    if (trimmed.startsWith('/**')) {
      collectingDoc = true;
      doc = [line];
      if (trimmed.endsWith('*/')) collectingDoc = false;
      continue;
    }
    if (collectingDoc) {
      doc.push(line);
      if (trimmed.endsWith('*/')) collectingDoc = false;
      continue;
    }
    if (!trimmed) continue;
    const summary = cleanDoc(doc);
    const declarationLine = index + 1;
    if (currentClass && trimmed !== '}' && !declarationComplete(trimmed)) {
      while (index + 1 < lines.length && !declarationComplete(trimmed)) {
        index += 1;
        trimmed = `${trimmed} ${lines[index].trim()}`;
      }
    }

    if (!currentClass && !currentEnum) {
      let match = trimmed.match(/^declare\s+class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$]*))?\s*\{$/);
      if (match) {
        currentClass = match[1];
        symbols.push(symbolRecord({ name: match[1], kind: 'class', signature: trimmed, summary, typeLine: declarationLine }));
        doc = [];
        continue;
      }
      match = trimmed.match(/^declare\s+function\s+([A-Za-z_$][\w$]*)\s*(\(.*\)\s*:\s*.*);$/);
      if (match) {
        symbols.push(symbolRecord({ name: match[1], kind: 'globalFunction', signature: `${match[1]}${match[2]}`, summary, typeLine: declarationLine }));
        doc = [];
        continue;
      }
      match = trimmed.match(/^declare\s+(?:const|var)\s+([A-Za-z_$][\w$]*)\s*:\s*Readonly<\{$/);
      if (match) {
        currentEnum = match[1];
        symbols.push(symbolRecord({ name: match[1], kind: 'enum', signature: trimmed, summary, typeLine: declarationLine }));
        doc = [];
        continue;
      }
      match = trimmed.match(/^declare\s+(const|var)\s+([A-Za-z_$][\w$]*)\s*:\s*(.*);$/);
      if (match) {
        symbols.push(symbolRecord({ name: match[2], kind: match[1] === 'var' ? 'globalVariable' : 'constant', signature: trimmed, summary, typeLine: declarationLine }));
        doc = [];
        continue;
      }
      if (/^declare\s+/.test(trimmed)) {
        throw new Error(`Unsupported top-level declaration at sdk.d.ts:${index + 1}: ${trimmed}`);
      }
      doc = [];
      continue;
    }

    if (currentEnum) {
      if (trimmed === '}>;') {
        currentEnum = null;
        doc = [];
        continue;
      }
      const match = trimmed.match(/^(?:readonly\s+)?(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*(.*);$/);
      if (match) {
        symbols.push(symbolRecord({ name: match[1] || match[2] || match[3], owner: currentEnum, kind: 'enumMember', signature: trimmed, summary, typeLine: declarationLine }));
        doc = [];
        continue;
      }
      throw new Error(`Unsupported enum declaration at sdk.d.ts:${index + 1}: ${trimmed}`);
    }

    if (currentClass) {
      if (trimmed === '}') {
        currentClass = null;
        doc = [];
        continue;
      }
      if (/^constructor\s*\(.*\);$/.test(trimmed)) {
        symbols.push(symbolRecord({ name: 'constructor', owner: currentClass, kind: 'constructor', signature: trimmed, summary, typeLine: declarationLine }));
        doc = [];
        continue;
      }
      let accessor = trimmed.match(/^(get|set)\s+([A-Za-z_$][\w$]*)\s*(\(.*\)(?:\s*:\s*.*)?);$/);
      if (accessor) {
        symbols.push(symbolRecord({ name: accessor[2], owner: currentClass, kind: accessor[1] === 'get' ? 'getter' : 'setter', signature: trimmed, summary, typeLine: declarationLine }));
        doc = [];
        continue;
      }
      let match = trimmed.match(/^(static\s+)?([A-Za-z_$][\w$]*)\s*(\(.*\)\s*:\s*.*);$/);
      if (match) {
        symbols.push(symbolRecord({ name: match[2], owner: currentClass, kind: match[1] ? 'staticMethod' : 'method', signature: `${match[2]}${match[3]}`, summary, typeLine: declarationLine }));
        doc = [];
        continue;
      }
      match = trimmed.match(/^([A-Za-z_$][\w$]*)\s*:\s*(.*);$/);
      if (match) {
        const callback = /=>|\bfunction\b/.test(match[2]) || /^on[A-Z_]/.test(match[1]);
        symbols.push(symbolRecord({ name: match[1], owner: currentClass, kind: callback ? 'callback' : 'property', signature: trimmed, summary, typeLine: declarationLine }));
        doc = [];
        continue;
      }
      throw new Error(`Unsupported class declaration at sdk.d.ts:${index + 1}: ${trimmed}`);
    }
  }

  if (currentClass || currentEnum || collectingDoc) throw new Error('Unclosed declaration or JSDoc in sdk.d.ts');
  const unique = new Map();
  for (const symbol of symbols) {
    const key = `${symbol.kind}:${symbol.fullName}:${symbol.signature}`;
    unique.set(key, symbol);
  }
  return [...unique.values()];
}

function createLineLocator(source) {
  const lines = source.split(/\r?\n/);
  const topLevelLines = new Map();
  const ownerRanges = new Map();
  const memberLines = new Map();
  return (symbol) => {
    const escapedName = symbol.name.replace(/[$]/g, '\\$&');
    if (!symbol.owner) {
      if (!topLevelLines.has(symbol.name)) {
        const pattern = new RegExp(`\\b(?:class|function|const|var)\\s+${escapedName}\\b`);
        const index = lines.findIndex((line) => pattern.test(line));
        topLevelLines.set(symbol.name, index >= 0 ? index + 1 : null);
      }
      return topLevelLines.get(symbol.name);
    }
    const ownerKind = symbol.kind === 'enumMember' ? 'enum' : 'class';
    const ownerKey = `${ownerKind}:${symbol.owner}`;
    if (!ownerRanges.has(ownerKey)) {
      const escapedOwner = symbol.owner.replace(/[$]/g, '\\$&');
      const start = lines.findIndex((line) => (ownerKind === 'enum'
        ? new RegExp(`^(?:const|var)\\s+${escapedOwner}\\s*=\\s*Object\\.freeze`)
        : new RegExp(`^class\\s+${escapedOwner}\\b`)).test(line.trim()));
      let end = lines.length;
      if (start >= 0) {
        for (let index = start + 1; index < lines.length; index += 1) {
          if (ownerKind === 'enum' ? /^}\);?\s*$/.test(lines[index].trim()) : /^}\s*$/.test(lines[index])) {
            end = index + 1;
            break;
          }
        }
      }
      ownerRanges.set(ownerKey, { start, end });
    }
    const memberKey = `${ownerKey}:${symbol.name}`;
    if (!memberLines.has(memberKey)) {
      const { start, end } = ownerRanges.get(ownerKey);
      let result = null;
      if (start >= 0) {
        const patterns = ownerKind === 'enum'
          ? [new RegExp(`^(?:['"]${escapedName}['"]|${escapedName})\\s*:`)]
          : [new RegExp(`^(?:static\\s+)?(?:get\\s+|set\\s+)?${escapedName}\\s*\\(`), new RegExp(`this\\.${escapedName}\\b`)];
        for (let index = start; index < end; index += 1) {
          if (patterns.some((pattern) => pattern.test(lines[index].trim()))) {
            result = index + 1;
            break;
          }
        }
      }
      memberLines.set(memberKey, result);
    }
    return memberLines.get(memberKey);
  };
}

export function assignDomain(symbol) {
  const haystack = symbol.fullName.toLowerCase();
  const owner = (symbol.owner || '').toLowerCase();
  if (/^nvsvideoclip\.(?:enableclipfreezeframe|isclipfreezeframeenabled|setclipfreezeframetrimposition|getclipfreezeframetrimposition)$/.test(haystack)) return 'video-editing';
  if (/^nvsaudiofilewriter(?:\.|$)/.test(haystack)) return 'audio-editing';
  if (/template|footage|nested|subtimeline/.test(haystack)) return 'templates-and-nested-timelines';
  if (/caption|textspan|timefollow|fontfamily|textalignment/.test(haystack)) return 'captions';
  if (/sticker/.test(haystack)) return 'stickers';
  if (/assetpackage/.test(owner) || /installasset|upgradeasset|uninstallasset|assetpackagestatus/.test(haystack)) return 'asset-package-management';
  if (/particle|arscene|human|face|aitoning|masterkey|mask|regioninfo|emitter/.test(haystack)) return 'advanced-effects';
  if (/keyframe|curve|motionparameter|animation|playbackratecontrol/.test(haystack)) return 'keyframes-and-animation';
  if (/transition|\bfx\b|videofx|audiofx|effect|filter|coloradjust|blending/.test(haystack)) return 'effects-transitions';
  if (/waveform|thumbnail|fileicon|avfileinfo|streaminfo|codecinfo|grabimage|frame/.test(haystack)) return 'metadata-thumbnail-waveform';
  if (/xml|project|generateproject|generate.*package|loadproject|projobj/.test(haystack)) return 'project-xml-and-persistence';
  if (/weblocal|localfile|registerfont|filepath|transcod|\bfs\b|webreader/.test(haystack)) return 'media-fs-and-weblocal';
  if (/livewindow|seek|playback|streamingenginestate|currentposition|resumeaudiocontext|vumeter/.test(haystack)) return 'monitor-playback-coordinate';
  if (/audiotrack|audioclip|audioresolution|volume|audiooutput|audio.*channel|audio.*fade/.test(haystack)) return 'audio-editing';
  if (/videoclip|videoresolution|panandscan|watermark|video.*speed|video.*rotation|video.*transform/.test(haystack)) return 'video-editing';
  if (/timeline|track|clip|inpoint|outpoint|duration/.test(haystack)) return 'timeline-track-clip';
  if (/streamingcontext|init|close|clearcached|preload|decoder|readercount|threadcount/.test(haystack)) return 'engine-lifecycle';
  return 'integration-core';
}

export function assignDomains(symbol) {
  const primary = assignDomain(symbol);
  const domains = [primary];
  if (symbol.fullName === 'FS' && !domains.includes('integration-core')) domains.push('integration-core');
  if (symbol.fullName === 'NvsStreamingContext.streamingEngineReadyForTimelineModification' && !domains.includes('engine-lifecycle')) {
    domains.push('engine-lifecycle');
  }
  // NvsFx is a shared base class. Keep specialized keyframe/region members in
  // their primary domain while also making all typed parameter APIs discoverable
  // from the general effects domain.
  if (symbol.owner === 'NvsFx' && !domains.includes('effects-transitions')) {
    domains.push('effects-transitions');
  }
  // Template attachments are declared on the persistence base object and are
  // needed by both project serialization and template-authoring requests.
  if (symbol.owner === 'NvsProjObj' && !domains.includes('templates-and-nested-timelines')) {
    domains.push('templates-and-nested-timelines');
  }
  // Timeline track accessors are structural timeline APIs and media-domain APIs.
  if (symbol.owner === 'NvsTimeline' && /AudioTrack/.test(symbol.name)) {
    if (!domains.includes('timeline-track-clip')) domains.push('timeline-track-clip');
    if (!domains.includes('audio-editing')) domains.push('audio-editing');
  }
  if (symbol.owner === 'NvsTimeline' && /VideoTrack/.test(symbol.name)) {
    if (!domains.includes('timeline-track-clip')) domains.push('timeline-track-clip');
    if (!domains.includes('video-editing')) domains.push('video-editing');
  }
  return domains;
}

function buildFeatureMap() {
  return {
    schemaVersion: 4,
    sdkVersion: '3.16.0',
    aliases: FEATURE_ALIASES,
    domains: DOMAIN_DEFINITIONS.map(([id, reference, description]) => ({
      id,
      reference,
      description,
      requiredSymbols: DOMAIN_REQUIREMENTS[id] || [],
    })),
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function buildArtifacts({ apiPath, typePath }) {
  const apiSource = readUtf8(apiPath);
  const typeSource = readUtf8(typePath);
  const apiVersion = apiSource.match(/@version\s+([0-9.]+)/)?.[1];
  const typeVersion = typeSource.match(/@version\s+([0-9.]+)/)?.[1];
  if (apiVersion !== '3.16.0' || typeVersion !== '3.16.0') {
    throw new Error(`Expected API and type version 3.16.0, got API=${apiVersion || 'unknown'}, types=${typeVersion || 'unknown'}`);
  }
  const locateLine = createLineLocator(apiSource);
  const symbols = parseTypeDeclarations(typeSource)
    .map((symbol) => {
      const domains = assignDomains(symbol);
      const summary = SUMMARY_OVERRIDES[symbol.fullName] || symbol.summary;
      return { ...symbol, summary, sourceLine: locateLine(symbol), domain: domains[0], domains };
    })
    .sort((left, right) => left.fullName.localeCompare(right.fullName) || left.kind.localeCompare(right.kind) || left.signature.localeCompare(right.signature));
  const missingOwners = symbols.filter((symbol) => !symbol.owner && symbol.kind !== 'globalVariable' && !apiSource.includes(symbol.name));
  if (missingOwners.length) throw new Error(`Top-level declarations missing from API source: ${missingOwners.map((item) => item.fullName).join(', ')}`);
  const counts = symbols.reduce((result, symbol) => {
    result[symbol.kind] = (result[symbol.kind] || 0) + 1;
    return result;
  }, Object.create(null));
  const baseline = {
      schemaVersion: 2,
    skillVersion: '1.0.0',
    sdkVersion: '3.16.0',
    apiFile: 'references/NvStreamingSdk.js',
    apiFileSha256: sha256(Buffer.from(apiSource.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), 'utf8')),
    typeFile: 'assets/types/sdk.d.ts',
    typeFileSha256: sha256(Buffer.from(typeSource.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), 'utf8')),
    generatorVersion: 3,
    runtimeDependencies: {
      meishewasmloader: {
        package: 'meishewasmloader',
        versionPolicy: 'preserve-declared-install-if-absent',
        bundled: false,
        networkApprovalRequired: true,
      },
    },
    symbolCounts: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
    sourceNotes: [
      'NvStreamingSdk.js is a query-only reference and must never be copied into customer projects.',
      'Documentation may describe 3.15.1; 3.16.0 API signatures take precedence.',
    ],
  };
  const manifest = {
    schemaVersion: 2,
    sdkVersion: '3.16.0',
    apiFileSha256: baseline.apiFileSha256,
    typeFileSha256: baseline.typeFileSha256,
    symbols,
  };
  return {
    'sdk-baseline.json': stableJson(baseline),
    'api-manifest.json': stableJson(manifest),
    'feature-map.json': stableJson(buildFeatureMap()),
  };
}

function parseArgs(argv) {
  const args = { check: false, apiPath: path.join(SKILL_DIR, 'references', 'NvStreamingSdk.js'), typePath: path.join(SKILL_DIR, 'assets', 'types', 'sdk.d.ts') };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--check') args.check = true;
    else if (value === '--source') args.apiPath = path.resolve(argv[++index]);
    else if (value === '--types') args.typePath = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const artifacts = buildArtifacts(args);
  const differences = [];
  for (const [fileName, content] of Object.entries(artifacts)) {
    const target = path.join(SKILL_DIR, 'references', fileName);
    if (args.check) {
      const existing = fs.existsSync(target) ? readUtf8(target).replace(/\r\n/g, '\n') : null;
      if (existing !== content) differences.push(fileName);
    } else {
      fs.writeFileSync(target, content, 'utf8');
    }
  }
  if (differences.length) {
    console.error(`Generated artifacts are stale or missing: ${differences.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const action = args.check ? 'Verified' : 'Generated';
  console.log(`${action} ${Object.keys(artifacts).join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
