// Raw SVG sources inlined at build time for server-side rendering.
//
// Each import resolves to the file's text via Vite's `?raw` suffix. The files
// live in `public/` so the browser can still fetch them by URL after
// hydration; `?raw` inlines the same bytes for SSR. This module is only
// referenced from
// `app.config.server.ts`, so the strings are bundled into the server output and
// never shipped to the browser. Rendering the real markup during SSR lets
// ngx-fast-svg hydrate the icons from the DOM on the client with no network
// request and no loader-fallback flash.
//
// Keys must match the `name` used in templates (`<fast-svg name="...">`). Any
// icon without an entry here simply falls back to the loader placeholder.
import account from '../../../public/assets/svg-icons/account.svg?raw';
import back from '../../../public/assets/svg-icons/back.svg?raw';
import deleteIcon from '../../../public/assets/svg-icons/delete.svg?raw';
import error from '../../../public/assets/svg-icons/error.svg?raw';
import genre from '../../../public/assets/svg-icons/genre.svg?raw';
import imdb from '../../../public/assets/svg-icons/imdb.svg?raw';
import moviesLogo from '../../../public/assets/svg-icons/movies-logo.svg?raw';
import play from '../../../public/assets/svg-icons/play.svg?raw';
import popular from '../../../public/assets/svg-icons/popular.svg?raw';
import sad from '../../../public/assets/svg-icons/sad.svg?raw';
import search from '../../../public/assets/svg-icons/search.svg?raw';
import tmdbLogo from '../../../public/assets/svg-icons/tmdb-logo.svg?raw';
import topRated from '../../../public/assets/svg-icons/top_rated.svg?raw';
import upcoming from '../../../public/assets/svg-icons/upcoming.svg?raw';
import website from '../../../public/assets/svg-icons/website.svg?raw';

export const SVG_ICONS: Record<string, string> = {
  account,
  back,
  delete: deleteIcon,
  error,
  genre,
  imdb,
  'movies-logo': moviesLogo,
  play,
  popular,
  sad,
  search,
  'tmdb-logo': tmdbLogo,
  top_rated: topRated,
  upcoming,
  website,
};
