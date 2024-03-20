# dh-vscode-core

## Setup

/lib contains dh modules

- Hack dynamic import to prevent ts compiler from changing to require `const dynamicImport = new Function("specifier", "return import(specifier)");`
- Saved as .mjs to support import
- Changed import in dh-core.mjs to `import {dhinternal} from './dh-internal.mjs';`
