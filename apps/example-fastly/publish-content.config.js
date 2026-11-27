/** @type {import('@fastly/compute-js-static-publish').PublishContentConfig} */
const config = {
  rootDir: './dist/client',
  server: {
    // Hashed by Vite, so cached for a long time.
    staticItems: ['/assets/'],
    allowedEncodings: ['br', 'gzip'],
    // A path without a file gets no response here (`null`): the server renders it.
    spaFile: false,
    notFoundPageFile: false,
    autoExt: [],
    autoIndex: [],
  },
};

export default config;
