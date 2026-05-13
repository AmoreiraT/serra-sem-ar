# Serra Sem Ar Mobile 2.5D

## Render modes

- `desktop-3d`: desktop keeps the React Three Fiber scene.
- `mobile-25d`: touch, small screens, iOS, and Instagram in-app browser use the asset-based 2.5D traversal.
- `safe-static`: `prefers-reduced-motion: reduce` uses the same 2.5D route with parallax movement disabled.

The mobile default path returns `MobileSerra25D` before mounting `Scene3D`, so `<Canvas />` is not instantiated on mobile unless the visitor taps the explicit `3D` button.

## File layout

- `src/core/device/deviceProfile.ts`: one-time render-mode decision.
- `src/core/performance/reducedMotion.ts`: reduced-motion helpers.
- `src/features/mobile-25d/components`: 2.5D stage, layers, timeline, and data panel.
- `src/features/mobile-25d/data/serraPassages.ts`: typed passage definitions and asset paths.
- `src/features/mobile-25d/types/serraPassage.ts`: passage and layer contracts.
- `public/assets/25d`: baked AVIF layers with WebP fallback used by mobile. The runtime URLs include a small version query so phones do not keep a stale baked layer after deploy.

## Mobile interaction

The 2.5D route supports normal scroll, keyboard `ArrowUp`/`ArrowDown`, vertical drag on the stage, timeline markers, passage skip buttons, and a pausable auto-travel button. Progress updates are throttled through `requestAnimationFrame`; continuous RAF is only used while auto-travel is active and is disabled in reduced-motion mode.

## Asset generation

Bootstrap/procedural assets can be regenerated without WebGL:

```bash
pnpm assets:generate-25d
```

This writes 1280px AVIF and WebP files to `public/assets/25d/passages` and `public/assets/25d/overlays`.

To bake from the desktop 3D scene, start Vite and run the Playwright script in an environment with `playwright` and `tsx` available:

```bash
pnpm dev
pnpm assets:bake-25d -- --base-url http://localhost:5173 --transparent
```

The bake route is:

```txt
/bake?passage=inicio&layer=back&transparent=1
/bake?passage=colapso&layer=front&transparent=1
```

The app hides the normal UI on `/bake`, fixes the camera, disables controls/player systems, applies a temporal clip window for each passage, and reads the PNG directly from the canvas with `toDataURL` so transparent WebP/AVIF layers keep their alpha channel.

## Test checklist

- iPhone Safari: first screen appears, scroll works, no WebGL canvas is mounted by default.
- Instagram in-app browser: opens the 2.5D route without crashing.
- Chrome Android: scroll, drag, auto-travel, passage skip controls, timeline markers, and lazy images work.
- Desktop Chrome: intro flows into the full 3D scene; `/bake` renders a canvas for capture.
- Reduced motion: mobile uses the same content with parallax movement disabled.
