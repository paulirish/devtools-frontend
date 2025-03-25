/**
 * @fileoverview Ensures arithmetic operations involving tagged number types maintain type consistency or are explicitly cast.
 * @author Your Name/Google
 */
'use strict';

const {ESLintUtils, TSESTree} = require('@typescript-eslint/utils');
const ts = require('typescript');  // Still need the TS library for type checking API

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const createRule = ESLintUtils.RuleCreator(
    name => `https://your-repo.com/rules/${name}`  // Replace with your documentation URL
);

// --- Constants ---
const DEFAULT_TAG_PROPERTY = '_tag';
const ARITHMETIC_OPERATORS = ['+', '-', '*', '/'];

// --- Type Guards and Helpers ---

// NOTE: In JS, we rely more on duck-typing and checking property existence.
// The core logic uses the TypeScript TypeChecker API, which works the same way.

function getParserServices(context) {
  const parserServices = ESLintUtils.getParserServices(context);
  if (!parserServices?.program) {
    throw new Error(
        'Cannot find TypeScript program. Make sure you have setup eslint-plugin-local correctly with type information.',
    );
  }
  return parserServices;
}

/**
 * Checks if a TypeScript type is one of our tagged number types.
 * Returns the tag string (e.g., 'MicroSeconds') if it is, otherwise null.
 * @param {ts.Type | null | undefined} type The TypeScript type object.
 * @param {ts.TypeChecker} typeChecker The TypeScript type checker instance.
 * @param {string} tagPropertyName The name of the tag property (e.g., '_tag').
 * @returns {string | null} The tag name or null.
 */
function getTaggedTypeName(type, typeChecker, tagPropertyName) {
  if (!type) {
    return null;
  }

  // Resolve aliases
  const resolvedType = typeChecker.getApparentType(type);

  // Must be an intersection type
  if (!resolvedType.isIntersection()) {
    return null;
  }

  // Must contain 'number'
  const hasNumber = resolvedType.types.some(t => (t.flags & ts.TypeFlags.Number) !== 0);
  if (!hasNumber) {
    return null;
  }

  // Find the tag property
  const tagProperty = resolvedType.getProperty(tagPropertyName);
  // Ensure property exists and has a declaration where we can find its type
  if (!tagProperty?.valueDeclaration || !ts.isPropertySignature(tagProperty.valueDeclaration) ||
      !tagProperty.valueDeclaration.type) {
    return null;
  }

  const tagType = typeChecker.getTypeAtLocation(tagProperty.valueDeclaration.type);

  // Tag type must be a string literal
  if (!tagType.isStringLiteral()) {
    return null;
  }

  return tagType.value;  // The actual tag name like 'MicroSeconds'
}

/**
 * Checks if an expression is explicitly cast `as TaggedType`.
 * @param {import('@typescript-eslint/types').TSESTree.Expression} node The AST expression node.
 * @param {string} expectedTag The expected tag string (e.g., 'MicroSeconds').
 * @param {ts.TypeChecker} typeChecker Type checker instance.
 * @param {string} tagPropertyName The tag property name.
 * @returns {boolean} True if explicitly cast to the expected tag.
 */
function isExplicitlyCastToTag(node, expectedTag, typeChecker, tagPropertyName) {
  return node.type === TSESTree.AST_NODE_TYPES.TSAsExpression &&  // Or 'TSAsExpression' string
      getTaggedTypeName(typeChecker.getTypeAtLocation(node.typeAnnotation), typeChecker, tagPropertyName) ===
      expectedTag;
}

/**
 * Checks if an expression is a call to the TaggedType constructor function.
 * e.g., Micro(123)
 * @param {import('@typescript-eslint/types').TSESTree.Expression} node The AST expression node.
 * @param {string} expectedTag The expected tag string (e.g., 'MicroSeconds').
 * @param {ts.TypeChecker} typeChecker Type checker instance.
 * @param {ReturnType<typeof getParserServices>} parserServices Parser services.
 * @param {string} tagPropertyName The tag property name.
 * @returns {boolean} True if it's a constructor call for the expected tag.
 */
function isTaggedTypeConstructorCall(node, expectedTag, typeChecker, parserServices, tagPropertyName) {
  if (node.type !== TSESTree.AST_NODE_TYPES.CallExpression) {  // Or 'CallExpression' string
    return false;
  }
  const calleeNode = parserServices.esTreeNodeToTSNodeMap.get(node.callee);
  if (!calleeNode)
    return false;
  const calleeType = typeChecker.getTypeAtLocation(calleeNode);
  // Use optional chaining for safety
  const returnType = calleeType.getCallSignatures()?.[0]?.getReturnType();
  return getTaggedTypeName(returnType, typeChecker, tagPropertyName) === expectedTag;
}


