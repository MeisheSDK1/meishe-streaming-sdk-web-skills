#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (relativePath) => fs.readFileSync(path.join(SKILL_DIR, relativePath), 'utf8');
const errors = [];
let checks = 0;
const requireText = (file, text) => {
  checks += 1;
  if (!read(file).includes(text)) errors.push(`${file} is missing required contract: ${text}`);
};
const forbidText = (file, text) => {
  checks += 1;
  if (read(file).includes(text)) errors.push(`${file} contains forbidden contract: ${text}`);
};
const requireOrder = (file, snippets) => {
  checks += 1;
  const content = read(file);
  let previous = -1;
  for (const snippet of snippets) {
    const index = content.indexOf(snippet, previous + 1);
    if (index < 0) {
      errors.push(`${file} is missing ordered contract: ${snippet}`);
      return;
    }
    previous = index;
  }
};

requireText('assets/samples/effects/video-effects.ts', 'clip.removeRawFx(effect.getIndex())');
requireText('assets/samples/effects/timeline-effect-workflow.ts', "export type TimelineEffectKind = 'filter' | 'effect'");
requireText('assets/samples/effects/timeline-effect-workflow.ts', 'highestReusableEffectLane');
requireText('assets/samples/effects/timeline-effect-workflow.ts', 'request.intensity !== undefined && request.supportsIntensity !== true');
requireText('assets/samples/effects/timeline-effect-workflow.ts', 'if (!item.supportsIntensity)');
requireText('assets/samples/effects/timeline-effect-workflow.ts', 'NvsAssetPackageTypeEnum.VideoFx');
requireText('assets/samples/effects/timeline-effect-workflow.ts', 'mutateAndPreservePreview');
requireText('assets/samples/effects/timeline-effect-workflow.ts', 'item.sdk.changeInPoint(targetUs)');
requireText('assets/samples/effects/timeline-effect-workflow.ts', 'item.sdk.changeOutPoint(targetUs)');
requireText('assets/samples/effects/timeline-effect-workflow.ts', 'timeline.removeTimelineVideoFx(item.sdk)');
requireText('assets/samples/effects/timeline-adjustment-workflow.ts', 'highestReusableAdjustmentLane');
requireText('assets/samples/effects/timeline-adjustment-workflow.ts', 'clampTimedObjectTrim');
requireText('assets/samples/effects/timeline-adjustment-workflow.ts', 'assertSynchronizedRange(item)');
requireText('assets/samples/effects/timeline-adjustment-workflow.ts', 'splitEditorTimelineAdjustment');
requireText('assets/samples/effects/timeline-adjustment-workflow.ts', 'resetAllEditorTimelineAdjustmentValues');
requireText('assets/samples/effects/timeline-adjustment-workflow.ts', 'history.commit()');
requireText('assets/samples/effects/timeline-adjustment-workflow.ts', 'removeEditorTimelineAdjustment');
requireText('references/effects-transitions.md', '`filter` and `effect` are distinct catalog and virtual-lane kinds');
requireText('assets/samples/effects/video-transition.ts', 'sourceClip.getOutPoint() !== nextClip.getInPoint()');
requireText('assets/samples/effects/video-transition.ts', 'track.getTransitionBySourceClipIndex(sourceClipIndex)');
requireText('assets/samples/effects/video-transition.ts', 'installed.getVideoTransitionPackageId() !== request.packageRef.id');
requireText('assets/samples/effects/video-transition.ts', "track.setBuiltinTransition(sourceClipIndex, '')");
requireText('assets/samples/timeline/editor-media-trim.ts', 'previousClip?.getOutPoint() ?? 0');
requireText('assets/samples/timeline/editor-media-trim.ts', 'nextClip?.getInPoint() ?? Number.POSITIVE_INFINITY');
requireOrder('assets/samples/timeline/editor-media-trim.ts', [
  'mutateAndPreservePreview(context, timeline',
  'track.changeInPoint(clipIndex, targetUs)',
  'await synchronizeDuration()',
]);
requireText('references/editor-workflow-patterns.md', 'render non-media virtual lanes above media tracks, video tracks above audio tracks');
requireText('references/editor-workflow-patterns.md', 'media, caption, sticker, filter, effect, adjustment, or transition');
requireText('references/editor-workflow-patterns.md', "Delete a selected transition with `setBuiltinTransition(sourceClipIndex, '')`");
requireText('references/editor-workflow-patterns.md', 'Apply the clamp both in pointer/keyboard preview code and again in the editor mutation API');
requireText('references/editor-workflow-patterns.md', 'A transition is a boundary object and never participates in Split or Trim');
requireText('references/sample-index.md', '../assets/samples/timeline/editor-media-trim.ts');
requireText('references/sample-index.md', '../assets/samples/effects/timeline-adjustment-workflow.ts');
requireText('references/sample-index.md', '../assets/samples/media/transcoded-m3u8-media.ts');
requireText('references/media-fs-and-weblocal.md', 'playback across a segment boundary');
requireText('references/media-fs-and-weblocal.md', 'surface a scoped error without disabling unrelated local imports');
requireText('assets/samples/media/transcoded-m3u8-media.ts', 'new Uint8Array(await response.arrayBuffer())');
requireText('assets/samples/media/transcoded-m3u8-media.ts', '`/m3u8/${crypto.randomUUID()}.m3u8`');
requireText('assets/samples/media/transcoded-m3u8-media.ts', 'context.getAVFileInfo(path, 0)');
requireText('assets/samples/media/transcoded-m3u8-media.ts', 'info.type !== 0');
requireText('assets/samples/media/transcoded-m3u8-media.ts', 'await context.streamingEngineReadyForTimelineModification()');
requireText('assets/samples/media/transcoded-m3u8-media.ts', 'const cleanup = () => removeFromSdkFs(path, [\'m3u8\'])');
requireText('references/asset-package-management.md', 'NvsAssetPackageTypeEnum.VideoFx` → `/videofx`');
forbidText('assets/samples/effects/auto-tone.ts', 'clip.removeFx(effect.getIndex())');
forbidText('assets/samples/advanced/ar-scene-beauty.ts', 'clip.removeFx(effect.getIndex())');
requireText('assets/samples/advanced/human-detection.ts', 'activeHumanDetection.references += 1');
requireText('assets/samples/advanced/human-detection.ts', 'if (active.references > 0) return');
requireText('assets/samples/advanced/human-segmentation-keyer.ts', 'NvsHumanDetectionFeatureEnum.SegmentationBackground');
requireText('assets/samples/advanced/human-segmentation-keyer.ts', 'NvsSeekFlagEnum.BuddyHostVideoFrame');
requireText('assets/samples/advanced/human-segmentation-keyer.ts', "effect.setBooleanVal('No Background', state.noBackground)");
requireText('assets/samples/advanced/human-segmentation-keyer.ts', 'The SDK did not round-trip the requested Object Stroke parameters.');
requireText('assets/samples/advanced/master-keyer.ts', 'The SDK did not round-trip the requested Master Keyer parameters.');
requireOrder('assets/samples/advanced/master-keyer.ts', [
  'const positionUs = context.getTimelineCurrentPosition(timeline)',
  'removeMasterKeyerEffects(clip)',
  'await context.lastSeekingFinished()',
  'pickMasterKeyerColor(liveWindow, canvas, clientX, clientY)',
  'await restore({ ...original, keyColor })',
]);
requireText('assets/samples/live-window/coordinate-conversion.ts', 'The client point is outside the LiveWindow canvas.');
requireText('references/advanced-effects.md', 'An eyedropper must sample an untreated frame');
requireText('references/monitor-playback-coordinate.md', 'Real-time background segmentation with `Object Stroke` requires');
requireText('references/sample-index.md', '../assets/samples/advanced/human-segmentation-keyer.ts');
requireText('assets/samples/live-window/video-transform.ts', 'requestedFlip ?? current < 0');
requireText('assets/samples/video/still-image-motion.ts', 'clip.isPropertyVideoFxEnabled()');
requireText('references/sample-index.md', '../assets/samples/video/insert-freeze-frame.ts');
requireText('references/video-editing.md', 'Clarify freeze-frame product semantics before implementation.');
requireText('references/video-editing.md', 'Do not silently turn this into a global ripple edit.');
requireText('references/editor-workflow-patterns.md', 'Persist inserted freeze-frame enabled state');
requireText('assets/samples/video/insert-freeze-frame.ts', 'getClipPosByTimelinePosCurvesVariableSpeed(timelinePositionUs)');
requireText('assets/samples/video/insert-freeze-frame.ts', 'history.restore(before)');
requireText('assets/samples/video/insert-freeze-frame.ts', 'restoreCreatedClipState(sourceState, result)');
requireOrder('assets/samples/video/insert-freeze-frame.ts', [
  'const previousPositionUs = context.getTimelineCurrentPosition(timeline)',
  'await context.lastSeekingFinished()',
  'context.stop()',
  'await context.streamingEngineReadyForTimelineModification()',
  'track.splitClip(clip.getIndex(), timelinePositionUs)',
  'downstream.sort((a, b) => b.inPointUs - a.inPointUs)',
  'track.moveClipByPositions(item.clip.getIndex(), item.inPointUs + durationUs, false, true)',
  'track.addClip2(sourcePath, timelinePositionUs, sourcePositionUs, freezeTrimOutUs)',
  'freeze.enableClipFreezeFrame(true)',
  'freeze.setClipFreezeFrameTrimPosition(sourcePositionUs)',
  'freeze.disableAudioStreams(true)',
  'track.changeOutPoint(freeze.getIndex(), freezeOutPointUs)',
  'await request.synchronizeDuration()',
  'seekPreservedPosition(context, timeline, previousPositionUs)',
  'history.commit(before)',
]);
forbidText('assets/samples/captions/srt-captions.ts', 'overlaps the previous cue');
requireText('assets/samples/captions/time-follow-caption.ts', 'NvsAssetPackageTypeEnum.CaptionRenderer');
requireText('assets/samples/captions/lyrics-caption.ts', 'timeline.addCaption(');
requireText('assets/samples/captions/lyrics-caption.ts', 'caption.setIsLyrics(true)');
requireText('assets/samples/captions/lyrics-caption.ts', 'if (!caption.isLyrics())');
requireText('assets/samples/captions/lyrics-caption.ts', 'timeline.removeCaption(caption)');
forbidText('assets/samples/captions/lyrics-caption.ts', 'videoTrack.addCaption(');
forbidText('assets/samples/captions/lyrics-caption.ts', 'addTimeFollowCaption(');
requireOrder('assets/samples/captions/lyrics-caption.ts', [
  'timeline.addCaption(',
  'caption.setIsLyrics(true)',
  'if (!caption.isLyrics())',
]);
requireText('references/captions.md', 'a normal lyrics caption uses the same SDK owner and creation API as a normal timeline caption');
requireText('references/captions.md', 'Do not use `NvsVideoTrack.addCaption()` merely because the UI calls the grouping a lyrics track.');
requireText('references/captions.md', 'the word "lyrics" alone does not select the time-follow API.');
requireText('references/sample-index.md', '../assets/samples/captions/lyrics-caption.ts');
requireText('references/editor-workflow-patterns.md', 'Model a product-level lyrics lane separately from ordinary caption lanes');
requireText('references/editor-workflow-patterns.md', 'Treat overlap checks as half-open intervals `[inPoint, outPoint)`');
requireText('references/editor-workflow-patterns.md', 'Keep mutation rejection feedback visible independently of the current selection or inspector body.');
requireText('references/captions.md', 'Keep normal and modular captions as distinct editor object types.');
requireText('references/captions.md', 'Gate every renderer/context action with `caption.isModular()`');
requireText('assets/samples/captions/modular-caption.ts', 'if (!caption.isModular())');
requireText('assets/samples/captions/modular-caption.ts', 'getModularCaptionContextPackageId() !== packages.context.id');
requireText('assets/samples/captions/modular-caption.ts', 'getModularCaptionRendererPackageId() !== packages.renderer.id');
requireText('assets/samples/captions/caption-formatting.ts', 'if (value.drawOutline !== undefined) caption.setDrawOutline(value.drawOutline)');
requireText('assets/samples/captions/caption-formatting.ts', 'if (value.drawShadow !== undefined) caption.setDrawShadow(value.drawShadow)');
forbidText('assets/samples/captions/caption-formatting.ts', 'caption.setDrawOutline(value.outlineWidth > 0)');
requireText('assets/samples/captions/modular-caption-history.ts', "if (!caption.isModular()) throw new Error('Do not snapshot a normal caption as modular.')");
requireOrder('assets/samples/captions/modular-caption-history.ts', [
  'const caption = await addModularCaption(',
  'await formatCaption(context, caption, snapshot.formatting)',
  'setCaptionTransformKeyframes(caption, snapshot.transformKeyframes)',
]);
requireText('references/sample-index.md', '../assets/samples/captions/modular-caption-history.ts');
requireText('assets/samples/core/sdk-version.ts', 'context.getSdkVersion()');
requireText('scripts/inspect-target-project.mjs', "sdkVersionEvidence: runtimeSdkVersion ? 'caller-attested-context-getSdkVersion' : 'runtime-pending'");
requireText('scripts/inspect-target-project.mjs', "condition('api-capability-surface'");
requireText('scripts/inspect-target-project.mjs', "--media-input-kind local-file");
requireText('scripts/inspect-target-project.mjs', 'toolOrSandboxApprovalSatisfiesUserConfirmation: false');
requireText('scripts/install-runtime.mjs', '--user-confirmed-copy');
requireText('scripts/install-runtime.mjs', 'if (!userConfirmed)');
requireText('scripts/inspect-target-project.mjs', "condition('target-sdk-runtime-provenance'");
requireText('scripts/inspect-target-project.mjs', 'normalizedSha256: normalizedFileSha256(targetSdkFile)');
requireText('scripts/inspect-target-project.mjs', "condition('media-input-consistency'");
requireText('scripts/inspect-target-project.mjs', 'function firstPersistedMediaDecision');
requireText('scripts/inspect-target-project.mjs', 'files: sourceInspection.files');
requireText('scripts/inspect-target-project.mjs', "packageInstallCommand(packageManager, 'meishewasmloader')");
requireText('scripts/inspect-target-project.mjs', 'bootstrapReady: bootstrapBlocking.length === 0');
requireText('scripts/inspect-target-project.mjs', 'featureInputsReady: featureInputBlocking.length === 0');
requireText('SKILL.md', 'run inspection as a read-only preflight');
requireText('SKILL.md', 'Before asking the first gate-specific question, present one consolidated discovery report');
requireText('SKILL.md', 'staging must never hide an already known or conditionally applicable gate');
requireText('SKILL.md', 'auto-approval never satisfies this confirmation');
requireText('scripts/inspect-target-project.mjs', "timing: 'before-first-gate-specific-question'");
requireText('scripts/inspect-target-project.mjs', "when: 'media-strategy=weblocal'");
requireText('scripts/inspect-target-project.mjs', 'disclosureIsApproval: false');
requireText('SKILL.md', 'Use that runtime value—not `@version`—for exact/older/newer posture');
requireText('SKILL.md', 'update versions only when the user explicitly requests a version change');
requireText('SKILL.md', 'Treat clarifications and follow-ups for the same objective as one logical task');
requireText('references/media-fs-and-weblocal.md', 'The choice may be M3U8, WebLocal, or both (`mixed`)');
requireText('SKILL.md', 'statically compare it from the supplied delivery, installed runtime, or read-only `--target-sdk` before requesting prerequisite mutations');
requireText('SKILL.md', 'An independent `--target-sdk` never proves what a configured CDN/runtime URL delivers');
requireText('SKILL.md', 'Persist an explicit application-level strategy/source discriminator');
requireText('references/media-fs-and-weblocal.md', 'Type/interface declarations, UI labels, and bare `.m3u8` strings are not decisions');
requireText('agents/openai.yaml', 'only when implementing');
requireText('scripts/validate-distribution.mjs', 'must exist and use a quoted string value');
requireText('scripts/inspect-target-project.mjs', "evidenceKind: 'caller-attested-user-decision'");
requireText('references/terminology.md', 'Evidence kinds describe where a claim came from; they are not gate states');
forbidText('references/terminology.md', '- `caller-attested`:');
requireText('references/terminology.md', 'one user objective spanning its initial request and all continuing clarifications');
forbidText('references/terminology.md', 'one user request handled by the agent');
requireText('assets/samples/captions/font-registration.ts', 'https://alieasset.meishesdk.com/font/NotoSansCJKsc-Regular.otf');
forbidText('assets/samples/captions/font-registration.ts', 'source: File | string = DEFAULT_CAPTION_FONT_URL');
requireText('assets/samples/captions/font-registration.ts', 'context.registerFontByFilePath(sdkFsPath)');
requireText('assets/samples/captions/font-registration.ts', 'caption.setFontByFilePath(sdkFsPath)');
requireText('assets/samples/captions/font-registration.ts', "controller.abort('Caption font fetch timed out.')");
requireText('assets/samples/captions/font-registration.ts', 'signal: controller.signal');
requireText('assets/samples/captions/font-registration.ts', 'if (options.signal?.aborted)');
requireText('references/captions.md', 'non-blocking rendering risk');
requireText('references/captions.md', 'approved fallback is available');
requireText('references/captions.md', 'never await an optional remote font during editor initialization');
requireText('references/captions.md', 'the helper intentionally has no default source');
requireText('assets/samples/effects/video-mask.ts', 'rotationDegrees');
requireText('assets/samples/effects/video-mask.ts', "clip.appendRawBuiltinFx('Mosaic')");
requireText('assets/samples/effects/video-mask.ts', "effect.setFloatVal('Unit Size', 0)");
requireText('assets/samples/effects/video-mask.ts', 'await setMaskRegions(context, effect, [region])');
requireText('assets/samples/effects/video-mask.ts', 'createVideoRectMaskRegionFromViewRect');
requireText('assets/samples/effects/video-mask.ts', 'cornerRadiusRate');
forbidText('assets/samples/effects/video-mask.ts', "appendRawBuiltinFx('Mask Generator')");
forbidText('assets/samples/effects/video-mask.ts', 'builtinName: string');
requireText('assets/samples/effects/mask-region-io.ts', 'effect.setRegionInfos(vector)');
requireText('assets/samples/effects/mask-region-io.ts', "shape === 'rectangle' ? 0 : 0.2");
requireText('assets/samples/effects/text-mask.ts', 'addVideoTextMaskEffect');
requireText('assets/samples/effects/text-mask.ts', "clip.appendRawBuiltinFx('Mosaic')");
requireText('assets/samples/effects/text-mask.ts', "effect.setStringVal('Region Storyboard Description String', storyboard)");
requireText('references/advanced-effects.md', 'API/declaration presence is not sufficient validation');
requireText('references/advanced-effects.md', 'must never make `Mask Generator` the default');
requireText('references/advanced-effects.md', 'Treat one managed clip mask as one application-owned transaction');
requireText('assets/samples/core/sdk-loader.ts', 'ensureSdkApiScript');
requireText('assets/samples/core/sdk-loader.ts', 'globalThis.crossOriginIsolated');
requireText('assets/samples/core/sdk-loader.ts', "mode: 'required'");
requireText('assets/samples/core/sdk-loader.ts', "mode: 'skip'");
requireText('assets/samples/core/sdk-loader.ts', 'customerConfirmedImpact: true');
requireText('assets/samples/core/sdk-loader.ts', 'maxRetries ?? 3');
requireText('assets/samples/core/sdk-loader.ts', 'internalResourcesAlreadyInitialized?: boolean');
requireText('assets/samples/core/sdk-loader.ts', "!alreadyLoaded || options.internalResourcesAlreadyInitialized !== true");
requireText('assets/samples/core/sdk-loader.ts', 'let loaderTerminalFailed = false');
requireText('assets/samples/core/sdk-loader.ts', 'let loaderTerminalCause: unknown');
requireText('assets/samples/core/sdk-loader.ts', 'if (loaderTerminalFailed)');
requireText('assets/samples/core/sdk-loader.ts', 'loaderTerminalFailed = true');
requireText('assets/samples/core/sdk-loader.ts', 'reload the page before retrying');
requireOrder('assets/samples/core/sdk-loader.ts', [
  'await waitForStreamingContext(timeoutMs)',
  'const context = nvsGetStreamingContextInstance()',
  'initializeSdkFsRoots()',
  'context.initInternalResources()',
]);
forbidText('assets/samples/core/editor-bootstrap.ts', 'sdkFsDirectories');
requireText('assets/samples/core/sdk-startup.ts', 'let startupPromise');
requireText('assets/samples/core/sdk-startup.ts', 'startMeisheSdkForProjectLoad');
requireText('assets/samples/core/sdk-startup.ts', 'requireProjectLoadSdk');
forbidText('assets/samples/core/sdk-startup.ts', 'startupPromise = undefined');
requireText('references/engine-lifecycle.md', 'Keep the project-load initialization promise terminal after any failure.');
requireText('references/engine-lifecycle.md', 'could repeat `initInternalResources()`');
requireText('references/engine-lifecycle.md', 'allow a rejected disposal to retry unfinished stages');
requireText('assets/samples/core/editor-bootstrap.ts', 'sdkInitialization: Promise<StartedMeisheSdk>');
forbidText('assets/samples/core/editor-bootstrap.ts', 'loadMeisheSdk(');
requireText('assets/samples/core/project-loading.ts', 'createEmptyEditorProject');
requireText('assets/samples/core/project-loading.ts', 'loadApplicationXmlProject');
requireText('assets/samples/core/project-loading.ts', 'loadSdkNativeProject');
requireText('assets/samples/core/project-loading.ts', 'readProjectXml');
requireText('assets/samples/core/project-loading.ts', 'restoreProject');
requireText('assets/samples/core/editor-session.ts', "kind: 'new'");
requireText('assets/samples/core/editor-session.ts', "kind: 'existing'");
requireText('assets/samples/core/editor-session.ts', "ownership?: 'owned' | 'borrowed'");
requireText('assets/samples/core/editor-session.ts', 'if (ownsTimeline && !context.removeTimeline(timeline))');
requireText('assets/samples/core/editor-session.ts', 'let connectionError: Error | undefined');
requireText('assets/samples/core/editor-session.ts', 'Editor session connection and rollback both failed.');
requireText('assets/samples/core/editor-session.ts', 'let liveWindowDisconnected = false');
requireText('assets/samples/core/editor-session.ts', 'let liveWindowRemoved = false');
requireText('assets/samples/core/editor-session.ts', 'let timelineRemoved = !ownsTimeline');
requireText('assets/samples/core/editor-session.ts', 'disposePromise = undefined');
requireText('assets/samples/core/editor-bootstrap.ts', 'activeCanvasSessions.has(options.canvasId)');
requireText('assets/samples/core/editor-bootstrap.ts', 'activeCanvasSessions.delete(options.canvasId)');
requireText('assets/samples/core/editor-bootstrap.ts', 'if (fullyDisposed) activeCanvasSessions.delete(options.canvasId)');
requireText('assets/samples/core/editor-bootstrap.ts', 'disposePromise = undefined');
requireOrder('assets/samples/timeline/playback-controller.ts', [
  'if (options.stopEngineOnDispose) context.stop();',
  'disposed = true;',
]);
requireText('assets/samples/live-window/live-window-controller.ts', 'during project loading, before exposing editing interactions');
requireOrder('assets/samples/core/editor-bootstrap.ts', [
  'await options.sdkInitialization',
  'disposeContextCallbacks = options.initializeContext',
  'await options.loadProject(context)',
  'createEditorSession({',
  'await project.restoreTimeline',
  'createPlaybackController(',
]);
requireText('references/timeline-track-clip.md', 'assuming project loading already created and connected `timeline`');
forbidText('references/timeline-track-clip.md', 'const timeline = context.createTimeline(');
forbidText('references/framework-react-vite.md', 'or an explicit user action');
forbidText('references/framework-vue-vite.md', 'or a user action');
requireOrder('SKILL.md', ['## 1. Choose the mode', '## 2. Route by feature', '## 3. Inspect the target', '## 4. Apply scoped dependency gates']);
forbidText('scripts/inspect-target-project.mjs', '--confirm-runtime-pair');
forbidText('scripts/inspect-target-project.mjs', '--resolved-loader-latest');
requireText('scripts/inspect-target-project.mjs', '--list-features');
requireText('scripts/inspect-target-project.mjs', '--list-recipes');
requireText('references/recipe-presets.json', 'simple-weblocal-preview');
requireText('references/simple-weblocal-preview.md', 'The recipe supplies only its five participating domains and complete static SDK-symbol set.');
requireText('references/simple-weblocal-preview.md', 'same `--runtime-source`');
requireText('references/simple-weblocal-preview.md', 'global lexical bindings');
requireText('references/simple-weblocal-preview.md', 'validation UI directly shows navigation, material/import, preview, inspector, and bottom Timeline regions');
requireText('references/framework-react-vite.md', 'not guaranteed properties of `window` or `globalThis`');
requireText('references/integration-core.md', 'atomically fills an existing empty destination');
requireText('scripts/check-test-resources.mjs', 'response.body?.getReader()');
requireText('scripts/check-test-resources.mjs', "reader.cancel('limited-download policy')");
forbidText('scripts/check-test-resources.mjs', 'response.arrayBuffer()');
requireText('assets/samples/media/web-local-media.ts', 'computePacketStats(100)');
requireText('assets/samples/media/web-local-media.ts', 'await yieldToBrowser()');
requireText('assets/samples/media/web-local-media.ts', 'MAX_VIDEO_PIXELS = 1920 * 1080');
requireText('assets/samples/media/web-local-media.ts', 'context.getAVFileInfo(descriptorPath, 0)');
requireText('assets/samples/media/web-local-media.ts', 'if (!context.unregisterLocalFile(webLocalFileId))');
requireText('assets/samples/media/web-local-media.ts', 'sessionOnly: true');
requireText('assets/samples/media/web-local-media.ts', 'new UrlSource(normalizedUrl)');
requireText('assets/samples/media/web-local-media.ts', 'createWebLocalVideoFromUrl');
requireText('assets/samples/media/web-local-media.ts', 'webAssetUrl: inspected.sourceUrl');
requireText('assets/samples/media/web-local-media.ts', 'sessionOnly: false');
requireText('assets/samples/media/web-local-media.ts', 'let descriptorRemoved = false');
requireText('assets/samples/media/web-local-media.ts', 'let sourceReleased = false');
requireOrder('assets/samples/media/web-local-media.ts', [
  'cleanup();',
  'disposed = true;',
]);
requireOrder('assets/samples/media/transcoded-m3u8-media.ts', [
  'cleanup();',
  'disposed = true;',
]);
forbidText('assets/samples/media/web-local-media.ts', 'disposed = true;\n      cleanup();');
forbidText('assets/samples/media/transcoded-m3u8-media.ts', 'disposed = true;\n        cleanup();');
requireText('references/media-fs-and-weblocal.md', 'requires a stable HTTP(S) URL');
requireText('references/media-fs-and-weblocal.md', 'revalidate restored URLs');
forbidText('assets/samples/media/web-local-media.ts', "ensureSdkFsDirectory('/localmedia'");
forbidText('assets/samples/media/web-local-media.ts', 'file.arrayBuffer()');
forbidText('assets/samples/media/web-local-media.ts', 'new Uint8Array(await file.arrayBuffer())');
requireText('assets/samples/media/sdk-fs-paths.ts', "export const SDK_FS_ROOTS = [");
requireText('assets/samples/media/sdk-fs-paths.ts', "  'localmedia',");
forbidText('assets/samples/media/sdk-fs-paths.ts', 'SDK_FS_SPECIAL_ROOTS');
requireText('assets/samples/media/sdk-fs-paths.ts', 'No verified FSPath root mapping exists');
requireText('assets/samples/media/media-fs.ts', 'assertSdkFsFilePath(path, allowedRoots)');
requireText('assets/samples/audio/microphone-recording.ts', "assertSdkFsFilePath(outputPath, ['record'])");
requireText('assets/samples/persistence/application-project-xml.ts', "assertSdkFsFilePath(filePath, ['project', 'projectresource'])");
forbidText('assets/samples/captions/font-registration.ts', '/fonts/');
requireText('assets/samples/captions/font-registration.ts', '/font/caption-');
forbidText('assets/samples/packages/asset-package.ts', '/meishe-assets/');
forbidText('assets/samples/packages/asset-package-maintenance.ts', '/meishe-assets/');
requireText('assets/samples/packages/asset-package.ts', 'assetPackageRoot(request.packageType)');
requireText('assets/samples/packages/asset-package.ts', 'class AssetPackageInstallCoordinator');
requireText('assets/samples/packages/asset-package.ts', 'new SingleFlightQueue<string>()');
requireText('assets/samples/utils/single-flight-queue.ts', 'private tail: Promise<void>');
requireText('assets/samples/utils/single-flight-queue.ts', 'private readonly inFlight');
requireText('assets/samples/packages/asset-package.ts', 'status === NvsAssetPackageStatusEnum.Installing');
requireText('assets/samples/packages/asset-package.ts', 'NvsAssetPackageErrorEnum.WorkingInProgress');
requireText('assets/samples/utils/single-flight-queue.ts', 'if (this.inFlight.get(key) === pending) this.inFlight.delete(key)');
forbidText('assets/samples/packages/asset-package.ts', 'installationInProgress');
requireText('assets/samples/timeline/editor-track-policy.ts', 'inPoint < clip.outPoint && outPoint > clip.inPoint');
requireText('assets/samples/timeline/editor-track-policy.ts', 'selectHighestUserTrack');
forbidText('assets/samples/timeline/editor-track-policy.ts', 'selectReusableUserTrack');
requireText('assets/samples/timeline/editor-track-policy.ts', "'non-media': 0, video: 1, audio: 2");
requireText('assets/samples/timeline/timed-object-operations.ts', 'clampTimedObjectTrim');
requireText('assets/samples/timeline/timed-object-operations.ts', 'The SDK produced an overlapping timed-item range.');
requireText('assets/samples/timeline/timed-object-operations.ts', 'splitLogicalTimedItem');
requireText('assets/samples/timeline/timed-object-operations.ts', 'await removeRight(right)');
requireText('assets/samples/timeline/nested-timeline.ts', 'let parentClipRemoved = false');
requireText('assets/samples/timeline/nested-timeline.ts', 'let childTimelineRemoved = !ownsChildTimeline');
requireText('assets/samples/timeline/nested-timeline.ts', 'if (disposePromise) return disposePromise');
requireOrder('assets/samples/timeline/nested-timeline.ts', [
  'parentTrack.removeClip(clip.getIndex(), false)',
  'parentClipRemoved = true',
  'context.removeTimeline(childTimeline)',
  'childTimelineRemoved = true',
]);
requireText('assets/samples/timeline/editor-track-policy.ts', "appendClip(':/footage/transparent_black.png')");
requireText('assets/samples/timeline/editor-track-policy.ts', 'timeline.videoTrackCount() !== 0');
requireText('assets/samples/video/still-image-left-trim.ts', 'track.addClip2(sourcePath, newInPoint, 0, oldOutPoint - newInPoint)');
requireText('assets/samples/timeline/preserve-preview-position.ts', 'const previousPosition = context.getTimelineCurrentPosition(timeline)');
requireText('assets/samples/media/timeline-thumbnails.ts', 'Math.ceil(renderedWidth / tileWidth)');
requireText('assets/samples/media/timeline-thumbnails.ts', 'context.cancelLocalAVFileIconFetchingTask(taskId)');
requireText('assets/samples/live-window/resizable-editor-preview.ts', 'new ResizeObserver(resizeNow)');
requireText('assets/samples/live-window/resizable-editor-preview.ts', 'canvas.width = Math.max(4');
requireText('assets/samples/ui/DefaultEditorUi.tsx', 'export function DefaultEditorShell');
requireText('assets/samples/ui/DefaultEditorUi.tsx', 'export function DefaultEditorUi');
requireText('assets/samples/ui/DefaultEditorUi.tsx', 'ms-editor-nav-item active');
requireText('assets/samples/ui/DefaultEditorUi.tsx', 'ms-inspector-empty');
requireText('assets/samples/ui/DefaultEditorUi.tsx', '<nav className="ms-editor-nav">');
requireText('assets/samples/ui/DefaultEditorUi.tsx', '<aside className="ms-editor-inspector">');
requireText('assets/samples/ui/DefaultEditorUi.tsx', 'new ResizeObserver(update)');
requireText('assets/samples/ui/DefaultEditorUi.tsx', 'event.currentTarget.setPointerCapture(event.pointerId)');
requireText('assets/samples/ui/DefaultEditorUi.tsx', 'event.preventDefault()');
requireText('assets/samples/ui/DefaultEditorUi.tsx', 'onPointerMove={continueTimelineSeek}');
requireText('assets/samples/ui/DefaultEditorUi.tsx', 'onPointerUp={endTimelineSeek}');
requireText('assets/samples/ui/DefaultEditorUi.tsx', 'onPointerCancel={cancelTimelineSeek}');
requireText('assets/samples/ui/DefaultEditorUi.tsx', 'event.currentTarget.releasePointerCapture(event.pointerId)');
requireText('assets/samples/ui/default-editor-layout.ts', 'timelineLabelWidthPx: 78');
requireText('assets/samples/ui/default-editor-layout.ts', 'timelineTrackHeightPx: 46');
requireText('assets/samples/ui/default-editor-layout.ts', 'timelineThumbnailWidthPx: 72');
requireText('assets/samples/ui/default-editor-ui.css', 'grid-template-columns: 64px minmax(0, 1fr)');
requireText('assets/samples/ui/default-editor-ui.css', 'margin: 10px 0 7px 78px');
requireText('assets/samples/ui/default-editor-ui.css', 'user-select: none');
requireText('references/sample-index.md', '../assets/samples/ui/DefaultEditorUi.tsx');
requireText('references/default-editor-ui.md', 'user supplied no UI reference');
requireText('references/default-editor-ui.md', 'one global playhead');
requireText('references/default-editor-ui.md', 'continuously seek through `onSeek`');
requireText('references/default-editor-ui.md', 'default editor always renders its five structural regions');
requireText('references/simple-weblocal-preview.md', 'Do not invent a reduced layout.');
requireText('SKILL.md', 'Do not create or offer alternate default-layout variants');
forbidText('assets/samples/ui/DefaultEditorUi.tsx', 'SimpleEditorUi');
forbidText('assets/samples/ui/default-editor-ui.css', 'ms-editor-shell--simple');
forbidText('SKILL.md', 'SimpleEditorUi');
forbidText('references/default-editor-ui.md', 'SimpleEditorUi');
forbidText('references/sample-index.md', 'SimpleEditorUi');
forbidText('references/simple-weblocal-preview.md', 'SimpleEditorUi');
forbidText('references/default-editor-ui.md', 'assets/default-editor-ui');
forbidText('SKILL.md', 'bundled default UI assets');
requireText('references/editor-workflow-patterns.md', 'clicking Timeline blank space clears it');
requireText('references/editor-workflow-patterns.md', 'Do not use the clip in-point as an implicit refresh target');
requireText('references/editor-workflow-patterns.md', 'Apply the same highest-lane `[in, out)` policy to caption, sticker, filter, effect, and adjustment virtual lanes');
requireText('references/editor-workflow-patterns.md', 'Maintain separate filter, effect, and adjustment virtual-lane namespaces');
requireText('references/editor-workflow-patterns.md', 'one logical mutation transaction');
requireText('references/editor-workflow-patterns.md', 'Intermediate gesture previews reuse that retained value');
requireText('references/editor-workflow-patterns.md', 'Create content `默认文本`');
requireText('SKILL.md', "inspector's `uiDesign` evidence");
requireText('SKILL.md', 'For a cross-domain recipe');
requireText('SKILL.md', 'temporary validation approvals only');
requireText('SKILL.md', 'Do not probe unrelated resources.');
requireText('SKILL.md', 'inspect all directly participating domains in one scan with `--features`');
requireText('SKILL.md', 'complete set of APIs actually used by the selected recipe');
requireText('SKILL.md', 'Never analyze a domain-wide result merely to validate a known narrow recipe.');
requireText('SKILL.md', 'Do not automatically run full type-check, build, lint, and all tests together.');
requireText('SKILL.md', 'Escalate to a full project check only when');
requireText('SKILL.md', 'Do not exercise or report unrelated editor features merely because the default editor is present.');
requireText('SKILL.md', 'Run full-editor regression only when');
requireText('SKILL.md', 'Batch related browser checks in one headed browser');
requireText('SKILL.md', 'any result whose isolation cannot be proven');
requireText('SKILL.md', 'Do not run the following Skill-distribution audit for target-project integration.');
requireText('references/default-editor-ui.md', 'Validate only the requested feature, changed regions, their direct dependencies');
requireText('references/editor-workflow-patterns.md', 'the presence of the editor does not make unrelated workflows part of validation');
requireText('references/compatibility-troubleshooting.md', 'compare the complete actual API set used by the recipe with `--symbols`');
requireText('references/compatibility-troubleshooting.md', 'use `--feature` only for an intentional domain-wide audit');
requireText('scripts/validate-skill.mjs', "scope: 'skill-distribution'");
requireText('scripts/validate-skill.mjs', "scope: 'selected-features'");
forbidText('scripts/validate-skill.mjs', 'every applicable default-editor-ui.md and editor-workflow-patterns.md check');
requireText('references/integration-core.md', 'import registers catalog assets without adding them to tracks');
requireText('references/integration-core.md', 'historical low-memory Windows branch');
requireText('references/integration-core.md', 'do not copy its UA heuristic');
requireText('references/project-xml-and-persistence.md', 'creates a backend rendering task');
requireText('references/project-xml-and-persistence.md', 'does not invent a client-side final-media export recipe');
requireText('agents/openai.yaml', 'brand_color: "#6875ED"');

