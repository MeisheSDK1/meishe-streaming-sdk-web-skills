# Project XML and persistence

Use [project-persistence.ts](../assets/samples/persistence/project-persistence.ts) for SDK-native project XML, readiness, write-result checks, and customer-prepared resource-directory loading. Use [package-generation.ts](../assets/samples/persistence/package-generation.ts) only after `info.json` and package-owned resources exist in SDK FS. Use [application-project-xml.ts](../assets/samples/persistence/application-project-xml.ts) only when the customer owns an application-specific XML schema and needs low-level `NvsXmlStreamReader`/`NvsXmlStreamWriter` access; [application-project-xml-example.ts](../assets/samples/persistence/application-project-xml-example.ts) demonstrates a minimal versioned round trip.

These are separate formats. `NvsAssetPackageManager.writeProjectXml()` produces the SDK project workflow consumed by `NvsStreamingContext.loadProject()`. The editor source's `ReadUtils.ts` and `WriteUtils.ts` implement a company application schema with product fields, migrations, backend resource resolution, and feature flags; that schema is not a public SDK standard and is not distributed as a reusable contract.

SDK objects are not JSON application state. Persist only through a documented project/template/XML workflow plus the customer application's own schema and media/package references.

`NvsStreamingContext.loadProject(projectId, resourceDir, flags?)` loads an SDK project from customer-managed project resources. `NvsAssetPackageManager.writeProjectXml()` and `generateProjectPackage()` support project-package workflows. `NvsXmlStreamWriter` and `NvsXmlStreamReader` expose low-level SDK FS XML streaming; they do not define a project schema for the application.

Before saving, stop or await timeline-modification readiness and ensure every referenced media/package/font has a stable customer-owned identifier. Application XML paths must be below `/project` or `/projectresource`. Package generation directories must be below `/template`, `/project`, or `/projectresource` as appropriate for the requested kind. Check every boolean result, close writers/readers, and copy/export data only through the customer's approved storage path.

Do not infer a browser-side final video encoder from the reference editor's “compile/export” UI. That flow writes company application XML, uploads it, and creates a backend rendering task. This Skill covers SDK project/application persistence boundaries but does not invent a client-side final-media export recipe when the target delivery provides none. Treat final rendering, task polling, output storage, and distribution as customer backend integration unless target SDK documentation proves a browser API.

Before loading, gate the project ID/resource directory, matching package assets/licenses, SDK compatibility, and schema/version expectations. Perform the complete load while the editor remains in its project-loading state. A returned timeline still needs a LiveWindow connection and initial seek before the project is ready.

Keep the three project branches distinct:

1. **Empty project:** derive resolution/fps/audio settings, create the Timeline, create/connect the LiveWindow, optionally create application-required default tracks, then expose an `empty-ready` session without requiring a seek on zero duration. Importing the first media later may create/select a video track and perform the first seek, but only mutates the ready Timeline and never creates or connects the Timeline/LiveWindow foundation.
2. **Application-owned XML:** download the small XML payload into SDK FS when required by `NvsXmlStreamReader`; validate root/schema; parse application Timeline data; resolve/install referenced media, packages, and fonts; restore WebLocal URL descriptors and mark browser-local `File` references offline when they cannot be re-registered; derive resolution and Timeline flags; create the Timeline; create/connect the LiveWindow; rebuild tracks, clips, captions, stickers, transitions, effects, nested timelines, and settings; then initial seek.
3. **SDK-native project:** prepare the SDK resource directory, call `loadProject()`, create/connect the LiveWindow to the returned Timeline, then initial seek.

Use `assets/samples/core/project-loading.ts` to enforce these branches. Its application-XML adapter intentionally requires `readProjectXml`, `timelineFromProject`, and `restoreProject` as separate operations so XML parsing happens before Timeline creation and SDK reconstruction happens before readiness. Do not copy the private editor schema from source evidence into customer projects.

For an application-owned XML schema, require an explicit root name and schema version, reject mismatches before parsing feature fields, treat every attribute as untrusted text, and keep media/package resolution outside the codec. Add migrations only from customer-provided schema evidence. Never infer missing company fields from the extracted sample. Persisted `.weblocal` descriptor text does not restore a browser-local `File` registration across sessions; require reselection or mark the clip offline.

Validate round-trip duration, track/clip counts, media references, package IDs, captions/stickers/effects, aspect ratio, and failure handling for missing resources. Never embed credentials or internal service paths in project XML.
