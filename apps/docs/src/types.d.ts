/** The search index `markdown.ts` builds: every page's text, section by section. */
declare module 'virtual:docs-search' {
  const entries: {
    /** The page: `docs/<dir>/<page>`. */
    path: string;
    /** The section's heading id, or `''` for what comes before the first heading. */
    id: string;
    heading: string;
    text: string;
  }[];
  export default entries;
}

/** A content page, rendered to HTML at build time by `markdown.ts`. */
declare module '*.md' {
  const page: {
    html: string;
    toc: { id: string; text: string; level: 2 | 3 }[];
  };
  export default page;
}
