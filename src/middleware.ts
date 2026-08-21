import { defineMiddleware } from 'astro:middleware';
import { localeFromPath, localizeHref } from '@/lib/locale';

export const onRequest = defineMiddleware((context, next) => {
  if (!context.locals.lang) {
    const locale = localeFromPath(context.url.pathname);
    context.locals.locale = locale;
    context.locals.lang = locale === 'zh' ? 'zh-CN' : 'en';
    context.locals.localePath = (href: string) => localizeHref(href, locale);
  }
  return next();
});
