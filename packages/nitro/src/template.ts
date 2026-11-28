/**
 * Where the template lives: the server-assets mount `streamingTemplate()`
 * registers, and the key of the built `index.html` in it. Shared by the
 * handler, which reads it, and the Vite plugin, which writes it.
 */
export const TEMPLATE_ASSETS = 'angular-ssr-stream';
export const TEMPLATE_KEY = 'index.html';
