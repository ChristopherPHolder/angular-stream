# RxIf Removal Checklist

Scan date: 2026-03-24

Migration guide: [RxAngular Template Migration Guide](./rx-angular-template-migration.md)

Use this document to track safe `RxIf` removal work.

If you do not know how to migrate a site safely, skip it and leave the checkbox unchecked.

## Summary

- Symbol: `RxIf`
- Source: `@rx-angular/template/if`
- Import statements: `4`
- Template usage sites: `4`
- Application files affected: `4`

## Completion Rule

Mark a line `[x]` only after the template usage has been migrated safely, the component metadata no longer imports `RxIf`, and the TypeScript import is removed if it is no longer needed in that file.

## Template Migration Checklist

- [ ] `src/app/pages/account-feature/list-create-page/list-create-page.component.ts:11` - `*rxIf="adapter.showHeader$"`
- [ ] `src/app/pages/movie-detail-page/movie-detail-page.component.html:159` - `*rxIf="loadIframe$"`
- [ ] `src/app/pages/movie-list-page/movie-list-page.component.html:7` - `*rxIf="loading$"`
- [ ] `src/app/ui/pattern/movie-list/movie-list.component.ts:40` - `*rxIf="moviesListVisible$; else noData"`

## Import Cleanup Checklist

- [ ] `src/app/pages/account-feature/list-create-page/list-create-page.component.ts:4` - remove `RxIf` from `@rx-angular/template/if` when the file no longer needs it.
- [ ] `src/app/pages/movie-detail-page/movie-detail-page.component.ts:25` - remove `RxIf` from `@rx-angular/template/if` when the file no longer needs it.
- [ ] `src/app/pages/movie-list-page/movie-list-page.component.ts:14` - remove `RxIf` from `@rx-angular/template/if` when the file no longer needs it.
- [ ] `src/app/ui/pattern/movie-list/movie-list.component.ts:21` - remove `RxIf` from `@rx-angular/template/if` when the file no longer needs it.
