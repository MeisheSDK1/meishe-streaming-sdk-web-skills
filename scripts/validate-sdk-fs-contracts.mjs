#!/usr/bin/env node

import {
  assertSdkFsFilePath,
  assertSdkFsPath,
  SDK_FS_ROOTS,
} from '../assets/samples/media/sdk-fs-paths.ts';

const expectedRoots = [
  'template', 'project', 'videofx', 'animatedsticker', 'animatedstickerinanimation',
  'animatedstickeroutanimation', 'animatedstickeranimation', 'captionstyle',
  'captioncontext', 'captionrenderer', 'captioninanimation', 'captionoutanimation',
  'captionanimation', 'theme', 'transition', 'm3u8', 'font', 'compoundcaption',
  'record', 'model', 'resources', 'backgroundimage', 'interactproject',
  'projectresource', 'ARScene', 'facemesh', 'warp', 'audiowave', 'videoimage',
  'lic', 'dat', 'makeup', 'weblocal', 'localmedia',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function rejects(operation, label) {
  let rejected = false;
  try {
    operation();
  } catch {
    rejected = true;
  }
  assert(rejected, `Expected SDK FS path rejection: ${label}`);
}

assert(JSON.stringify(SDK_FS_ROOTS) === JSON.stringify(expectedRoots), 'System roots differ from the integration FS contract.');
assert(assertSdkFsFilePath('/font/cjk.otf', ['font']) === 'font', 'Font path must be accepted below /font.');
assert(assertSdkFsFilePath('/record/voice.m4a', ['record']) === 'record', 'Recording path must be accepted below /record.');
assert(assertSdkFsFilePath('/localmedia/video.weblocal', ['localmedia']) === 'localmedia', 'WebLocal path must be accepted below its system root.');
assert(assertSdkFsPath('/projectresource/nested', ['projectresource']) === 'projectresource', 'Nested project resource path must be accepted.');

rejects(() => assertSdkFsFilePath('/fonts/cjk.otf'), '/fonts is not a system root');
rejects(() => assertSdkFsFilePath('/meishe-assets/package.videofx'), '/meishe-assets is not a system root');
rejects(() => assertSdkFsFilePath('/record/../font/cjk.otf'), 'parent traversal');
rejects(() => assertSdkFsFilePath('record/voice.m4a'), 'relative path');
rejects(() => assertSdkFsFilePath('/record'), 'root is not a file');
rejects(() => assertSdkFsFilePath('/font/cjk.otf', ['record']), 'operation-specific root mismatch');

console.log(JSON.stringify({ status: 'pass', systemRoots: SDK_FS_ROOTS.length, negativeCases: 6 }, null, 2));
