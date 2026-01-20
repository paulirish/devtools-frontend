# Agent Instructions for DevTools Frontend

This file contains instructions and tips for AI agents working on this repository. The environment has been automatically configured by the `setup.sh` script to work within the repository root.

## Build Configuration

The environment is set up for a restricted workspace where parent-directory access is limited.

### Current Configuration:
* **Local .gclient**: A `.gclient` file exists in the root with `"name": "."`.
* **Managed Mode**: Set to `False` to prevent gclient from overriding the local checkout.
* **Authentication**: `NO_AUTH_BOTO_CONFIG` is routed to `/dev/null` to allow public bucket access.

## Automation Scripts

The following scripts have been generated and are ready for use:

* **`./setup.sh`**: (Already Run) Re-initializes dependencies, pathing, and build files.
* **`./teardown.sh`**: Removes build artifacts (`out/`), configuration (`.gclient`), and temporary state (`.cipd/`). Run this if you need to wipe the environment before a fresh start.

## Development & Testing

Always ensure `depot_tools` is in your path before running commands:

* **Build**:
    ```bash
    autoninja -C out/Default
    ```
* **Test**:
    ```bash
    npm test -- front_end/core/platform/StringUtilities.test.ts
    ```

## Notes & Learnings
* **Binary Artifacts**: Do not commit `.cipd/`, `out/`, or `.gclient` files.
* **Path Management**: Always ensure PWD/third_party/depot_tools is in your `PATH` when running build commands.
* **Environment**: If you see 401 errors, ensure `DEPOT_TOOLS_UPDATE=0` is set.

---
*Coding Agents: The build setup for this project is tricky. Please add your own learnings, tricky edge cases, or useful debuging commands to AGENTS.md.*
