// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview Rule to ban usage of assert.equal
 * @author Jack Franklin
 */
'use strict';

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

module.exports = {
  meta: {
    type: 'suggestion',
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
          let foundOptional = false;
          for (const property of typeAnnotation.members) {
            if (property.optional) {
              foundOptional = true;
            } else if (foundOptional) {
              // Optional property found before a required one
              context.report({
                node: property,
                message: 'Optional property \'{{name}}\' should be defined after required properties.',
                data: { name: property.key.name },
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

module.exports = {
  // ... meta data ...

  create: function(context) {
    return {
      TSTypeAliasDeclaration(node) {
        const typeAnnotation = node.typeAnnotation;
        if (typeAnnotation.type === 'TSTypeLiteral') {
          let hasSeenRequiredProperty = false;
          for (const property of typeAnnotation.members) {
            if (property.optional) {
              if (hasSeenRequiredProperty) {
                // Optional property found after a required one
                context.report({
                  node: property,
                  message: 'Optional property \'{{name}}\' should be defined after required properties.',
                  data: { name: property.key.name },
                  // ... (fix function, if implemented)
                });
              }
            } else {
              hasSeenRequiredProperty = true;
            }
          }
        }
      }
    };
  }
};
