#!/bin/bash
set -e

echo "Setting up DevTools frontend build environment..."

# 1. Ensure depot_tools exists
if [ ! -d "third_party/depot_tools" ]; then
    echo "Cloning depot_tools..."
    git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git third_party/depot_tools
else
    echo "depot_tools already present."
fi

# 2. Create the AGENTS.md documentation
echo "Generating AGENTS.md..."
cat <<EOF > AGENTS.md
# Agent Instructions for DevTools Frontend

This file contains instructions and tips for AI agents working on this repository. The environment has been automatically configured by the \`setup.sh\` script to work within the repository root.

## Build Configuration

The environment is set up for a restricted workspace where parent-directory access is limited.

### Current Configuration:
* **Local .gclient**: A \`.gclient\` file exists in the root with \`"name": "."\`.
* **Managed Mode**: Set to \`False\` to prevent gclient from overriding the local checkout.
* **Authentication**: \`NO_AUTH_BOTO_CONFIG\` is routed to \`/dev/null\` to allow public bucket access.

## Automation Scripts

The following scripts have been generated and are ready for use:

* **\`./setup.sh\`**: (Already Run) Re-initializes dependencies, pathing, and build files.
* **\`./teardown.sh\`**: Removes build artifacts (\`out/\`), configuration (\`.gclient\`), and temporary state (\`.cipd/\`). Run this if you need to wipe the environment before a fresh start.

## Development & Testing

Always ensure \`depot_tools\` is in your path before running commands:

* **Build**:
    \`\`\`bash
    autoninja -C out/Default
    \`\`\`
* **Test**:
    \`\`\`bash
    npm test -- front_end/core/platform/StringUtilities.test.ts
    \`\`\`

## Notes & Learnings
* **Binary Artifacts**: Do not commit \`.cipd/\`, \`out/\`, or \`.gclient\` files.
* **Path Management**: Always ensure PWD/third_party/depot_tools is in your \`PATH\` when running build commands.
* **Environment**: If you see 401 errors, ensure \`DEPOT_TOOLS_UPDATE=0\` is set.

---
*Coding Agents: The build setup for this project is tricky. Please add your own learnings, tricky edge cases, or useful debuging commands to AGENTS.md.*
EOF

# 3. Create the teardown.sh script
echo "Generating teardown.sh..."
cat <<'EOF' > teardown.sh
#!/bin/bash
set -e

echo "Cleaning up DevTools frontend build environment..."

# Remove artifacts
echo "Removing .cipd directory..."
rm -rf .cipd

echo "Removing gclient configuration files..."
rm -f .gclient .gclient_entries .gclient_previous_custom_vars .gclient_previous_sync_commits .gcs_entries

echo "Removing out directory..."
rm -rf out

echo "Cleanup complete."
EOF

chmod +x teardown.sh


# Augment .gitignore
cat <<'EOF' >> .gitignore
# for jules-style temporary files
.gclient
.gclient_entries
.gclient_previous_custom_vars
.gclient_previous_sync_commits
.gcs_entries
.siso_failed_targets
.cipd
EOF

# 4. Ensure .gclient exists
if [ ! -f .gclient ]; then
    echo "Creating .gclient..."
    cat <<EOF > .gclient
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
EOF
fi

# 5. Add depot_tools to PATH
export PATH="$PWD/third_party/depot_tools:$PATH"

# 6. Set environment variables for gclient
export DEPOT_TOOLS_UPDATE=0
export NO_AUTH_BOTO_CONFIG=/dev/null


echo "Running ensure_bootstrap…"
ensure_bootstrap

# 7. Run gclient sync
echo "Running gclient sync..."
gclient sync

# 8. Run gn gen
echo "Generating build files..."
gn gen out/Default

echo "Building"
autoninja -C out/Default

echo "-------------------------------------------------------"
echo "Setup complete."
echo "1. AGENTS.md has been created with usage instructions."
echo "2. teardown.sh has been generated for workspace cleanup."
echo "3. Build files are ready in out/Default."
echo ""
echo "You can now build using:"
echo "autoninja -C out/Default"
echo ""
echo "View other npm scripts in package.json for testing and linting. And see docs/get_the_code.md for more details."