module.exports = createRule({
  name : 'consistent-tagged-arithmetic',
  meta : {
    type : 'problem',
    docs : {
      description : 'Ensures arithmetic operations involving tagged number types maintain type consistency or are explicitly cast.',
      recommended : 'recommended',  // Or 'strict' or false
      requiresTypeChecking : true,
    },
    messages : {
      missingCast : 'Arithmetic operation results in a `number`. Assigning to type with tag "{{expectedTag}}" requires an explicit cast (e.g., `as {{expectedTypeString}}`) or use of the constructor `{{expectedConstructor}}(...)`.',
      mixedTags : 'Arithmetic operation involves incompatible tagged types: "{{leftTag}}" and "{{rightTag}}". Convert types explicitly.',
      // Add more messages as needed
    },
    schema : [{
             type : 'object',
             properties : {
               tagPropertyName : {
                 type : 'string',
                 description : 'The property name used for tagging (e.g., "_tag").',
                 default : DEFAULT_TAG_PROPERTY,
               },
             },
             additionalProperties : false,
           }],
  },
  defaultOptions : [{tagPropertyName : DEFAULT_TAG_PROPERTY}],

                 create(context, [options]) {
                   const {tagPropertyName} = options;
                   const parserServices = getParserServices(context);
                   const typeChecker = parserServices.program.getTypeChecker();

                   /**
     * Checks an expression used in a context expecting a specific tagged type.
     * @param {import('@typescript-eslint/types').TSESTree.Expression | null | undefined} valueNode The expression node.
     * @param {ts.Type} expectedType The type expected by the context.
     * @param {import('@typescript-eslint/types').TSESTree.Node} contextNode The node representing the context for reporting.
     */
                   function checkAssignmentContext(valueNode, expectedType, contextNode) {
                     if (!valueNode)
                       return;

                     const expectedTag = getTaggedTypeName(expectedType, typeChecker, tagPropertyName);
                     if (!expectedTag)
                       return;  // Context doesn't expect a tagged type we care about

                     const tsValueNode = parserServices.esTreeNodeToTSNodeMap.get(valueNode);
                     if (!tsValueNode)
                       return;  // Should generally exist if valueNode exists

                     const actualType = typeChecker.getTypeAtLocation(tsValueNode);
                     const actualTag = getTaggedTypeName(actualType, typeChecker, tagPropertyName);

                     // If the actual value already has the correct tag, it's fine.
                     if (actualTag === expectedTag) {
                       return;
                     }

                     // Helper for reporting
                     const reportError = (nodeToReport, messageId, data) => {
                       // Try to find the expected type's string representation for a better message
                       // Heuristic to get 'Micro' from 'Micro & ...' or similar
                       let expectedTypeString = typeChecker.typeToString(expectedType);
                       const intersectionIndex = expectedTypeString.indexOf('&{');
                       if (intersectionIndex !== -1) {
                         expectedTypeString = expectedTypeString.substring(0, intersectionIndex).trim();
                       }
                       // Assume constructor name matches type alias name
                       const expectedConstructor = expectedTypeString;

                       context.report({
                         node: nodeToReport,
                         messageId,
                         data: {
                           ...data,
                           expectedTag: expectedTag,
                           expectedTypeString: expectedTypeString,
                           expectedConstructor: expectedConstructor,
                         },
                       });
                     };

                     // Check if the valueNode is the result of an arithmetic expression
                     if (valueNode.type === TSESTree.AST_NODE_TYPES.BinaryExpression &&  // Or 'BinaryExpression'
                         ARITHMETIC_OPERATORS.includes(valueNode.operator)) {
                       const tsLeftNode = parserServices.esTreeNodeToTSNodeMap.get(valueNode.left);
                       const tsRightNode = parserServices.esTreeNodeToTSNodeMap.get(valueNode.right);
                       if (!tsLeftNode || !tsRightNode)
                         return;

                       const leftType = typeChecker.getTypeAtLocation(tsLeftNode);
                       const rightType = typeChecker.getTypeAtLocation(tsRightNode);
                       const leftTag = getTaggedTypeName(leftType, typeChecker, tagPropertyName);
                       const rightTag = getTaggedTypeName(rightType, typeChecker, tagPropertyName);

                       // Check for mixing different tagged types directly
                       if (leftTag && rightTag && leftTag !== rightTag) {
                         reportError(valueNode, 'mixedTags', {leftTag, rightTag});
                         return;  // Don't double-report
                       }

                       // If either operand was tagged, the result is implicitly 'number' unless cast/constructed.
                       const isCast = isExplicitlyCastToTag(valueNode, expectedTag, typeChecker, tagPropertyName);
                       const isConstructed = isTaggedTypeConstructorCall(
                           valueNode, expectedTag, typeChecker, parserServices, tagPropertyName);

                       if (!isCast && !isConstructed) {
                         reportError(valueNode, 'missingCast', {});
                       }
                     }
                     // Check if 'valueNode' itself is just a 'number' being assigned/returned etc.
                     else if ((typeChecker.getTypeFlags(actualType) & ts.TypeFlags.NumberLike) && !actualTag) {
                       // It's a number (or number literal) being used where tagged type expected
                       const isCast = isExplicitlyCastToTag(valueNode, expectedTag, typeChecker, tagPropertyName);
                       const isConstructed = isTaggedTypeConstructorCall(
                           valueNode, expectedTag, typeChecker, parserServices, tagPropertyName);

                       if (!isCast && !isConstructed) {
                         reportError(valueNode, 'missingCast', {});
                       }
                     }
                     // Potentially add checks for other expression types if needed
                   }

                   return {
                     // Case 1: Variable Declaration ( const x: Micro = ... )
                     VariableDeclarator(node) {
                       if (!node.id || node.id.type !== TSESTree.AST_NODE_TYPES.Identifier ||
                           !node.id.typeAnnotation) {  // Or 'Identifier'
                         return;
                       }
                       // Get type from the variable's type annotation
                       const tsTypeAnnNode =
                           parserServices.esTreeNodeToTSNodeMap.get(node.id.typeAnnotation.typeAnnotation);
                       if (!tsTypeAnnNode)
                         return;
                       const varType = typeChecker.getTypeAtLocation(tsTypeAnnNode);
                       checkAssignmentContext(node.init, varType, node);
                     },

                     // Case 2: Assignment Expression ( x = ...; where x is Micro)
                     AssignmentExpression(node) {
                       if (node.left.type !== TSESTree.AST_NODE_TYPES.Identifier) {  // Or 'Identifier'
                         // Could extend to MemberExpression if needed (obj.x = ...)
                         return;
                       }
                       const tsVarNode = parserServices.esTreeNodeToTSNodeMap.get(node.left);
                       if (!tsVarNode)
                         return;
                       const varType =
                           typeChecker.getTypeAtLocation(tsVarNode);  // Type of the variable being assigned to
                       checkAssignmentContext(node.right, varType, node);
                     },

                     // Case 3: Return Statement ( return ...; in a function returning Micro)
                     ReturnStatement(node) {
                       const func = ESLintUtils.getFunctionHead(node);
                       // Check if the function has a return type annotation
                       if (!func || !func.returnType) {
                         return;
                       }

                       // Get the signature's return type, not just the annotation node's type
                       const tsFuncNode = parserServices.esTreeNodeToTSNodeMap.get(func);
                       // Need SignatureDeclaration check for getSignatureFromDeclaration
                       if (!tsFuncNode || !ts.isFunctionLike(tsFuncNode))
                         return;
                       const signature = typeChecker.getSignatureFromDeclaration(tsFuncNode);
                       if (!signature)
                         return;

                       const returnType = signature.getReturnType();
                       checkAssignmentContext(node.argument, returnType, node);
                     },

                     // Case 4: Function Call Argument ( someFunc(..., arg, ...); where param expects Micro)
                     CallExpression(node) {
                       const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
                       if (!tsNode)
                         return;
                       const signature = typeChecker.getResolvedSignature(tsNode);
                       if (!signature) {
                         return;
                       }

                       const params = signature.getParameters();
                       const args = node.arguments;

                       for (let i = 0; i < Math.min(params.length, args.length); i++) {
                         const param = params[i];
                         const arg = args[i];

                         // Skip spread elements for now, ensure arg exists
                         if (!arg || arg.type === TSESTree.AST_NODE_TYPES.SpreadElement)
                           continue;  // Or 'SpreadElement'

                         // Get the type of the parameter *at the call site*
                         const paramType = typeChecker.getTypeOfSymbolAtLocation(param, tsNode);
                         checkAssignmentContext(arg, paramType, arg);
                       }
                     },

                     // Optional: Direct check on BinaryExpression for mixed tags
                     // Provides redundancy and catches cases outside immediate assignment contexts.
                     BinaryExpression(node) {
                       if (!ARITHMETIC_OPERATORS.includes(node.operator))
                         return;

                       const tsLeftNode = parserServices.esTreeNodeToTSNodeMap.get(node.left);
                       const tsRightNode = parserServices.esTreeNodeToTSNodeMap.get(node.right);
                       if (!tsLeftNode || !tsRightNode)
                         return;

                       const leftType = typeChecker.getTypeAtLocation(tsLeftNode);
                       const rightType = typeChecker.getTypeAtLocation(tsRightNode);
                       const leftTag = getTaggedTypeName(leftType, typeChecker, tagPropertyName);
                       const rightTag = getTaggedTypeName(rightType, typeChecker, tagPropertyName);

                       // Check for mixing different tagged types directly
                       if (leftTag && rightTag && leftTag !== rightTag) {
                         // Avoid reporting if the parent is an assignment/return context checked elsewhere
                         const parentType = node.parent?.type;
                         if (
                             parentType !== TSESTree.AST_NODE_TYPES.VariableDeclarator &&  // Or string literals
                             parentType !== TSESTree.AST_NODE_TYPES.AssignmentExpression &&
                             parentType !== TSESTree.AST_NODE_TYPES.ReturnStatement &&
                             parentType !== TSESTree.AST_NODE_TYPES.CallExpression  // Args handled in CallExpr visitor
                         ) {
                           context.report({
                             node: node,
                             messageId: 'mixedTags',
                             data: {leftTag, rightTag},
                           });
                         }
                       }
                     }
                   };
                 },
});
