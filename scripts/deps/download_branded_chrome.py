#!/usr/bin/env python3
#
# Copyright 2025 The Chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.
"""Download Chrome branded release Build

This script downloads a specific Chrome release version for a specified platform
from the Google Cloud Storage release bucket.

It'll only work for Googlers.

ex:

    scripts/deps/download_branded_chrome.py --version_number "135.0.7048.0" --platform mac-arm --target=./third_party/branded_chrome
    scripts/deps/download_branded_chrome.py # version, platform and target are selected automatically
"""

import argparse
import os
import platform
import subprocess
import logging
import sys
import shutil
import tempfile
import zipfile
import tarfile
import re
import subprocess

# Constants (Borrowed from https://source.chromium.org/chromium/chromium/src/+/main:tools/bisect-builds.py)
RELEASE_BASE_URL = 'gs://chrome-unsigned/desktop-5c0tCh'

PATH_CONTEXT = {
    'linux64': {
        'binary_name': 'chrome',
        'listing_platform_dir': 'linux64/',
        'archive_name': 'chrome-linux64.zip',
        'archive_extract_dir': 'chrome-linux64',
        'rename_to': 'chrome-linux',
    },
    'mac64': {
        'binary_name': 'Google Chrome.app/Contents/MacOS/Google Chrome',
        'listing_platform_dir': 'mac64/',
        'archive_name': 'chrome-mac.zip',
        'archive_extract_dir': 'chrome-mac',
        'rename_to': 'chrome-mac',
    },
    'mac-arm': {
        'binary_name': 'Google Chrome.app/Contents/MacOS/Google Chrome',
        'listing_platform_dir': 'mac-arm64/',
        'archive_name': 'chrome-mac.zip',
        'archive_extract_dir': 'chrome-mac',
        'rename_to': 'chrome-mac',
    },
    'win64': {
        'binary_name': 'chrome.exe',
        'listing_platform_dir': 'win64-clang/',
        'archive_name': 'chrome-win64-clang.zip',
        'archive_extract_dir': 'chrome-win64-clang',
        'rename_to': 'chrome-win',
    },
}


def determinePlatform():
    os_name = platform.system().lower()

    if os_name == "linux":
        return "linux64"
    elif os_name == "darwin":
        if platform.machine().lower() == "arm64":
            return "mac-arm"
        else:
            return "mac64"
    elif os_name == "windows":
        return "win64"


DEPS_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.normpath(os.path.join(DEPS_DIR, '..', '..'))
DEPOT_TOOLS_DIR = os.path.join(BASE_DIR, 'third_party', 'depot_tools')

# You can specify your own path here.
GSUTILS_PATH = "gsutil"  # Assuming gsutil is in the PATH
if not os.path.exists(GSUTILS_PATH):
    GSUTILS_PATH = os.path.join(DEPOT_TOOLS_DIR, "gsutil.py")


def RunGsutilCommand(args, can_fail=False, ignore_fail=False):
    if not GSUTILS_PATH:
        raise BisectException('gsutils is not found in path.')
    logging.debug('Running gsutil command: ' +
                  str([sys.executable, GSUTILS_PATH] + args))
    gsutil = subprocess.Popen([sys.executable, GSUTILS_PATH] + args,
                              stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE,
                              env=None)
    stdout_b, stderr_b = gsutil.communicate()
    stdout = stdout_b.decode("utf-8")
    stderr = stderr_b.decode("utf-8")
    if gsutil.returncode:
        if (re.findall(r'(status|ServiceException:)[ |=]40[1|3]', stderr)
                or stderr.startswith(CREDENTIAL_ERROR_MESSAGE)):
            print(
                ('\nFollow these steps to configure your credentials and try'
                 ' running the bisect-builds.py again.:\n'
                 '  1. Run "python3 %s config" and follow its instructions.\n'
                 '  2. If you have a @google.com account, use that account.\n'
                 '  3. For the project-id, just enter 0.' % GSUTILS_PATH))
            print(
                'Warning: You might have an outdated .boto file. If this issue '
                'persists after running `gsutil.py config`, try removing your '
                '.boto, usually located in your home directory.')
            raise BisectException('gsutil credential error')
        elif can_fail:
            return stderr
        elif ignore_fail:
            return stdout
        else:
            raise Exception('Error running the gsutil command:\n%s\n%s' %
                            (args, stderr))
    return stdout


def GsutilList(url):
    """Lists contents of a GCS bucket using gsutil, handling wildcards."""
    return RunGsutilCommand(['ls', url], can_fail=True).splitlines()


def GsutilDownload(download_url, filename):
    """Downloads a file using gsutil."""
    command = ['cp', download_url, filename]
    RunGsutilCommand(command)


# Lifted from bisect-builds. A naive impl will result in executable permission problems.
def UnzipFilenameToDir(filename, directory):
    """Unzip |filename| to |directory|."""
    cwd = os.getcwd()
    if not os.path.isabs(filename):
        filename = os.path.join(cwd, filename)
    # Make base.
    if not os.path.isdir(directory):
        os.mkdir(directory)
    os.chdir(directory)

    # Support for tar archives.
    if tarfile.is_tarfile(filename):
        tf = tarfile.open(filename, 'r')
        tf.extractall(directory)
        os.chdir(cwd)
        return

    # The Python ZipFile does not support symbolic links, which makes it
    # unsuitable for Mac builds. so use ditto instead.
    if sys.platform.startswith('darwin'):
        unzip_cmd = ['ditto', '-x', '-k', filename, '.']
        proc = subprocess.Popen(unzip_cmd,
                                bufsize=0,
                                stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE)
        proc.communicate()
        os.chdir(cwd)
        return

    zf = zipfile.ZipFile(filename)
    # Extract files.
    for info in zf.infolist():
        name = info.filename
        if name.endswith('/'):  # dir
            if not os.path.isdir(name):
                os.makedirs(name)
        else:  # file
            directory = os.path.dirname(name)
            if directory and not os.path.isdir(directory):
                os.makedirs(directory)
            out = open(name, 'wb')
            out.write(zf.read(name))
            out.close()
        # Set permissions. Permission info in external_attr is shifted 16 bits.
        os.chmod(name, info.external_attr >> 16)
    os.chdir(cwd)


