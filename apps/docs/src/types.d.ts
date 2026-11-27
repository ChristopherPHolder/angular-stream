/** A content page, rendered to HTML at build time by `markdown.ts`. */
declare module '*.md' {
  const page: {
    html: string;
    toc: { id: string; text: string; level: 2 | 3 }[];
  };
  export default page;
}
