# Third party notices

## Spotify Basic Pitch

- Official source: https://github.com/spotify/basic-pitch-ts
- Package: `@spotify/basic-pitch@1.0.1`, Copyright 2022 Spotify AB.
- License: Apache-2.0. Full license text is distributed in `public/licenses/Apache-2.0.txt`.
- The official model.json and group1-shard1of1.bin are copied unchanged from this package by scripts/sync-basic-pitch-model.mjs, and served from the application's origin. No fork or CDN model is used.
- The model and inference implementation are unmodified. The app wraps the public APIs with a Worker platform adapter, bounded evaluation scopes and NoteEvent mapping.
- `@tonejs/midi@2.0.28` is MIT and is a direct application dependency for browser SMF MIDI generation and development round-trip validation. Source: https://github.com/Tonejs/Midi. It is loaded from the same static application origin, with no external service.

## TensorFlow.js

- `@tensorflow/tfjs@3.21.0` and same-version core, converter, layers, data, CPU and WebGL backends.
- Source: https://github.com/tensorflow/tfjs
- Copyright Google LLC and TensorFlow.js contributors. Apache-2.0, license text at `public/licenses/Apache-2.0.txt`.
- Browser-only inference; no tfjs-node, external TensorFlow server, telemetry or CDN assets are used.

## Existing dependencies

React / React DOM and Vite: MIT. TypeScript and Playwright: Apache-2.0.
Development-only lamejs: LGPL-3.0 according to package metadata. It encodes test fixtures and is excluded from the production app.

Attribution and the Apache-2.0 license text are distributed with the static app and source. These notices do not claim ownership of the official model or libraries.
