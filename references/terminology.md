# Terminology and invariants

- **SDK baseline**: the API surface in `NvStreamingSdk.js` 3.16.0 and `sdk.d.ts` 3.16.0 bundled with this Skill for lookup.
- **Runtime SDK**: the official JavaScript and matching WASM files supplied by the customer. The lookup copy is never a runtime artifact.
- **Streaming context**: the singleton returned by `nvsGetStreamingContextInstance()` after the Emscripten module is ready.
- **Timeline / track / clip**: the editing object hierarchy. Timeline time values use microseconds unless an API says otherwise.
- **LiveWindow**: the SDK preview object bound to a browser canvas ID.
- **SDK FS**: the Emscripten virtual filesystem exposed as `FS`; it is separate from browser URLs and the host filesystem.
- **WebLocal**: a metadata file understood by the SDK that points to browser/local network media. It requires valid metadata, not merely a renamed media file.
- **Built-in effect**: addressed by an SDK-defined name and normally needs no package installation.
- **Packaged effect/material**: addressed by a package ID after the matching package and, when required, its license are installed.
- **Logical task**: one user objective spanning its initial request and all continuing clarifications, corrections, status questions, and follow-ups for the same target project and SDK evidence. Show the baseline banner once after initial target detection; a new message alone never starts another compatibility pass. Start a new pass only for a distinct objective, a changed target project/runtime/SDK, or new or conflicting compatibility evidence.

Gate states describe whether the current workflow may continue; they do not by themselves claim runtime success:

- `available`: sufficient evidence exists to continue the current mode. Preserve `evidencePhase` and every `validationPending` item.
- `approval-required`: an in-scope prerequisite mutation is known, but it must wait for explicit user confirmation in the conversation. Tool, sandbox, workspace, and auto-approval do not satisfy it.
- `decision-required`: the user must choose a policy or strategy, such as authorization or media ownership, before dependent work.
- `runtime-required`: a browser/runtime result such as `context.getSdkVersion()` must be observed before feature implementation.
- `provisionable`: safely creatable only after preflight barriers are clear; it never authorizes an unconfirmed first-use project mutation. Answer mode never provisions.
- `missing-external`: must be supplied by the customer; implementation stops before dependent code while static explanation may continue.
- `unknown`: evidence is insufficient; implementation stops only when the condition is runtime-critical, otherwise isolate and report the uncertainty.

Evidence phases:

- `static`: source, configuration, dependency, or file-structure evidence. It does not prove browser execution, authorization success, production headers, rendered output, or JavaScript/WASM provenance.
- `runtime`: an observed browser/API result for the current customer runtime and requested path.

Evidence kinds describe where a claim came from; they are not gate states:

- `caller-attested-*`: a decision, provenance claim, input kind, or runtime API result supplied to the inspector only after the stated conversational or runtime action. It is auditable workflow evidence, not a fact independently observed by the inspector.
- `persisted-project-decision`: an explicit application-level strategy/source discriminator that records an earlier user decision. Reuse it on later tasks; a bare file extension or UI label is not equivalent.

`bootstrapReady` means only that the approved minimal SDK runtime bootstrap may run so `context.getSdkVersion()` can be observed. `prerequisitesReady` mirrors it for compatibility. `featureInputsReady` covers policy and external feature inputs. Only `featureImplementationReady` authorizes creation of feature objects.

**Consolidated discovery report** means the first user-facing gate report after read-only inspection. It includes all observed gates plus conditional follow-ons of unresolved choices, even when exact API comparison, approval, mutation, or runtime validation must wait for a later stage. Reporting a gate is not approval to satisfy it. A later decision may activate a conditional gate and produce a delta, but must not be used to justify withholding that conditional gate from the first report.

Treat authorization flow presence and feature authorization as separate facts. A detected `verifySdkLicenseFile` call or complete existing initialization prevents repeated policy questions, but its callback and `functionalityAuthorised()` results remain runtime validations. For first-use mutations, `requiresUserApproval` always means an explicit conversational confirmation; never infer it from implementation mode or a tool approval result.

Never infer a package ID, built-in effect name, license URL, SDK root, media metadata, authorization policy, or JavaScript/WASM version pairing.

For an existing project, a structurally complete local runtime, a configured local/CDN loading flow, a declared dependency, an actual `verifySdkLicenseFile` call, or a complete SDK initialization flow is sufficient static evidence for its own integration decision. Do not ask the user to reconfirm it on each feature integration. Do not infer authorization from `.env` or a mode-like configuration value. Revisit existing evidence only after a concrete runtime failure or conflicting project evidence. Network access is never implied by `provisionable`; ask before installing a dependency that is actually absent.
