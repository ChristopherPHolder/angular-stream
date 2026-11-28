<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="logo/angular-ssr-stream-logo-on-dark.svg" />
    <img src="logo/angular-ssr-stream-logo.svg" alt="angular-ssr-stream" width="500" />
  </picture>
</h1>

The angular-ssr-stream logo, in every form it is used in. The mark is the Angular
shield with three streams running through it; the streams cross out of order,
each passing over one neighbour and under the other.

The same files, with previews and download links, are on the docs site's
[press kit page](https://push-based.github.io/angular-ssr-stream/docs/reference/press-kit).

## What is here

The SVG files are the masters. Each PNG is rendered from the SVG of the same
name and has a transparent background.

### `logo/`: the symbol with the name

| File                                          | Use it                                              |
| --------------------------------------------- | --------------------------------------------------- |
| `angular-ssr-stream-logo.svg`                 | By default, on white and other light backgrounds.   |
| `angular-ssr-stream-logo-on-dark.svg`         | On dark backgrounds: the name is white.             |
| `angular-ssr-stream-logo-black.svg`           | One colour, on light backgrounds; for print.        |
| `angular-ssr-stream-logo-white.svg`           | One colour, on dark or coloured backgrounds.        |
| `angular-ssr-stream-logo-stacked.svg`         | Where the horizontal logo is too wide.              |
| `angular-ssr-stream-logo-stacked-on-dark.svg` | The stacked logo on dark backgrounds.               |
| `angular-ssr-stream-logo-stacked-black.svg`   | The stacked logo in one colour, black.              |
| `angular-ssr-stream-logo-stacked-white.svg`   | The stacked logo in one colour, white.              |
| `angular-ssr-stream-wordmark.svg`             | The name alone, next to a symbol placed separately. |
| `angular-ssr-stream-wordmark-white.svg`       | The name alone, in white.                           |
| `png/`                                        | The eight logos: 512 px high, stacked 1024 px high. |

### `symbol/`: the symbol alone

| File                                        | Use it                                                          |
| ------------------------------------------- | --------------------------------------------------------------- |
| `angular-ssr-stream-symbol.svg`             | At 32 px and above: avatars, headers, app icons.                |
| `angular-ssr-stream-symbol-black.svg`       | One colour, on light backgrounds.                               |
| `angular-ssr-stream-symbol-white.svg`       | One colour, on dark or coloured backgrounds.                    |
| `angular-ssr-stream-symbol-small.svg`       | Below 32 px. Two streams and one crossing, to stay legible.     |
| `angular-ssr-stream-symbol-small-black.svg` | The small cut in black.                                         |
| `angular-ssr-stream-symbol-small-white.svg` | The small cut in white.                                         |
| `png/`                                      | The symbol at 256, 512 and 1024 px; black and white at 1024 px. |

### `favicon/`: what a website needs

| File                   | What it is                                                            |
| ---------------------- | --------------------------------------------------------------------- |
| `favicon.svg`          | The small cut, drawn closer to the edges of its square.               |
| `favicon.ico`          | The same at 16, 32 and 48 px.                                         |
| `app-icon.svg`         | The symbol on an ink square, inside the safe zone of a maskable icon. |
| `apple-touch-icon.png` | `app-icon.svg` at 180 px.                                             |
| `icon-192.png`         | `app-icon.svg` at 192 px, for a web app manifest.                     |
| `icon-512.png`         | `app-icon.svg` at 512 px, for a web app manifest.                     |

```html
<link rel="icon" href="favicon.ico" sizes="48x48" />
<link rel="icon" type="image/svg+xml" href="favicon.svg" />
<link rel="apple-touch-icon" href="apple-touch-icon.png" />
```

### `social/`: link previews

`social-preview.png`, 1280 × 640: the image for `og:image` and for the
repository's social preview on GitHub.

## Colours

The symbol is filled with one gradient, from red at its left edge through
magenta to violet at its right, rising slightly. On the symbol's 256 × 256
canvas it runs from (14, 150) to (242, 106).

| Name    | Hex       | Where                        |
| ------- | --------- | ---------------------------- |
| Red     | `#FF0F4D` | The gradient's start         |
| Magenta | `#C4089A` | Its middle, at 50%           |
| Violet  | `#5A0FF0` | Its end                      |
| Ink     | `#0F0B1A` | The name, and dark backdrops |
| White   | `#FFFFFF` | The name on dark backgrounds |

## Typeface

The name is set in [Geist](https://vercel.com/font) (SIL Open Font License 1.1):
`angular-` in Regular (400), `ssr-stream` in Bold (650), tracked in by 2%. In these
files it is drawn as outlines, so nothing depends on the font being installed.

## Using it

- Keep clear space around the logo of at least a quarter of the symbol's height.
- Show the symbol at 32 px or more and the small cut below that, down to 16 px.
  Show the horizontal logo at 32 px high or more, and the stacked one at 80 px.
- On a photograph, a pattern or a mid-tone colour, use the white or the black
  version rather than the gradient.
- Do not recolour it, redraw its gradient, stretch it, rotate it, outline it or
  add effects to it, and do not set the name in another typeface.

## Where the shield comes from

The shield's outline is that of the [Angular icon](https://angular.dev/press-kit),
which the Angular team publishes under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and invites the
community to adapt. Here it is drawn as its six sides, each one straight line:
the shoulders carry on up to a point where the icon's letter comes through, and
the lower edges run straight to the tip. The streams are cut through it, and
the colours are its own. Angular is a trademark of Google LLC;
angular-ssr-stream is a community project, not affiliated with or endorsed by
Google or the Angular team.

## In this repository

This folder is the one copy. It is a private workspace package,
`@angular-ssr-stream/press-kit`, so the demo and the docs import the symbol from it,
and the docs site publishes the whole folder under `press-kit/`. The three files
in each app's `public/` folder (`favicon.ico`, `favicon.svg` and
`apple-touch-icon.png`) are copies of the ones in `favicon/`; copy them again
after changing those.

To render a PNG again after changing an SVG:

```bash
rsvg-convert logo/angular-ssr-stream-logo.svg -h 512 -o logo/png/angular-ssr-stream-logo.png
```
