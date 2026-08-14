# Design QA — Contextual controls, object menu, and text styling

## Comparison target

- Source visual truth:
  - `/Users/jasonwilhelm/Desktop/untitled folder/Screenshot 2026-08-12 at 9.12.25 PM.png`
  - `/Users/jasonwilhelm/Desktop/untitled folder/Screenshot 2026-08-12 at 9.13.32 PM.png`
  - `/Users/jasonwilhelm/Desktop/Screenshot 2026-08-13 at 1.29.47 PM.png`
  - `/Users/jasonwilhelm/Desktop/Screenshot 2026-08-13 at 1.30.12 PM.png`
  - `/Users/jasonwilhelm/Desktop/Screenshot 2026-08-13 at 1.35.52 PM.png`
  - `/Users/jasonwilhelm/Desktop/Screenshot 2026-08-13 at 1.37.03 PM.png`
  - `/Users/jasonwilhelm/Desktop/Screenshot 2026-08-12 at 9.14.46 PM.png`
  - `/Users/jasonwilhelm/Desktop/Screenshot 2026-08-12 at 9.12.52 PM.png`
  - `/Users/jasonwilhelm/Desktop/Screenshot 2026-08-12 at 9.13.04 PM.png`
  - `/Users/jasonwilhelm/Desktop/Screenshot 2026-08-12 at 9.13.16 PM.png`
  - `/Users/jasonwilhelm/Desktop/Screenshot 2026-08-13 at 2.04.42 PM.png`
  - `/Users/jasonwilhelm/Desktop/Screenshot 2026-08-13 at 2.28.09 PM.png`
  - `/Users/jasonwilhelm/Desktop/untitled folder/Screenshot 2026-08-13 at 3.02.47 PM.png`
  - `/Users/jasonwilhelm/Desktop/Screenshot 2026-08-13 at 8.15.16 PM.png`
  - `/Users/jasonwilhelm/Desktop/Screenshot 2026-08-13 at 8.15.41 PM.png`
  - `/Users/jasonwilhelm/Desktop/Screenshot 2026-08-13 at 8.16.00 PM.png`
  - `/Users/jasonwilhelm/Desktop/Screenshot 2026-08-13 at 8.16.37 PM.png`
- Browser-rendered implementation:
  - `/Users/jasonwilhelm/Desktop/Vibe Coding/Thinking Canvas/docs/implementation/evidence/milestone-02/slice-04-dark-context-toolbar-local.png`
  - `/Users/jasonwilhelm/Desktop/Vibe Coding/Thinking Canvas/docs/implementation/evidence/milestone-02/slice-04-object-context-menu-local.png`
  - `/Users/jasonwilhelm/Desktop/Vibe Coding/Thinking Canvas/docs/implementation/evidence/milestone-02/slice-04-text-styling-local.png`
  - `/Users/jasonwilhelm/Desktop/Vibe Coding/Thinking Canvas/docs/implementation/evidence/milestone-02/slice-04-color-swatches-local.png`
  - `/Users/jasonwilhelm/Desktop/Vibe Coding/Thinking Canvas/docs/implementation/evidence/milestone-02/slice-04-exterior-anchors-local.png`
  - `/Users/jasonwilhelm/Desktop/Vibe Coding/Thinking Canvas/docs/implementation/evidence/milestone-02/slice-04-fill-palette-v2-local.png`
  - `/Users/jasonwilhelm/Desktop/Vibe Coding/Thinking Canvas/docs/implementation/evidence/milestone-02/slice-04-stroke-palette-v2-local.png`
  - `/Users/jasonwilhelm/Desktop/Vibe Coding/Thinking Canvas/docs/implementation/evidence/milestone-02/slice-04-text-color-v2-local.png`
  - `/Users/jasonwilhelm/Desktop/Vibe Coding/Thinking Canvas/docs/implementation/evidence/milestone-02/slice-04-custom-color-picker-local.png`
  - `/Users/jasonwilhelm/Desktop/Vibe Coding/Thinking Canvas/docs/implementation/evidence/milestone-02/slice-04-compact-custom-color-picker-local.png`
  - `/Users/jasonwilhelm/Desktop/Vibe Coding/Thinking Canvas/docs/implementation/evidence/milestone-02/slice-04-selection-handle-anchor-refinement-local.png`
  - `/Users/jasonwilhelm/Desktop/Vibe Coding/Thinking Canvas/docs/implementation/evidence/milestone-02/slice-04-selection-handle-anchor-refinement-zoomed-local.png`
  - `/Users/jasonwilhelm/Desktop/Vibe Coding/Thinking Canvas/docs/implementation/evidence/milestone-02/slice-04-adaptive-selection-handles-186-local.png`
  - `/Users/jasonwilhelm/Desktop/Vibe Coding/Thinking Canvas/docs/implementation/evidence/milestone-02/slice-04-adaptive-selection-handles-100-local.png`
  - `/Users/jasonwilhelm/Desktop/Vibe Coding/Thinking Canvas/docs/implementation/evidence/milestone-02/slice-04-adaptive-selection-handles-59-local.png`
  - `/Users/jasonwilhelm/Desktop/Vibe Coding/Thinking Canvas/docs/implementation/evidence/milestone-02/slice-04-adaptive-selection-handles-29-local.png`
  - `/Users/jasonwilhelm/Desktop/Vibe Coding/Thinking Canvas/docs/implementation/evidence/milestone-02/slice-04-adaptive-selection-handles-comparison.png`
