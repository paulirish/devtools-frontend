// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * This is written in JS to be able to use it in Presubmit.py without a build.
 */

/**
 * @typedef {('Failure'|'Pass'|'Skip')} ExpectationResult
 */

/**
 * @typedef {Object} Expectation
 * @property {string} line
 * @property {boolean=} isCommentOrEmpty
 * @property {string[]=} bugs
 * @property {string[]=} platforms
 * @property {string=} testName
 * @property {ExpectationResult[]=} results
 */

// bug: required, must start with crbug.com/ followed by numbers
const bugPattern = '(crbug\\.com\\/\\d+)\\s+';
// platforms: optional, space-separated platform names in brackets e.g. [ mac linux win32 ]
const platformsPattern = '(?:\\[([^\\]]*)\\]\\s+)?';
// testName: required, a string
const testNamePattern = '([^\\s\\[]+)\\s+';
// results: required, space-separated results in brackets e.g. [ Failure ]
const resultsPattern = '\\[([^\\]]+)\\]';
const EXPECTATION_REGEX = new RegExp(`^${bugPattern}${platformsPattern}${testNamePattern}${resultsPattern}$`);

/**
 * @param {string} content
 * @returns {Expectation[]}
 */
export function parseExpectations(content) {
  const lines = content.split('\n');
  return lines.map(line => parseExpectationLine(line));
}

/**
 * @param {string} line
 * @returns {Expectation}
 */
export function parseExpectationLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return {line, isCommentOrEmpty: true};
  }

  const match = trimmed.match(EXPECTATION_REGEX);
  if (match) {
    const bugStr = match[1] ? match[1].trim() : '';
    const bugs = bugStr ? [bugStr] : [];
    if (bugs.length === 0) {
      throw new Error(`Expectation must have at least one bug: ${line}`);
    }

    const platformsStr = match[2] ? match[2].trim() : '';
    const platforms = platformsStr ? platformsStr.split(/\s+/) : [];
    const validPlatforms = new Set(['mac', 'linux', 'win32']);
    for (const p of platforms) {
      if (!validPlatforms.has(p)) {
        throw new Error(`Invalid platform '${p}' in expectation: ${line}`);
      }
    }

    const resultsStr = match[4] ? match[4].trim() : '';
    const results = /** @type {ExpectationResult[]} */ (resultsStr ? resultsStr.split(/\s+/) : []);
    const validResults = new Set(['Failure', 'Pass', 'Skip']);
    for (const r of results) {
      if (!validResults.has(r)) {
        throw new Error(`Invalid result '${r}' in expectation: ${line}`);
      }
    }

    return {
      line,
      isCommentOrEmpty: false,
      bugs,
      platforms,
      testName: match[3],
      results,
    };
  }

  throw new Error(`Could not parse expectation line: ${line}`);
}

/**
 * @param {Expectation[]} expectations
 * @returns {string}
 */
export function serializeExpectations(expectations) {
  return expectations.map(serializeExpectationLine).join('\n');
}

/**
 * @param {Expectation} expectation
 * @returns {string}
 */
export function serializeExpectationLine(expectation) {
  if (expectation.isCommentOrEmpty) {
    return expectation.line;
  }

  const parts = [];
  if (expectation.bugs && expectation.bugs.length > 0) {
    parts.push(expectation.bugs.join(' '));
  }
  if (expectation.platforms && expectation.platforms.length > 0) {
    const sortedPlatforms = [...expectation.platforms].sort();
    parts.push(`[ ${sortedPlatforms.join(' ')} ]`);
  }
  if (expectation.testName) {
    parts.push(expectation.testName);
  }
  if (expectation.results && expectation.results.length > 0) {
    const sortedResults = [...expectation.results].sort();
    parts.push(`[ ${sortedResults.join(' ')} ]`);
  }

  return parts.join(' ');
}
