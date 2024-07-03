// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview Thing
 * @author Paul Irish
 */
'use strict';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce optional properties to be defined after required properties',
      category: 'Possible Errors',
    },
    fixable: 'code', // Indicates the rule can automatically fix issues
    schema: [], // No options for this rule
  },

  create: function(context) {
    return {
      TSTypeAliasDeclaration(node) {
        const typeAnnotation = node.typeAnnotation;
        if (typeAnnotation.type === 'TSTypeLiteral') {
          let foundOptionalWithinAnnotation = null;
          for (const property of typeAnnotation.members) {
            if (property.optional) {
              foundOptionalWithinAnnotation = property;
            } else if (foundOptionalWithinAnnotation && !property.optional) {
              // Required property found after an optional one
              context.report({
                node: foundOptionalWithinAnnotation,
                message: 'Optional property \'{{name}}\' should be defined after required properties.',
                data: { name: foundOptionalWithinAnnotation.key.name },
                fix(fixer) {
                  // TODO: Implement automatic fixing by rearranging properties
                }
              });
            }
          }
        }
      }
    };
  }
};
