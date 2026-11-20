# Third-Party Assets

Track every third-party asset used by the runtime visuals and post FX.

## Rules

- Only include assets with clear open licenses.
- Prefer CC0 and CC BY.
- Runtime model format must be `glb` or `gltf`.
- Runtime 2D format should be `svg`, `lottie json`, sprite sheet, or animated `webp`.
- Do not ship `fbx`, `obj`, or `blend` directly at runtime.

## Asset Inventory

| Asset Name                                          | Runtime Path                                                                        | Author                                                                     | Source URL                                                                                                                        | License                                               | Attribution Required                     | Status       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------- | ------------ |
| Avocado (mapped to model-01 slot)                   | `public/assets/models/kenney/model-01.glb`                                          | Microsoft (via Khronos sample asset)                                       | https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Avocado/glTF-Binary/Avocado.glb                     | CC0 1.0                                               | No                                       | Ready        |
| Boom Box (mapped to model-02 slot)                  | `public/assets/models/poly-pizza/model-02.glb`                                      | Microsoft (via Khronos sample asset)                                       | https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BoomBox/glTF-Binary/BoomBox.glb                     | CC0 1.0                                               | No                                       | Ready        |
| Barramundi Fish (mapped to model-03 slot)           | `public/assets/models/quaternius/model-03.glb`                                      | Microsoft (via Khronos sample asset)                                       | https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BarramundiFish/glTF-Binary/BarramundiFish.glb       | CC0 1.0                                               | No                                       | Ready        |
| Lantern (mapped to model-04 slot)                   | `public/assets/models/kenney/model-04.glb`                                          | Microsoft/sbtron/Frank Galligan (via Khronos sample asset)                 | https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Lantern/glTF-Binary/Lantern.glb                     | CC0 1.0                                               | No                                       | Ready        |
| Water Bottle (mapped to model-05 slot)              | `public/assets/models/poly-pizza/model-05.glb`                                      | Microsoft (via Khronos sample asset)                                       | https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/WaterBottle/glTF-Binary/WaterBottle.glb             | CC0 1.0                                               | No                                       | Ready        |
| Corset (mapped to model-06 slot)                    | `public/assets/models/quaternius/model-06.glb`                                      | UX3D/Microsoft (via Khronos sample asset)                                  | https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Corset/glTF-Binary/Corset.glb                       | CC0 1.0                                               | No                                       | Ready        |
| Fox (mapped to model-07 slot)                       | `public/assets/models/kenney/model-07.glb`                                          | PixelMannen, tomkranis, AsoboStudio/scurest (via Khronos sample asset)     | https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb                             | CC BY 4.0 (plus CC0 parts)                            | Yes                                      | Ready        |
| Animated Morph Cube (mapped to model-08 slot)       | `public/assets/models/poly-pizza/model-08.glb`                                      | Public (via Khronos sample asset)                                          | https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/AnimatedMorphCube/glTF-Binary/AnimatedMorphCube.glb | CC0 1.0                                               | No                                       | Ready        |
| Toy Car (mapped to model-09 slot)                   | `public/assets/models/kenney/model-09.glb`                                          | Public (via Khronos sample asset)                                          | https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ToyCar/glTF-Binary/ToyCar.glb                       | CC0 1.0                                               | No                                       | Ready        |
| Sheen Chair (mapped to model-10 slot)               | `public/assets/models/poly-pizza/model-10.glb`                                      | Wayfair, LLC (via Khronos sample asset)                                    | https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/SheenChair/glTF-Binary/SheenChair.glb               | CC0 1.0                                               | No                                       | Ready        |
| Box Vertex Colors (mapped to model-11 slot)         | `public/assets/models/quaternius/model-11.glb`                                      | Public (via Khronos sample asset)                                          | https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BoxVertexColors/glTF-Binary/BoxVertexColors.glb     | CC0 1.0                                               | No                                       | Ready        |
| Normal Tangent Test (mapped to model-12 slot)       | `public/assets/models/kenney/model-12.glb`                                          | Analytical Graphics, Inc. (via Khronos sample asset)                       | https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/NormalTangentTest/glTF-Binary/NormalTangentTest.glb | CC0 1.0                                               | No                                       | Ready        |
| SVG layer wave                                      | `public/assets/animations/svg/layer-wave.svg`                                       | Project placeholder                                                        | Local file                                                                                                                        | Internal placeholder                                  | No                                       | Ready        |
| SVG layer flare                                     | `public/assets/animations/svg/layer-flare.svg`                                      | Project placeholder                                                        | Local file                                                                                                                        | Internal placeholder                                  | No                                       | Ready        |
| Overlay grid texture                                | `public/assets/textures/overlay-grid.svg`                                           | Project placeholder                                                        | Local file                                                                                                                        | Internal placeholder                                  | No                                       | Ready        |
| Local SVG overlay pack                              | `public/assets/textures/*.svg`, `public/assets/animations/svg/*.svg`                | Project placeholder                                                        | Local files via `packages/engine/src/overlay-manifest.json`                                                                       | Internal placeholder                                  | No                                       | Ready        |
| Soldier (Wiki-Chroma actor, runtime fetch)          | Remote: fetched on first Wiki-Chroma activation                                     | Mixamo/three.js examples (via `scene.ts` WIKICHROMA_ANIMATED_GLTF_SOURCES) | https://threejs.org/examples/models/gltf/Soldier.glb                                                                              | three.js example asset — verify before redistribution | Verify                                   | Runtime only |
| Robot Expressive (Wiki-Chroma actor, runtime fetch) | Remote: fetched on first Wiki-Chroma activation                                     | Tomás Laulhé (via three.js examples)                                       | https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb                                                      | CC0 1.0                                               | No                                       | Runtime only |
| Fox (Wiki-Chroma actor, runtime fetch)              | Remote: fetched on first Wiki-Chroma activation; falls back to local `model-07.glb` | PixelMannen, tomkranis, AsoboStudio/scurest (via Khronos sample asset)     | https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/Fox/glTF-Binary/Fox.glb                                   | CC BY 4.0 (plus CC0 parts)                            | Yes                                      | Runtime only |
| Wikimedia Commons overlay images (runtime fetch)    | Remote: fetched only when the Commons overlay toggle is enabled                     | Per-image (Commons uploaders)                                              | https://commons.wikimedia.org (via `packages/engine/src/commons-overlay-source.ts`)                                               | Per-image (shown in Stats for nerds)                  | Per-image; credit line surfaced in Stats | Runtime only |

