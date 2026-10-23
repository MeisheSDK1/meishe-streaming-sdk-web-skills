# Templates and nested timelines

Keep the three template loading lifecycles separate:

- Use [template-package-loading.ts](../assets/samples/templates/template-package-loading.ts) to install a `.template` package, verify replacement media, select an aspect ratio, and create the template timeline. [template-timeline.ts](../assets/samples/templates/template-timeline.ts) contains the descriptor recursion and footage mapping used by this flow.
- Use `assets/samples/templates/template-nested-timeline.ts` to create that template timeline and add it to an existing video track as a child timeline clip. Its disposer removes the parent clip before removing the owned child timeline.
- Use `assets/samples/templates/template-authoring-project-load.ts` to install a `.project` package, load it with `loadProject()`, continue template authoring, and write template XML. This flow must stop until external media, fonts, models, licenses, and dependent material packages are explicitly verified.

Use [template-authoring.ts](../assets/samples/templates/template-authoring.ts) for authoring attachments, timing, assets, effect groups, overlap policy, and template XML. These attachment values come from the 3.16.0 constants and editor source; do not infer their semantics from their names. Use [template-text-replacement.ts](../assets/samples/templates/template-text-replacement.ts) for descriptor inspection and recursive `replaceId` updates, [package-generation.ts](../assets/samples/persistence/package-generation.ts) only after the customer supplies `info.json` and all inner assets, and [nested-timeline.ts](../assets/samples/timeline/nested-timeline.ts) for general child timeline ownership.

Template and project packages are external dependencies. Verify installation, applicable license, package ID, supported aspect ratio, footage requirements, project resource directory, and every referenced material before creating or loading a timeline. Use `createTemplateTimeline()` when populating an installed template, `createEmptyTemplateTimeline()` when starting template authoring, and `loadProject()` only after installing the project package and preparing its external resource directory.

Inspect packages with `getTemplateFootages()`, `getTemplateCaptions()`, `getTemplateCompoundCaptions()`, and aspect-ratio methods. Supply footage paths and text according to the returned descriptors; do not assume ordering or required count. `applyThemeTemplate()` is a separate timeline operation and requires a compatible installed package.

Nested timelines are exposed through timeline-clip/internal-timeline APIs. Stop or await readiness before structural changes, retain explicit ownership, and prevent deleting a child timeline while a parent still references it.

Package generation/persistence methods such as `writeTemplateXml()` and `generateTemplatePackage()` require customer-owned output directories and resources. They are not a substitute for application persistence design.

Validate package status, descriptor counts, aspect ratio, footage mapping, created timeline duration, LiveWindow seek, nested ownership, and cleanup. Query the full domain before composing a template-specific recipe.
