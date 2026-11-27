# PushBased

> **In this repo:** a copy of the PushBased design system, shared by
> `apps/cloudflare-demo` and `apps/docs` as `@angular-stream/design-system`
> (private, never published). Only `tokens.css`, `components/components.css`,
> the logo and the component READMEs are kept; the React components,
> `tokens.json` and `preview.html` are left out. The Google Fonts `@import` is
> removed from `components.css`: each app's `index.html` loads Geist itself.
> Import the CSS as `@angular-stream/design-system/tokens.css` and
> `@angular-stream/design-system/components.css`; import the logo as
> `@angular-stream/design-system/pushbased-logo.svg?no-inline`, which Vite
> turns into an asset URL (without `?no-inline` it inlines it as a `data:` URI,
> which `NgOptimizedImage` rejects).

Fast, maintainable web apps, built by Angular and Nx experts.

This design system captures the visual language of [push-based.io](https://push-based.io/). Every value comes from the site's own CSS custom properties and computed styles, read on October 14, 2026. Token names match the site's `--color-*`, `--space-*`, `--radius-*` and `--shadow-*` variables, so code that already uses them maps one-to-one.

## Content fundamentals

PushBased writes like a senior engineer talking to a peer: direct, confident, and specific about outcomes.

- Lead with the result the reader gets. For example, "Build performing and maintainable applications with top-tier experts."
- Use sentence case for headings: "Our domains of expertise", "A service adapted to your needs".
- Name the technology plainly: Angular, Nx, web performance, accessibility.
- Keep calls to action short and concrete: "Book a free call", "View upcoming events", "Contact us".
- Use the mono eyebrow (`subtitle` style) for short category labels above a section title, in uppercase.

## Visual foundations

### Color

The palette is neutral-first. Most of a page is white (`color-surface`) with cool slate text, and violet carries action.

- **Violet (`color-primary-*`)** is the action color. `color-primary-500` fills primary buttons; `color-primary-600` is the hover state.
- **Red (`color-secondary-600`, #FF003C)** and **deep purple (`color-brand-navy`, #2D0064)** come from the logo. Use them for brand moments, not for UI states.
- **Slate neutrals (`color-neutral-*`)** carry text and surfaces: headings in `color-neutral-900`, body in `color-neutral-700`, supporting copy in `color-neutral-500`, cards on `color-neutral-50` with a `color-neutral-100` border.
- **State scales** (`color-success-*`, `color-warning-*`, `color-error-*`, `color-info-*`) are the standard Tailwind ramps. Use them for feedback only.

Semantic aliases (`color-surface`, `color-text`, `color-text-muted`, `color-text-heading`, `color-border`, `color-brand`, `color-brand-hover`) name the roles observed on the site. Prefer them in new work.

> **Contrast note:** White text on `color-primary-500` measures 4.31:1, which is below the 4.5:1 WCAG AA minimum for 16px text. The site uses this pair as is. For new work, use `color-primary-600` (5.8:1) when the label is smaller than 24px, or 18.66px bold.

### Typography

Geist is the only text family, with Geist Mono for eyebrows and uppercase links. Both are free on Google Fonts.

- Headings use weight 600 (`hero-title`, `section-title-lg`, `section-title`) and tighten toward the `display-5xl` size.
- Titles inside cards use weight 500 (`card-title`).
- Body text is 16/24 (`body`). Card descriptions use 14/20 with a -0.02em letter spacing (`body-sm`).

### Spacing and layout

Spacing follows a 4px grid (`space-1` = 4px through `space-96` = 384px). Content sits in a container up to 1075px wide (`67.1875rem`) with 20px gutters on each side and `space-12` vertical padding per section. Cards use `space-8` padding.

### Shape and depth

`radius-lg` (8px) is the house radius for buttons, inputs, cards and panels. Depth is light: buttons rest on `shadow-sm`, menus use `shadow-md`, and focused controls get the 4px violet halo `shadow-focus`. Cards rely on a 1px border, not a shadow.

## Iconography

The site uses simple single-color line icons (search, arrows) drawn at 16px and 20px. Arrows in tertiary links use `color-neutral-400` and turn `color-primary-600` on hover. This system doesn't include the icon set; add it under `assets/icons/` when you have the source files.

## Logo

The logo pairs a rounded "P" mark (deep purple top bowl, red lower bowl) with the stacked PUSH / BASED wordmark. Find it at `pushbased-logo.svg`. Display it at a minimum height of 32px, which is the size the site's navigation uses.

## Components

- **Button**: primary, ghost and tertiary variants, matching the site's `.pb-btn` classes.
- **Input**: text field with the violet focus state.
- **Card**: the subtle feature card used for the domains of expertise.

## Source and gaps

- Source: `https://push-based.io/` stylesheet `styles-VCBJGN75.css` and computed styles on the home page.
- The site references `--shadow-xs` for the ghost button hover but doesn't define it, so this system omits it.
- `color-brand-navy` comes from the logo file; the site's CSS doesn't define it as a token.
- The site has no dark theme, so this system has one light theme.

## Files

| File                              | What it holds                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `tokens.css`                      | Every token as a CSS custom property on `:root`, plus a `.text-<style>` class per type style.           |
| `tokens.json`                     | The same tokens as data, for build tools.                                                               |
| `components/components.css`       | Styles for `.pb-btn`, `.pb-input` and `.pb-card`. Loads Geist from Google Fonts.                        |
| `components/components.js`        | React components exposed as `window.PushBased` (`Button`, `Input`, `Card`). Needs React 18 on the page. |
| `components/index.d.ts`           | Component props, as documentation.                                                                      |
| `components/<Name>/README.md`     | Usage guidelines per component.                                                                         |
| `assets/logos/pushbased-logo.svg` | The full-color logo.                                                                                    |
| `preview.html`                    | A page that shows the tokens and components together. Open it in a browser.                             |

## Use with Claude Code

1. Copy this folder into your project, for example as `design-system/`.
2. Add this line to the project's `CLAUDE.md`:

   ```
   UI work follows design-system/README.md. Use tokens from design-system/tokens.css and the .pb-* classes in design-system/components/components.css; never hard-code colors, spacing or radii.
   ```

3. Link the stylesheets in your app:

   ```html
   <link rel="stylesheet" href="design-system/tokens.css" />
   <link rel="stylesheet" href="design-system/components/components.css" />
   ```

Without React, use the classes directly: `<a class="pb-btn pb-btn-lg pb-btn-primary">`, `<input class="pb-input">`, `<article class="pb-card">`.
