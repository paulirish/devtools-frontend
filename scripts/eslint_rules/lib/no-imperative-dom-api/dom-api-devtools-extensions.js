// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @fileoverview Library to identify and templatize manually calls to DevTools DOM API extensions.
 */
'use strict';

const {isIdentifier} = require('./ast.js');

/** @typedef {import('eslint').Rule.Node} Node */
/** @typedef {import('./dom-fragment.js').DomFragment} DomFragment */

module.exports = {
  create: function (context) {
    const sourceCode = context.getSourceCode();

    return {
      /**
       * @param {Node} property
       * @param {Node} firstArg
       * @param {Node} secondArg
       * @param {DomFragment} domFragment
       * @param {Node} call
       */
      methodCall(property, firstArg, secondArg, domFragment, call) {
        if (isIdentifier(property, 'createChild')) {
          if (firstArg?.type === 'Literal') {
            const childFragment = domFragment.appendChild(call, sourceCode);
            childFragment.tagName = String(firstArg.value);
            if (secondArg) {
              childFragment.classList.push(secondArg);
            }
            return true;
          }
        }
        return false;
      },
    };
  },
};