- Route: authenticated local canvas workspace at `/app/canvases/[canvasId]`
- State: two selected shapes for the contextual toolbar and selection-actions menu; one selected linked text primitive with Bookish, Large, bold, centered, numbered formatting and the Text style panel open.

## Viewport and normalization

- Implementation viewport: `1280 × 720` CSS pixels at device scale factor `1`; captures are `1280 × 720` pixels.
- Source toolbar crop: `1640 × 516` pixels. Source context-menu crop: `488 × 1036` pixels. The supplied references are focused high-density Figma captures rather than full browser viewports.
- Additional text-formatting source crops are `618 × 272`, `400 × 644`, and `346 × 428` pixels. The text-style implementation capture is `1280 × 720` pixels at the same `1280 × 720` CSS viewport and density `1`.
- The latest focused source crops are `394 × 190`, `268 × 154`, `778 × 792`, and `156 × 128` pixels. Their three implementation states are full `1280 × 720` captures at device scale factor `1`; the toolbar and open-menu regions were compared at visible rendered scale.
- Density normalization: the comparison judged the shared focused UI surfaces at their visible rendered scale rather than treating the source crop dimensions as a required application viewport. Browser chrome, surrounding canvas area, and source-crop density were excluded from mismatch findings.
- The custom-picker source is `474 × 790` pixels. Its implementation evidence is a `1280 × 720` browser capture at a `1280 × 720` CSS viewport and device scale factor `1`, with a focused `405px`-wide picker surface. The focused picker regions were compared at their visible rendered scale; the source's surrounding palette fragment and the implementation's surrounding workspace were excluded from mismatch findings.
- The compact-placement feedback source is `1090 × 1076` pixels. Its implementation evidence is a `1280 × 720` browser capture at a `1280 × 720` CSS viewport and device scale factor `1`, with a `320 × 440` picker. The different viewport heights intentionally exercise opposite placement branches: the screenshot-sized geometry fits below the swatch, while the shorter in-app browser viewport correctly falls back above it.
- The selection-handle source is `902 × 474` pixels. Both implementation captures are `1280 × 720` browser screenshots at device scale factor `1`, covering the same selected shape at `126%` and `93%` canvas zoom. The focused shape regions were compared at visible CSS scale; the source crop's larger object, different text, and surrounding workspace were excluded from mismatch findings.
- The four adaptive-zoom sources are `882 × 874`, `668 × 598`, `558 × 438`, and `682 × 560` pixels at `189%`, `102%`, `60%`, and `30%`. The corresponding implementation captures are `1280 × 720` at device scale factor `1` and `185%`, `100%`, `58%`, and `29%`; a single labeled comparison sheet normalizes the different source crops while preserving the visible handle-to-object proportions.

## Full-view comparison evidence

The full implementation captures confirm that the dark controls preserve the existing Thinking Canvas workspace hierarchy: contextual controls remain adjacent to the selection, the action menu stays within the viewport, and permanent route chrome and the primary tool dock remain visually subordinate. The corrected text panel ends at `609px`, above the primary dock beginning at `646px`, at `1280 × 720`; its overflow scroll retains access to link actions without obstructing persistent controls.

## Focused region comparison evidence

The source and implementation toolbar images were opened together in one comparison input, followed by the source and implementation context-menu images in a second comparison input. The three supplied text-formatting references and the latest implementation screenshot were then opened together in one comparison input. The focused comparisons show the intended near-black surface, white primary copy/icons, subtle gray dividers, rounded elevation, purple active/focus state, selected alignment/list controls, preset sizing with a custom field, and differentiated typeface choices. The implementation intentionally consolidates the reference's nested menus into one scrollable Thinking Canvas panel while preserving its visual direction and behavior.

The two supplied color-control references and the latest fill/outline implementation were also opened together in one comparison input. The implementation preserves the reference's compact circular palette, selected violet ring, near-black elevated surface, and current-color indicators while adding the requested paired fill/darker-outline behavior and independently editable custom values. A second implementation capture confirms that only the four exterior connector anchors remain.

