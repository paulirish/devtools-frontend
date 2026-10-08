export type LocalizedString = {
  i18nId: string,
  values: Record<string, string|number>,
  formattedDefault: string,
};
export declare const LocalizedEmptyString: LocalizedString;
