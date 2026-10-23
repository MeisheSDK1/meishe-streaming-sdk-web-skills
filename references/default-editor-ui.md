# Default validation editor UI

Use this UI only when the user supplied no UI reference and the target has no clearly reusable design system. If either exists, follow it instead. The default editor always renders its five structural regions; inside them, show only implemented features and never add inert feature commands.

Do not collapse the default editor because a recipe is narrow. Keep navigation, material/feature panel, preview, inspector, and bottom Timeline visible; use empty/selection states where appropriate. This Skill provides no alternate default-layout variant.

## Canonical sample

Use [DefaultEditorUi.tsx](../assets/samples/ui/DefaultEditorUi.tsx), [default-editor-ui.css](../assets/samples/ui/default-editor-ui.css), and [default-editor-layout.ts](../assets/samples/ui/default-editor-layout.ts) as the implementation basis. `DefaultEditorUi` is the sole React/Vite validation entry and directly renders all five regions. Preserve the layout constants and the shared ruler/clip/playhead pixel-to-time mapping when adapting it to another framework. Remove unused feature commands, but retain the five structural regions.

The sample markup, CSS, and geometry helpers are authoritative for composition, density, and fixed measurements. This document is authoritative for scope and behavior. The Skill intentionally supplies no UI screenshot or brand logo; use the target product's branding when one exists, otherwise use a plain text title or neutral CSS mark.

## Validation scope

Validate only the requested feature, changed regions, their direct dependencies, and shared editor invariants they can affect. Run one page-level smoke check, but do not exercise unrelated catalogs, inspectors, Timeline commands, or preview modes. Run a full-editor regression only when the user requests it or the change affects shared layout, routing, selection, history, Timeline infrastructure, LiveWindow lifecycle, or several feature domains.

## Canonical layout

- Target desktop validation at 1440×900 with a dark five-region editor: fixed navigation, feature/material panel, preview, inspector, and bottom timeline.
- Start with navigation 80 px, feature panel 310 px, inspector 300 px, and timeline 340 px.
- Allow boundary dragging with pointer capture, keyboard arrows in 10 px steps, and double-click reset. Enforce feature 240 px, inspector 260 px, preview 480×270, and timeline 180 px minimums.
- Use thin dividers, `#0e1116`–`#1a1e24` surfaces, muted gray text, and blue-violet `#6875ed` selection/focus.
- Keep feature, inspector, and timeline overflow internal. Show a thin dark scrollbar only on overflow; an empty timeline must not create a vertical scrollbar.
- Treat any SDK trial watermark as preview content only: do not reproduce, style, or use it as part of the UI contract.

## Regions

- Navigation: brand plus only the implemented categories. For the base verified editor use Material, Captions, Stickers, and Built-in. Put manual timeline Adjustment in Built-in. When filters/effects are implemented, expose Filter and Effect as separate categories; never merge them into one inert or ambiguous category.
- Feature panel: show catalogs immediately. Media has one import control and reusable asset cards; caption/sticker/filter/effect entries do not expose separate “add” forms. Show package loading, Ready, and retry states on package cards. Keep Crop, verified masks, and built-in effects in Built-in when that product taxonomy is selected.
- Preview: title bar, centered fitted stage, and footer. Footer places current/total `HH:MM:SS:FF` at left, play/pause at center, and fullscreen at right. Derive frames from Timeline FPS.
- Inspector: show no editor until one Timeline item is selected. Route media, caption, sticker, filter, effect, and adjustment selections to their matching inspector; a selected transition may remain marker-only when no transition inspector is implemented. Expose intensity only when supported. An adjustment inspector includes one Reset all command that resets the complete logical stack, creates one history entry, retains the SDK playhead, and refreshes preview. Never put delete in the inspector.
- Timeline: keep Undo, Redo, Split, and Delete in the control bar; include ruler and 1–8× zoom with 0.25 steps.

## LiveWindow resizing

Observe the preview viewport, fit the stage to the Timeline aspect ratio, and synchronize Canvas CSS size with its DPR backing store. Preserve SDK alignment requirements. After resize or fullscreen transition, render the position captured before resize; do not seek to a selected clip's in-point. See the resizable LiveWindow sample.

## Timeline visuals and input

- Render one global playhead above ruler and tracks. Give it a white head, a line through all visible tracks, and a wider transparent pointer target. It must remain draggable over selected clips.
- Clicking empty ruler/track space clears the selected item and inspector, then seeks. Holding the primary pointer and dragging across either surface must capture the pointer, continuously seek through `onSeek`, and release capture on pointer-up or cancellation. Prevent the gesture's browser-default selection behavior without breaking single-click seek. Clip and Trim handles stop propagation.
- Render all non-media virtual lanes above media tracks, video tracks above audio tracks, and each media type in descending creation/index order. Sort non-media lanes by stable creation order across caption, sticker, filter, effect, and adjustment kinds so a newly created lane appears at the top. Reusing a lane keeps its existing row position. Render a selectable transition marker at its source-clip boundary; its selected state enables the shared Timeline Delete command.
- Render filters as `F1`, `F2`, … virtual lanes, effects as `E1`, `E2`, …, and adjustments as `ADJ1`, `ADJ2`, …. Give every trimmable item visible Trim handles, apply same-lane collision limits in the gesture preview and mutation layer, and keep product-kind collision namespaces independent. Transitions have no Trim handles.
- Scale ruler, clips, playhead, and scroll width from the same pixels-per-time mapping.
- Preserve the sample's 78 px label column, 30 px ruler, 46 px track height, 7 px inter-track gap, and 72 px video thumbnail tiles. Recompute tile count on zoom or container resize; use `object-fit: cover` and never stretch one thumbnail across a clip.
