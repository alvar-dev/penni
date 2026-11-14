/**
 * The app's language. The server has the same setting (APP_LANG in its env,
 * default "en"): keep the two the same, or answers and labels mix languages.
 */
export const LANG = 'en' as 'fi' | 'en';
export const EN = LANG === 'en';

/** The text for the app's language. */
export const tr = <T,>(fi: T, en: T): T => (EN ? en : fi);
