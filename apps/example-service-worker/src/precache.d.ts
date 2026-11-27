/** Written by the `precache` plugin in vite.config.ts. */
declare module 'virtual:precache' {
  /** Every file the client build wrote, as absolute paths: `/index.html`, `/assets/…`. */
  export const files: readonly string[];
  /** Changes whenever `files` does. */
  export const version: string;
}