The four 2026-08-13 refinement references and the three latest implementation captures were opened together in one comparison input. The resulting toolbar follows Fill, Stroke, Text style order; Stroke uses the requested horizontal-bar icon instead of a current-color swatch; and the fill, stroke, and text surfaces use the same circular rainbow custom-color entry. The implementation intentionally keeps custom stroke out of the fill palette while preserving coordinated fill presets.

The supplied custom-picker reference and `slice-04-custom-color-picker-local.png` were opened together in one comparison input after setting the implementation hex field to the reference value `#C2E5FF`. The focused comparison confirms the near-black rounded surface, eyedropper action, large editable hex field, horizontal hue and opacity controls with circular handles, and a full-width saturation/brightness field with the selected blue hue. The implementation adds an explicit close button and visible focus treatment for keyboard clarity.

The `2.28.09 PM` product-feedback capture and `slice-04-compact-custom-color-picker-local.png` were opened together in one comparison input. The implementation reduces the picker from `405px` to `320px` wide and the color field from `405px` to `270px` tall while preserving the reference controls, hierarchy, and selected hue. Its right edge remains aligned to the rainbow swatch; placement prefers an `8px` gap below when the measured panel fits and otherwise moves above without leaving the viewport.

The `3.02.47 PM` source and the final `126%` implementation were opened together in one comparison input, followed by the `126%` and `93%` implementation captures together. The final shape has a thicker cyan selection frame with substantial white handles and four purple connection anchors clearly separated beyond the selection handles.

The four `8.15–8.16 PM` zoom references and four matching implementation states were then placed together in one labeled comparison input. At `185%` and `100%`, handles retain their normal screen size; at `58%`, the frame, handles, anchor size, and anchor offset shrink with the object; at `29%`, selection and connector chrome is absent while the selected object and contextual actions remain available.

## Findings

- No actionable P0, P1, or P2 visual differences remain.
- Fonts and typography: the existing application sans-serif is retained for control copy; Simple, Bookish, Technical, Scribbled, Modern, and Rounded choices visibly differentiate canvas content while preserving readable menu labels.
- Spacing and layout rhythm: `44px` action rows, compact contextual buttons, separators, rounded corners, and elevation are internally consistent and remain within the viewport.
- Colors and visual tokens: near-black surfaces, white foregrounds, zinc dividers, violet active/focus treatment, and destructive red map cleanly to the supplied reference direction.
- Image quality and asset fidelity: the new transparent `128 × 128` rainbow-wheel asset remains crisp at its `36px` rendered size and matches the supplied custom-color reference; the remaining controls use the established icon library and stay stylistically consistent.
- Copy and content: Group/Ungroup, ordering, clipboard, duplicate, delete, typeface, size, alignment, list, and link labels are concise and applicable to the product's existing command model.
- Accessibility and behavior: semantic menu roles, disabled/pressed states, initial focus, arrow/Home/End movement, Escape dismissal, Shift+F10/Context Menu access, right-click, Control-click, labeled text controls, safe-link actions, and custom-size keyboard commit are covered. Automated axe checks report no detectable violations in the tested states.
- Custom color picker: the native browser picker has been replaced with one consistent fill, stroke, and text-color dialog. Hex entry, optional browser eyedropper, hue, opacity, saturation, brightness, Escape/focus restoration, outside dismissal, and pointer/keyboard adjustment are all represented by labeled controls. The large color field and the hue/opacity composition match the supplied interaction reference without changing the persisted style command boundary.
- Compact placement: the revised picker no longer dominates the canvas. A pure placement resolver and browser-visible `data-placement` state cover below, above, and viewport-clamped cases while retaining right-edge alignment to the invoking swatch.
- Selection and connector handles: at `100%` and above, selection handles are `14px` with a `3px` cyan stroke and connection anchors are `7px` circles centered `28px` beyond the edge. From `100%` down to `45%`, those visual sizes and offsets scale with zoom; below `45%`, selection and connector chrome is hidden. Visible anchors retain at least an `18px` invisible hit stroke, and the `44px` screen-space hover corridor still supports pointer travel at editing zooms.

## Comparison history

