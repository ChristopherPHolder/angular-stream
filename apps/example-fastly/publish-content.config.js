/** @type {import('@fastly/compute-js-static-publish').PublishContentConfig} */
const config = {
  rootDir: './dist/client',
  // The template the server renders into: stored, but never served as a file.
  hiddenItems: ['/index.html'],
  server: {
    // Hashed by Vite, so cached for a long time.
    staticItems: ['/assets/'],
    allowedEncodings: ['br', 'gzip'],
    // Every path without a file goes on to the renderer.
    spaFile: false,
    notFoundPageFile: false,
    autoExt: [],
    autoIndex: [],
  },
};

export default config;
