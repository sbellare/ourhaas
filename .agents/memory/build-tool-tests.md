---
name: Build-tool test environment
description: Why configuration tests for Node build tools must be separate from browser-component tests.
---

Run Vite configuration tests in native Node rather than the UI suite's jsdom environment.

**Why:** Loading Vite also loads esbuild, which checks that `TextEncoder` returns a `Uint8Array` from the same realm. The browser test environment can mix these realms and fail that invariant before any configuration assertion runs, even though the actual production build works.

**How to apply:** Keep Node build-tool checks separate from browser-component tests. Do not change browser globals or remove component-test setup just to make an esbuild import succeed.
