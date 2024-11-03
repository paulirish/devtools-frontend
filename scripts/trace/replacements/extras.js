

const URLForEntry = {
  getNonResolved: (_, entry) => entry.callFrame?.url ?? entry.args?.data?.stackTrace ?? entry.args?.data?.url ?? null
};
export {URLForEntry};
export * as ThirdParties from './ThirdParties.js';
