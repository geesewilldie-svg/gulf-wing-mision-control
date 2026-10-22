# Holographic terrain Graph and ASUS ScreenPad companion

Graph previously reused Core's spherical point cloud with extra connections, so
switching modes had little visual impact. Graph now renders an original tilted
wireframe surface with four labeled peaks, cyan-to-amber/red elevation colors,
a floor grid, drop lines, and an animated cross-section. Selecting an agent raises
its peak. These heights are explicitly DEMO values, not provider telemetry.
Core and Galaxy retain their existing rendering and interactions.

The new `/screenpad` companion uses the existing visual system and saved/shared
workspace. It provides a compact hologram, venture and agent selection, mission
status controls, and fullscreen. Open it through Screens & TV, then move it to an
ASUS ScreenPad configured as an extended Windows display. It does not mirror the
entire dashboard or configure ASUS hardware/drivers. Display-only paired sessions
cannot edit the workspace. The main dashboard and companion synchronize using
existing same-browser persistence or paired laptop-host infrastructure.

Validation: production build and TypeScript passed; 88 browser tests passed,
8 duplicate host-sync matrix cases intentionally skipped. New coverage checks
terrain selection/rotation/static rendering, independent ScreenPad windows,
workspace propagation, reload persistence, viewer permissions, 44px main touch
targets, and layouts at 1000x500, 800x400, and 320x640. Browser captures had no
page errors or horizontal overflow. Some small-height layouts require scrolling.

Evidence: `docs/design/terrain-desktop.png`, `terrain-mobile.png`,
`terrain-expanded.png`, and `terrain-screenpad.png`. Source references were the
user-provided HUD and colored wireframe terrain pictures. Stock imagery and
watermarks are not used in runtime assets. The implementation is a functional
Canvas data visualization, not a stock-image reproduction.

Physical ScreenPad support, ScreenXpert configuration, Windows scaling, and touch
behavior remain local hardware checks. No deployment, paid service, external
model integration, or automatic merge is included.