## Runtime Data Sources

Fetched by the browser when the Globe view is shown with **Country map** on.
Nothing is bundled or redistributed, and turning the toggle off makes no
requests. Source constants live in `packages/engine/src/views/globe-data.ts`.

| Data                                | URL                                                                  | Author                                   | License                               | Attribution Required |
| ----------------------------------- | -------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------- | -------------------- |
| Country outlines (1:110m, TopoJSON) | `https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json` | Natural Earth, packaged by `world-atlas` | Public domain (data); ISC (packaging) | No                   |

Text overlay sources that use the network (chosen under Post FX → Overlays →
Demo-scene text overlay; the bundled sources make no requests):

| Data                  | URL                                                           | Author                 | License                                         | Attribution Required   |
| --------------------- | ------------------------------------------------------------- | ---------------------- | ----------------------------------------------- | ---------------------- |
| Poetry lines          | `https://poetrydb.org/random/<n>`                             | PoetryDB               | Public-domain poems                             | No (credited in Stats) |
| Random article titles | `https://en.wikipedia.org/w/api.php?action=query&list=random` | Wikipedia contributors | Titles only shown; article text is CC BY-SA 4.0 | No (linked in Stats)   |
| IT excuses            | `https://bofh.bombeck.io/v1/excuses/random`                   | bofh.bombeck.io        | API content; verify before redistributing       | No (credited in Stats) |

## Replacement Checklist

1. Download assets only from approved sources.
2. Verify license before adding files.
3. Convert/optimize to `glb` for 3D when needed.
4. Fill all TODO fields in the table above.
5. Note attribution text in this document if required by license.

## Required Attribution

- Fox includes CC BY 4.0 contributions in its source chain. Keep attribution to PixelMannen, tomkranis, and AsoboStudio/scurest when distributing this asset. This applies to both the local `model-07.glb` copy and the remote copy fetched at runtime for Wiki-Chroma.
- Wikimedia Commons overlay images are fetched at runtime with per-image licenses (often CC BY / CC BY-SA); the app surfaces each image's credit line in the Stats for nerds panel. Do not redistribute cached copies without checking the per-image license.

## Fonts

Bundled through `@fontsource` packages (imported in `src/main.tsx`) and drawn
into the Hi-Fi, Tape Deck and Signal Lab panels.

| Font            | Package                       | Designer            | License | Used for                    |
| --------------- | ----------------------------- | ------------------- | ------- | --------------------------- |
| Michroma        | `@fontsource/michroma`        | Vernon Adams        | OFL 1.1 | Faceplate lettering         |
| Share Tech Mono | `@fontsource/share-tech-mono` | Carrois Type Design | OFL 1.1 | Scales and numeric readouts |
