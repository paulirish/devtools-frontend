# Agent Instructions for DevTools Frontend

This file contains instructions and tips for AI agents working on the Chrome DevTools Frontend repository. This project has a custom build system based on Chromium's tools (`depot_tools`, `gn`, `ninja`), which can be tricky to set up in restricted environments.

## Build Setup in Restricted Environments (Jules)

In environments where you cannot write to the parent directory, the standard Chromium checkout instructions (which assume a specific directory structure managed by `gclient` from a parent folder) will not work directly.

### The Workaround

To make the build work within the repository root:

1.  **Local `.gclient` Configuration**: We place a `.gclient` file directly in the repository root with the following configuration:
    ```python
    solutions = [
      {
        "name": ".",
        "url": "https://chromium.googlesource.com/devtools/devtools-frontend.git",
        "deps_file": "DEPS",
        "managed": False,
        "custom_deps": {},
        "custom_vars": {
          "checkout_ai_evals": False,
        }
      },
    ]
    ```
    *   `"name": "."`: Tells `gclient` that the current directory is the solution root.
    *   `"managed": False`: Prevents `gclient` from trying to manage the repository checkout itself.
    *   `"checkout_ai_evals": False`: Disables optional internal dependencies that may require authentication you don't have.

2.  **Environment Variables**:
    *   `DEPOT_TOOLS_UPDATE=0`: Prevents `depot_tools` from trying to self-update (which might fail or be slow).
    *   `NO_AUTH_BOTO_CONFIG=/dev/null`: Prevents `gsutil` (used by `gclient sync`) from failing on public buckets if it tries to look for credentials.

### Automation Scripts

Helper scripts have been added to the repository to automate this setup:

*   **`./setup.sh`**:
    *   Clones `depot_tools` into `third_party/depot_tools` (if missing).
    *   Generates the local `.gclient` file.
    *   Sets up environment variables.
    *   Runs `gclient sync` to fetch dependencies.
    *   Runs `gn gen out/Default` to generate build files.
    *   **Usage**: Run `./setup.sh` at the start of your task if the environment is not set up.

*   **`./teardown.sh`**:
    *   Cleans up generated artifacts (`out/`, `.cipd/`) and configuration files (`.gclient`, etc.).
    *   **Usage**: Run `./teardown.sh` before submitting if you need to clean up the workspace, though typically you only submit source changes.

## Development & Testing

*   **Build**: After setup, you can build targets using `autoninja`:
    ```bash
    export PATH="$PWD/third_party/depot_tools:$PATH"
    autoninja -C out/Default
    ```
*   **Test**: Run tests using `npm test`:
    ```bash
    export PATH="$PWD/third_party/depot_tools:$PATH"
    npm test -- front_end/core/platform/StringUtilities.test.ts
    ```

## Notes & Learnings

*   **Binary Artifacts**: The build process generates many binary artifacts and local state files (e.g., in `.cipd/`, `.gclient_entries`). **Do not commit these files.** The `teardown.sh` script helps remove them.
*   **Path Management**: Always ensure `$PWD/third_party/depot_tools` is in your `PATH` when running build commands.
*   **Authentication**: If you encounter 401 errors during `gclient sync` related to Google Storage, ensure `NO_AUTH_BOTO_CONFIG=/dev/null` is set.

---
*Future Agents: Please add your own learnings, tricky edge cases, or useful commands to this section.*

