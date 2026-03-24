# RxFor Removal Checklist

Scan date: 2026-03-24

Migration guide: [RxAngular Template Migration Guide](./rx-angular-template-migration.md)

Use this document to track safe `RxFor` removal work.

If you do not know how to migrate a site safely, skip it and leave the checkbox unchecked.

## Summary

- Symbol: `RxFor`
- Source: `@rx-angular/template/for`
- Import statements: `7`
- Template usage sites: `8`
- Application files affected: `7`

## Completion Rule

Mark a line `[x]` only after the template usage has been migrated safely, the component metadata no longer imports `RxFor`, and the TypeScript import is removed if it is no longer needed in that file.

## Template Migration Checklist

- [ ] `src/app/app-shell/app-shell.component.html:53` - `*rxFor="let genre of genres$; trackBy: trackByGenre; strategy: 'idle'"`; manual review because of custom scheduling.
- [x] `src/app/pages/account-feature/account-list-page/account-list-page.component.html:8` - `*rxFor="let list of lists$; trackBy: trackById"`
- [x] `src/app/pages/account-feature/list-detail-page/list-detail-page.component.html:11` - `*rxFor="let item of tabs"`
- [x] `src/app/pages/account-feature/list-detail-page/list-image/list-image.component.html:5` - `*rxFor="let movie of adapter.posters$; index as idx; trackBy: trackByPosterId"`
- [x] `src/app/pages/account-feature/list-detail-page/list-items-edit/list-items-edit.component.html:16` - `*rxFor="let movie of vm.searchResults; trackBy: trackByMovieId"`
- [x] `src/app/pages/account-feature/list-detail-page/list-items-edit/list-items-edit.component.html:40` - `*rxFor="let item of vm.items; trackBy: trackByResultId"`
- [ ] `src/app/pages/movie-detail-page/movie-detail-page.component.html:68` - `*rxFor="let c of ctx.value; trackBy: trackByCast; index as idx"`
- [x] `src/app/ui/pattern/movie-list/movie-list.component.ts:48` - `*rxFor="let movie of movies$; index as idx; trackBy: trackByMovieId"`

## Import Cleanup Checklist

- [ ] `src/app/app-shell/app-shell.component.ts:34` - remove `RxFor` from `@rx-angular/template/for` when the file no longer needs it.
- [x] `src/app/pages/account-feature/account-list-page/account-list-page.component.ts:12` - remove `RxFor` from `@rx-angular/template/for` when the file no longer needs it.
- [x] `src/app/pages/account-feature/list-detail-page/list-detail-page.component.ts:3` - remove `RxFor` from `@rx-angular/template/for` when the file no longer needs it.
- [x] `src/app/pages/account-feature/list-detail-page/list-image/list-image.component.ts:4` - remove `RxFor` from `@rx-angular/template/for` when the file no longer needs it.
- [x] `src/app/pages/account-feature/list-detail-page/list-items-edit/list-items-edit.component.ts:7` - remove `RxFor` from `@rx-angular/template/for` when the file no longer needs it.
- [ ] `src/app/pages/movie-detail-page/movie-detail-page.component.ts:23` - remove `RxFor` from `@rx-angular/template/for` when the file no longer needs it.
- [x] `src/app/ui/pattern/movie-list/movie-list.component.ts:17` - remove `RxFor` from `@rx-angular/template/for` when the file no longer needs it.
