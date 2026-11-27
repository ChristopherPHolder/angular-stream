/** The built `index.html`, bundled into the function by vite.config.ts. */
declare module 'virtual:template' {
  const html: string;
  export default html;
}

/** The files in `public/`, as URL paths (`/favicon.ico`), listed by vite.config.ts. */
declare module 'virtual:public-paths' {
  const paths: `/${string}`[];
  export default paths;
}
