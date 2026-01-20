#!/bin/bash
set -e

echo "Setting up DevTools frontend build environment..."

# Ensure depot_tools exists
if [ ! -d "third_party/depot_tools" ]; then
    echo "Cloning depot_tools..."
    git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git third_party/depot_tools
else
    echo "depot_tools already present."
fi

# Ensure .gclient exists
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

# Add depot_tools to PATH
export PATH="$PWD/third_party/depot_tools:$PATH"

# Set environment variables for gclient
export DEPOT_TOOLS_UPDATE=0
export NO_AUTH_BOTO_CONFIG=/dev/null

# Run gclient sync
echo "Running gclient sync..."
gclient sync

# Run gn gen
echo "Generating build files..."
gn gen out/Default

echo "Setup complete. You can now build using:"
echo "export PATH=\"\$PWD/third_party/depot_tools:\$PATH\""
echo "autoninja -C out/Default"


