# Asset package management

Asset packages must retain their original file names and suffixes. Determine `NvsAssetPackageTypeEnum` from authoritative package metadata, not from a guessed customer label. Supply the package-specific license path when authorization requires it.

Resolve the temporary SDK FS directory from the verified package type with `assetPackageRoot()`; examples include `NvsAssetPackageTypeEnum.VideoFx` → `/videofx`, `/captionstyle`, `/transition`, `/animatedsticker`, and `/template`. Store a package license beside its package, matching the production flow. Never use a generic root such as `/meishe-assets`, and stop when a package type has no verified FSPath mapping.

Use `assets/samples/packages/asset-package.ts` for the basic install lifecycle: check `getAssetPackageStatus()`, fetch the customer/approved package into SDK FS, preserve the existing callback, call `installAssetPackage()`, accept `NoError` or `AlreadyInstalledError`, and remove temporary FS files.

Use [asset-package-maintenance.ts](../assets/samples/packages/asset-package-maintenance.ts) for status/version inspection, sequential upgrade callback ownership, and uninstall. Do not treat `Installing` or `Upgrading` as ready.

Own installation concurrency at the editor-session boundary. Route every package through one FIFO coordinator because the manager exposes one global callback slot. Deduplicate by package type plus ID so repeated component effects share one Promise. Reuse `Ready`; wait for an existing `Installing`/`Upgrading` operation instead of invoking install again. Remove failed entries from the in-flight cache so retry remains possible.

Installation completion is asynchronous through `onFinishAssetPackageInstallation`. Immediate and callback error codes both matter. Upgrade and uninstall have their own APIs/callbacks; do not uninstall or upgrade customer packages unless explicitly requested and ownership is known.

Status `Installing` or `Upgrading` is not ready for use. Confirm `Ready` and the package ID before adding a packaged caption, sticker, transition, effect, theme, or template. Never rename a package to derive a new ID.

For packaged timeline filters and effects, install as `NvsAssetPackageTypeEnum.VideoFx`, require final `Ready`, and pass the installed package ID to `addPackagedTimelineVideoFx()`. Keep filter/effect catalog labels out of package-type inference: both product kinds use the same SDK package type. Do not promote a task-supplied URL into `test-resources.json` unless the user explicitly approves it as a reusable test-only resource.

Validate URL/license availability, file integrity when a hash is supplied, package type, immediate result, completion callback, final status/version, feature creation, and temporary-file cleanup. Missing package/license is `missing-external`; do not silently continue with a production substitute.