- Pass 1: no P0/P1/P2 findings. No visual correction loop was required after the combined source/implementation comparison.
- Text styling pass 1: P2 persistent-control overlap at `1280 × 720`; the initial full-height text panel extended into the floating primary dock.
- Text styling pass 2: fixed by applying a viewport-derived maximum height and vertical overflow to the text panel. Post-fix browser measurement showed the menu bottom at `608.99px` and dock top at `646px`; the latest implementation screenshot was compared with all three text references and no P0/P1/P2 finding remains.
- Color and anchor refinement pass 1: no P0/P1/P2 findings. The source and implementation palettes share the intended round-swatch hierarchy; the contextual toolbar now shows the current fill and outline as round swatches, and removing the center connector anchor clears the natural double-click editing target.
- Color-control refinement pass 2: no P0/P1/P2 findings. The toolbar ordering, stroke icon, removal of the stroke swatch and fill-panel custom-stroke field, circular rainbow custom entries, and text-color entry match the supplied focused references at the implementation's normalized `1280 × 720` viewport.
- Custom-picker pass 1: the initial implementation included every required interaction but used a compact `340px` panel and `220px` saturation/brightness field, producing a P2 density and proportion mismatch against the tall reference picker.
- Custom-picker pass 2: expanded the panel to `405px`, enlarged the saturation/brightness field to `405 × 405`, increased top-section spacing, set the implementation to `#C2E5FF`, and recaptured the same open state. The combined source/implementation comparison found no remaining actionable P0/P1/P2 difference.
- Custom-picker pass 3: product review identified the `405 × 599` implementation as a P2 workspace-density issue and requested swatch-relative placement. The picker was reduced to `320 × 440`, its color field to `320 × 270`, and placement changed to prefer below with an `8px` gap before falling back above or clamping. The final combined comparison has no remaining actionable P0/P1/P2 difference.
- Selection-handle pass 1: the first implementation capture exposed a P2 geometry issue: connection-anchor children expanded the Konva Transformer bounds, visually placing purple anchors alongside rather than beyond the selection handles.
- Selection-handle pass 2: rendered the connection-anchor overlay as a sibling of the transformable object, applied screen-space sizing and offsets, and recaptured at `126%` and `93%`. The anchors now remain outside the true selection bounds with stable interaction sizing; no actionable P0/P1/P2 difference remains.
- Adaptive-zoom pass 3: product review exposed a P1 low-zoom usability regression: constant screen-space handles overwhelmed shrinking objects at `60%` and became giant cyan blocks at `30%`. The selection frame, resize handles, anchors, and connector endpoints now scale proportionally between `100%` and `45%` and disappear below `45%`. Combined `185%`, `100%`, `58%`, and `29%` evidence shows no remaining actionable P0/P1/P2 difference.

## Primary interactions tested

- Real in-app browser right-click opened Selection actions.
- Automated right-click, Control-click, Shift+F10, Escape dismissal, grouping, ungrouping, layer ordering, focus restoration, and axe coverage passed.
- Browser console warnings/errors checked: none.
- Authenticated in-app browser text styling covered automatic ordered-list entry, Bookish/Large/bold/centered controls, safe URL normalization, selected-state presentation, panel/dock bounds, and zero console warnings/errors.
- Authenticated in-app browser color styling confirmed that Light blue applies fill `#dbeafe` with darker outline `#2563eb`, custom fill and stroke remain independently editable through their applicable palettes, the `T` control opens Text style, and Connector controls expose top/right/bottom/left with no center anchor. Browser logs contained only normal local React DevTools and HMR messages.
- The second color pass confirmed the exact Fill → Stroke → Text style order, no visible current-stroke swatch, no custom-stroke input inside Fill, rainbow custom entries at the end of Fill and Stroke, a round custom text-color entry, and persisted text color. Automated axe coverage remains clean, and the in-app browser emitted no application errors.
- The custom-picker browser pass changed fill through the editable `#C2E5FF` hex field, confirmed the open dialog and labeled Hue, Opacity, and Saturation and brightness controls, verified persistence through the existing object-style path, and found no application console errors. Browser logs contained only normal React DevTools and local HMR messages. The complete 29-scenario Chromium suite passed after the native color inputs were replaced.
- The compact-placement browser pass measured the final picker at `320 × 440`, right-aligned with its `36px` rainbow trigger. At the active `1280 × 720` viewport it selected the expected `above` fallback because the trigger bottom was `552px`; unit coverage verifies `below` placement for the supplied `1090 × 1076` geometry and the fully constrained fallback. No application console warnings or errors were emitted.
- The handle/anchor browser pass inspected the same selected rectangle at `126%` and `93%` zoom and confirmed the visible screen-space sizes and exterior spacing remain stable. Focused Chromium coverage deselects the source, enters through the shape, crosses the object-to-anchor gap in six pointer steps, and successfully drags a connector from the exterior handle. Endpoint reconnection targets the instrumented exterior endpoint handle and releases beyond the same-anchor snap zone. The complete 29-scenario Chromium suite passes, and no application console warnings or errors were emitted.
- The adaptive-zoom browser pass kept one shape selected while stepping through `185%`, `100%`, `58%`, and `29%`. The first two retain full-size handles, `58%` uses proportional chrome, and `29%` has no selection box, handles, anchors, or connector endpoints. The contextual selection actions remain present at overview zoom, and the complete 29-scenario Chromium suite still passes.

## Follow-up polish

- None required for this bounded refinement.

final result: passed
