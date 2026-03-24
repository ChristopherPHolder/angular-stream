# RxAngular Template Migration Guide

This repo should migrate away from `@rx-angular/template` by using Angular's native control flow and by converting template-facing observables into signals in the component class.

## Default Rules

- Replace `RxIf` with `toSignal(...)` plus Angular `@if`.
- Replace `RxFor` with `toSignal(...)` plus Angular `@for`.
- Replace `RxLet` with `toSignal(...)` plus direct signal reads in the template. Use Angular `@let` only when a local alias makes the template clearer.
- Delete scheduling-only `RxLet` usages such as `*rxLet="[]"`.
- If you do not know how to migrate a site safely, skip it and leave its checklist item unchecked.

## Safety Rules

- Create each signal once in the component class. Do not call `toSignal` from inside a template.
- Choose `initialValue` or `requireSync` based on the current observable behavior. Do not guess.
- `RxLet` is not a conditional directive. Do not blanket-replace it with `@if`, especially where falsy values like `false`, `0`, or `''` must still render.
- Preserve existing `trackBy` behavior when converting `RxFor` to `@for`.
- Treat `strategy: ...` and `suspense: ...` as manual-review cases. Angular control flow does not provide a direct scheduler equivalent.
- After a template site is migrated, remove the directive from the component `imports` metadata and then remove the TypeScript import from `@rx-angular/template/...` once it is unused.

## Migration Patterns

### `RxLet` -> `toSignal`

Use `RxLet` replacement for value binding, not conditional rendering.

Before:

```html
<fieldset *rxLet="adapter.name$; let name">
  <input [value]="name" />
</fieldset>
```

After:

```ts
readonly name = toSignal(this.adapter.name$, { initialValue: '' });
```

```html
<fieldset>
  <input [value]="name()" />
</fieldset>
```

When a local alias improves readability, Angular-native aliasing is acceptable, but it should not change truthiness behavior.

### `RxIf` -> `toSignal` + `@if`

Before:

```html
<header *rxIf="adapter.showHeader$">
  <h1>Create new list</h1>
</header>
```

After:

```ts
readonly showHeader = toSignal(this.adapter.showHeader$, { initialValue: false });
```

```html
@if (showHeader()) {
  <header>
    <h1>Create new list</h1>
  </header>
}
```

### `RxFor` -> `toSignal` + `@for`

Before:

```html
<li *rxFor="let item of items$; trackBy: trackById">
  {{ item.title }}
</li>
```

After:

```ts
readonly items = toSignal(this.items$, { initialValue: [] });
```

```html
@for (item of items(); track trackById($index, item)) {
  <li>{{ item.title }}</li>
}
```

If the list already comes from a signal or a synchronous field, keep it that way and just move to `@for`.

### Scheduling-only `*rxLet="[]"`

Before:

```html
<div *rxLet="[]" class="content">
  ...
</div>
```

After:

```html
<div class="content">
  ...
</div>
```

If the wrapper element is no longer needed after removing the directive, delete the wrapper too.

## High-Risk Cases

- Any `RxLet` or `RxFor` usage with `strategy: ...`
- Any `RxLet` usage with `suspense: ...`
- Any migration where the correct `initialValue` or `requireSync` choice is unclear
- Any case where `RxLet` currently binds falsy-but-valid values

If a case falls into one of these buckets and the safe replacement is not obvious, skip it.

## Completion Criteria

Mark a checklist item as complete only when all of the following are true:

- The template usage has been replaced safely.
- The standalone component metadata no longer imports `RxLet`, `RxFor`, or `RxIf` for that file.
- The TypeScript import from `@rx-angular/template/...` has been removed if it is no longer used.
- The migrated area has been verified as far as practical.