for (const file of [
  'assets/samples/effects/timeline-effect-workflow.ts',
  'assets/samples/effects/timeline-adjustment-workflow.ts',
  'assets/samples/effects/keyframe-inspection.ts',
  'assets/samples/timeline/variable-speed-mapping.ts',
  'assets/samples/timeline/structural-mutation.ts',
  'assets/samples/timeline/timeline-snapshot.ts',
]) {
  checks += 2;
  if (!fs.existsSync(path.join(SKILL_DIR, file))) errors.push(`Missing audited sample: ${file}`);
  if (!read('references/sample-index.md').includes(`../${file}`)) errors.push(`sample-index.md does not route to ${file}`);
}

const manifest = JSON.parse(read('references/api-manifest.json'));
const baseline = JSON.parse(read('references/sdk-baseline.json'));
checks += 1;
if (baseline.runtimeDependencies?.meishewasmloader?.versionPolicy !== 'preserve-declared-install-if-absent') {
  errors.push('meishewasmloader version policy must preserve declared versions and install only when absent.');
}
const setFloat = manifest.symbols.find((symbol) => symbol.fullName === 'NvsFx.setFloatVal');
if (!setFloat?.domains?.includes('effects-transitions')) {
  errors.push('NvsFx.setFloatVal is not discoverable from effects-transitions.');
}
const audioWriter = manifest.symbols.find((symbol) => symbol.fullName === 'NvsAudioFileWriter');
const audioWriterClose = manifest.symbols.find((symbol) => symbol.fullName === 'NvsAudioFileWriter.close');
const timelineAudioTrack = manifest.symbols.find((symbol) => symbol.fullName === 'NvsTimeline.getAudioTrackByIndex');
const enableFreezeFrame = manifest.symbols.find((symbol) => symbol.fullName === 'NvsVideoClip.enableClipFreezeFrame');
checks += 6;
if (!audioWriter?.domains?.includes('audio-editing')) errors.push('NvsAudioFileWriter is not discoverable from audio-editing.');
if (audioWriterClose?.domains?.includes('engine-lifecycle')) errors.push('NvsAudioFileWriter.close is incorrectly discoverable from engine-lifecycle.');
if (!timelineAudioTrack?.domains?.includes('timeline-track-clip') || !timelineAudioTrack?.domains?.includes('audio-editing')) {
  errors.push('NvsTimeline.getAudioTrackByIndex must be discoverable from timeline and audio domains.');
}
if (!enableFreezeFrame?.domains?.includes('video-editing') || enableFreezeFrame.domains.includes('metadata-thumbnail-waveform')) {
  errors.push('NvsVideoClip.enableClipFreezeFrame must be routed to video-editing, not metadata-thumbnail-waveform.');
}
if (enableFreezeFrame?.summary?.en !== 'Enables or disables freeze frame for the video clip.') {
  errors.push('NvsVideoClip.enableClipFreezeFrame must override the incorrect upstream HDR summary.');
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'pass', checks }, null, 2));
}
