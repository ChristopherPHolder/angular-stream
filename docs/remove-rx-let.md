# RxLet Removal Checklist

Scan date: 2026-03-24

Migration guide: [RxAngular Template Migration Guide](./rx-angular-template-migration.md)

Use this document to track safe `RxLet` removal work.

If you do not know how to migrate a site safely, skip it and leave the checkbox unchecked.

## Summary

- Symbol: `RxLet`
- Source: `@rx-angular/template/let`
- Import statements: `10`
- Template usage sites: `19`
- Application files affected: `10`

## Completion Rule

Mark a line `[x]` only after the template usage has been migrated safely, the component metadata no longer imports `RxLet`, and the TypeScript import is removed if it is no longer needed in that file.

## Template Migration Checklist

- [ ] `src/app/app-shell/app-shell.component.html:103` - `*rxLet="accountMenuComponent$; suspense: loading"`; manual review, replace the loading/suspense behavior explicitly.
- [x] `src/app/app-shell/app-shell.component.html:112` - `*rxLet="[]"`; scheduling-only usage, remove the directive and delete the wrapper if it becomes unnecessary.
- [x] `src/app/pages/account-feature/list-create-page/list-create-page.component.ts:15` - `*rxLet="adapter.name$; let name"`
- [x] `src/app/pages/account-feature/list-create-page/list-create-page.component.ts:26` - `*rxLet="adapter.description$; let description"`
- [x] `src/app/pages/account-feature/list-create-page/list-create-page.component.ts:37` - `*rxLet="adapter.private$; let private"`; preserve falsy boolean behavior.
- [x] `src/app/pages/account-feature/list-create-page/list-create-page.component.ts:52` - `*rxLet="adapter.valid$; let valid"`; preserve falsy boolean behavior.
- [x] `src/app/pages/person-detail-page/person-detail-page.component.html:1` - `*rxLet="personCtx$; let personCtx"`
- [x] `src/app/pages/person-detail-page/person-detail-page.component.html:96` - `*rxLet="personCtx$; let p"`
- [x] `src/app/pages/person-detail-page/person-detail-page.component.html:101` - `*rxLet="sortingModel$; let sorting"`
- [ ] `src/app/pages/person-detail-page/person-detail-page.component.html:131` - `*rxLet="infiniteScrollRecommendations$; let ctx; strategy: 'immediate'"`; manual review because of custom scheduling.
- [x] `src/app/pages/movie-detail-page/movie-detail-page.component.html:2` - `*rxLet="movie$; let movie"`
- [ ] `src/app/pages/movie-detail-page/movie-detail-page.component.html:65` - `*rxLet="castList$; let ctx; strategy: 'immediate'"`; manual review because of custom scheduling.
- [ ] `src/app/pages/movie-detail-page/movie-detail-page.component.html:189` - `*rxLet="infiniteScrollRecommendations$; let ctx; strategy: 'immediate'"`; manual review because of custom scheduling.
- [x] `src/app/pages/movie-list-page/movie-list-page.component.html:2` - `*rxLet="headings$; let headings"`
- [x] `src/app/pages/account-feature/list-detail-page/list-detail-page.component.html:4` - `*rxLet="adapter.listName$; let name"`
- [x] `src/app/ui/component/search-bar/search-bar.component.ts:58` - `*rxLet="search$; let search"`
- [x] `src/app/ui/component/dark-mode-toggle/dark-mode-toggle.component.ts:23` - `*rxLet="isLightTheme$; let isLightTheme"`
- [x] `src/app/pages/account-feature/list-detail-page/list-share/list-share.component.html:3` - `*rxLet="adapter.listName$; let name"`
- [x] `src/app/pages/account-feature/list-detail-page/list-items-edit/list-items-edit.component.html:1` - `*rxLet="adapter.vm$; let vm"`

## Import Cleanup Checklist

- [ ] `src/app/app-shell/app-shell.component.ts:30` - remove `RxLet` from `@rx-angular/template/let` when the file no longer needs it.
- [x] `src/app/pages/account-feature/list-create-page/list-create-page.component.ts:1` - remove `RxLet` from `@rx-angular/template/let` when the file no longer needs it.
- [x] `src/app/pages/account-feature/list-detail-page/list-detail-page.component.ts:2` - remove `RxLet` from `@rx-angular/template/let` when the file no longer needs it.
- [x] `src/app/pages/account-feature/list-detail-page/list-items-edit/list-items-edit.component.ts:1` - remove `RxLet` from `@rx-angular/template/let` when the file no longer needs it.
- [x] `src/app/pages/account-feature/list-detail-page/list-share/list-share.component.ts:10` - remove `RxLet` from `@rx-angular/template/let` when the file no longer needs it.
- [ ] `src/app/pages/movie-detail-page/movie-detail-page.component.ts:21` - remove `RxLet` from `@rx-angular/template/let` when the file no longer needs it.
- [x] `src/app/pages/movie-list-page/movie-list-page.component.ts:13` - remove `RxLet` from `@rx-angular/template/let` when the file no longer needs it.
- [ ] `src/app/pages/person-detail-page/person-detail-page.component.ts:13` - remove `RxLet` from `@rx-angular/template/let` when the file no longer needs it.
- [x] `src/app/ui/component/dark-mode-toggle/dark-mode-toggle.component.ts:4` - remove `RxLet` from `@rx-angular/template/let` when the file no longer needs it.
- [x] `src/app/ui/component/search-bar/search-bar.component.ts:26` - remove `RxLet` from `@rx-angular/template/let` when the file no longer needs it.
