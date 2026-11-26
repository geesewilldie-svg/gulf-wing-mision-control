# Nexus layout and spacing contract

Owner requirement: tabs, boxes, fields and actions must remain consistently spaced and usable throughout the architecture, including future phases.

`app/nexus-spacing.css`, imported after the existing global theme, owns the shared spacing scale inside `.nexus-app-frame`: 4, 8, 12, 16, 24 and 32 CSS pixels. Reuse these variables instead of adding screen-specific spacing overrides.

- Primary navigation uses three equal columns on desktop and two on phones, with 12/8px gaps, 12px inset and at least 48px targets.
- Cards use 24px padding on desktop and 16px on phones; separate cards by 24px once, avoiding both grid gaps and trailing margins on Foundation cards.
- Headings and body copy have 12px separation. Forms, fields, disclosure contents and action groups use 16px section spacing; labels retain an 8px internal gap.
- Use `.nexus-actions` for related buttons or links. Its wrapping rows have a 12px gap and stack on phones. Existing Foundation and Nexus action groups follow the same rhythm. Do not place adjacent bare buttons together in new components.
- Controls remain at least 44px high. Long labels must wrap within their available width. Test disabled/selected states and keyboard focus as well as the empty screen.
- Keep visualization hit targets, canvas geometry and fullscreen behavior under their dedicated visual styles. Do not add document-flow margins to stars or canvas overlays.

Before completing future UI phases, inspect rendered desktop and Samsung phone screens, including expanded details and populated states. Check all changed tabs for horizontal overflow, overlapping actions, clipped labels and missing space between descriptions and controls. `tests/nexus-spacing.spec.ts` exercises all nine primary tabs, actual navigation gaps, touch-target heights, viewport containment and shared action rows. Its screenshots are saved in ignored `artifacts/spacing/` for visual review.
