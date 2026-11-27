import type { ApplicationConfig } from '@nestjs/core';

/**
 * The app's global prefix (`app.setGlobalPrefix('api')`) as a path, `/api`, or
 * `null` without one.
 */
export function globalPrefix(config: ApplicationConfig): string | null {
  const trimmed = config.getGlobalPrefix().replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? null : `/${trimmed}`;
}

/**
 * Whether a request target is the prefix or below it, by whole path segments:
 * `/api` and `/api/x` are, `/apiary` isn't. Case-insensitive, as Express
 * matches routes.
 */
export function isUnderPrefix(target: string, prefix: string): boolean {
  const path = (target.split(/[?#]/)[0] ?? '').replace(/^[/\\]+/, '/').toLowerCase();
  const lower = prefix.toLowerCase();
  return path === lower || path.startsWith(`${lower}/`);
}
