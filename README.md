# dh-in-vscode

Deephaven in VS Code

- Run Python dh scripts from vscode against a running DH core server
- View output in panels in vscode (relies on `embed-widget` which currently doesn't support `Deephaven UI`)
- View output in DH (pending https://github.com/deephaven/web-client-ui/pull/1925)

## Run a script

1. Start a DH core server at http://localhost:1000
2. Open a DH Python script in vscode
3. Click the `Deephaven: Run` button in the top right of the editor

   ![Deephave: Run](docs/run.png)

The first time a script is run in an open workspace, the extension will:

1. Download the JS API from the server
2. Attempt to authenticate anonymously
3. If anonymous auth fails, prompt for `PSK`
4. If either 3 or 4 succeeds, run the script against the server
5. Update panels in vscode an deephaven

On subsequent script runs, the session will be re-used and only steps 4 and 5 will run

## Downloading JS API

The extension dynamically downloads and loads the DH JS API from a DH Core server.

- `src/jsApi.loadDhFromServer()`
  At runtime, `dh-internal.js` and `dh-core.js` are downloaded from the running DH server (default http://localhost:10000). The files are saved to `out/tmp` as `ES6 (.mjs)` modules, and the import of `dh-internal.js` is replaced with `dh-internal.mjs` (see `loadDhFromServer()`)
- Hack dynamic import to prevent ts compiler from changing to require `const dynamicImport = new Function("specifier", "return import(specifier)");`

## TODO

- https://github.com/deephaven/web-client-ui/pull/1925 - allow panels to update in DH when commands are sent from extension
- Support server url configuration
- embed-widget to support Deephaven UI
- better panel layout support (this is limited by vscode apis)