def build_chrome_version_string(major, minor, build, patch):
    """Builds a Chrome version string from its components."""
    return f"{major}.{minor}.{build}.{patch}"


def handleAccessDeniedOnWindows(func, path, exc):
    if not os.name == 'nt':
        raise exc
    if not os.access(path, os.W_OK):
        # Is the error an access error?
        logging.warning("Retrying due to access error...")
        os.chmod(path, stat.S_IWUSR)
        func(path)
    else:
        raise exc


def download_chrome_release(options):
    """Downloads a specific Chrome release build.

    Args:
        options:
            version_number: The Chrome version string (e.g., "85.0.4183.83").
            platform: The platform string (e.g., "win64", "linux64", "mac").
            target: Target directory to extract chrome to.

    Returns:
        The path to the downloaded (and extracted) Chrome binary.
    """

    if options.platform not in PATH_CONTEXT:
        raise ValueError(
            f"Unsupported platform: {options.platform}. Supported platforms: {', '.join(PATH_CONTEXT.keys())}"
        )

    path_context = PATH_CONTEXT[options.platform]
    archive_name = path_context['archive_name']
    listing_platform_dir = path_context['listing_platform_dir']

    # Check whether we already downloaded pre-built Chrome with this version number.
    VERSION_NUMBER_FILE = os.path.join(options.target, 'version_number')
    EXPECTED_BINARY = os.path.join(options.target, path_context['rename_to'],
                                   path_context['binary_name'])

    if os.path.exists(VERSION_NUMBER_FILE):
        with open(VERSION_NUMBER_FILE) as file:
            found_version_number = file.read().strip()
            if found_version_number == options.version_number:
                assert os.path.exists(EXPECTED_BINARY)
                logging.info(
                    'Found existing %s binary of %s. Skipping download' %
                    (options.platform, options.version_number))
                return

    # Remove previous download.
    if os.path.exists(options.target):
        shutil.rmtree(options.target,
                      ignore_errors=False,
                      onerror=handleAccessDeniedOnWindows)

    # Construct gsutil URL
    download_url = f"{RELEASE_BASE_URL}/{options.version_number}/{listing_platform_dir}{archive_name}"
    # Check file exists using gsutil ls.  If it doesn't, try again without -clang
    # in the path. This is for builds before M64.
    if not GsutilList(download_url):
        # Remove the -clang part.
        download_url = re.sub(r'-clang', '', download_url)
        if not GsutilList(download_url):
            raise Exception(
                f"Build not found at: {download_url.replace('gs://', 'https://storage.cloud.google.com/')}"
            )

    # Use tempfile.TemporaryDirectory() to handle both cases (passed output_dir or not).
    with tempfile.TemporaryDirectory() as temp_dir:
        if not os.path.exists(temp_dir):
            os.makedirs(temp_dir)

        archive_filename = os.path.join(temp_dir, archive_name)
        GsutilDownload(download_url, archive_filename)

        UnzipFilenameToDir(archive_filename, options.target)
        shutil.move(
            os.path.join(options.target, path_context['archive_extract_dir']),
            os.path.join(options.target, path_context['rename_to']))

        # Fix permissions. Doing this recursively is necessary for MacOS bundles.
        if os.path.isfile(EXPECTED_BINARY):
            os.chmod(EXPECTED_BINARY, 0o555)
            # On Linux, the crashpad_handler binary needs the +x bit, too.
            crashpad = os.path.join(os.path.dirname(EXPECTED_BINARY),
                                    'chrome_crashpad_handler')
            if os.path.isfile(crashpad):
                os.chmod(crashpad, 0o555)
        else:
            for root, dirs, files in os.walk(EXPECTED_BINARY):
                for f in files:
                    os.chmod(os.path.join(root, f), 0o555)
        with open(VERSION_NUMBER_FILE, 'w') as file:
            file.write(options.version_number)

        print(f"Branded Chrome binary downloaded to: {EXPECTED_BINARY}")


def get_deps_chrome_version():
    command_result = subprocess.run(
        ["gclient", "getdep", "--var=chrome"],
        capture_output=True,
        text=True,
        cwd=BASE_DIR,
    )
    return command_result.stdout.strip()


def parse_options(cli_args):
    parser = argparse.ArgumentParser(
        description='Download a specific Chrome release build.')
    parser.add_argument("--version_number",
                        default=get_deps_chrome_version(),
                        help="Chrome version string (e.g., 85.0.4183.83)")
    parser.add_argument(
        "--platform",
        help="Platform (e.g., win64, linux64, mac64, mac-arm)",
    )
    parser.add_argument('--target', help='target directory')
    parser.set_defaults(platform=determinePlatform(),
                        target=os.path.join(BASE_DIR, 'third_party',
                                            'branded_chrome'))
    return parser.parse_args(cli_args)


def main():
    args = parse_options(sys.argv[1:])
    download_chrome_release(args)


if __name__ == "__main__":
    main()
