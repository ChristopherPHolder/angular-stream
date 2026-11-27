import type { ModuleRef } from '@nestjs/core';

/**
 * The app's global prefix (`app.setGlobalPrefix('api')`) as a path, `/api`, or
 * `null` without one.
 *
 * Nest keeps it in the `ApplicationConfig`, which isn't a provider; the
 * container that holds it is reachable from a `ModuleRef`.
 */
export function globalPrefix(moduleRef: ModuleRef): string | null {
  const container = (
    moduleRef as unknown as {
      container?: { applicationConfig?: { getGlobalPrefix?: () => string } };
    }
  ).container;
  const prefix = container?.applicationConfig?.getGlobalPrefix?.() ?? '';
  const trimmed = prefix.replace(/^\/+|\/+$/g, '');
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
