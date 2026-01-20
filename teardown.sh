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


