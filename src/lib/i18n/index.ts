import { env } from '$env/dynamic/public';
import { en } from './en.ts';
import { pl } from './pl.ts';

const locales = { pl, en };

/** Interface language from PUBLIC_LOCALE. Polish when unset or unknown. */
export const lang: keyof typeof locales = env.PUBLIC_LOCALE === 'en' ? 'en' : 'pl';
/** Every text the user sees, in the configured language. */
export const ui = locales[lang];
/** BCP 47 tag for dates and times. */
export const dateLocale = lang === 'en' ? 'en-GB' : 'pl-PL';
