export const i18n = {
  registerUIStrings: (_path, stringStructure) => stringStructure,
  getLocalizedString: (_str, i18nId, values) => ({i18nId, values}),
  getLazilyComputedLocalizedString: (_str, i18nId, values) => ({i18nId, values}),
  lockedLazyString: str => str,
  lockedString: str => str,
};

export const ByteUtilities = {
  bytesToString: bytes => ({__i18nBytes: bytes}),
};

export const TimeUtilities = {
  millisToString: millis => ({__i18nMillis: millis}),
};
