# AGENTS.md

Instructions for AI coding agents working with this codebase.

## Project Dependency Context

This workspace currently uses these Angular packages:

- `@angular/core` `21.0.9` in `opensrc/repos/github.com/angular/angular/packages/core`
- `@angular/cli` `21.0.6` in `opensrc/repos/github.com/angular/angular-cli`

When you need framework or CLI implementation details, prefer these fetched sources over type definitions alone.

<!-- opensrc:start -->

## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
npx opensrc <package>           # npm package (e.g., npx opensrc zod)
npx opensrc pypi:<package>      # Python package (e.g., npx opensrc pypi:requests)
npx opensrc crates:<package>    # Rust crate (e.g., npx opensrc crates:serde)
npx opensrc <owner>/<repo>      # GitHub repo (e.g., npx opensrc vercel/ai)
```

<!-- opensrc:end -->
