import { rxState } from '@rx-angular/state';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  TrackByFunction,
  ViewEncapsulation,
} from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from '@angular/router';
import {
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  switchMap,
} from 'rxjs';
import { TMDBMovieGenreModel } from '../data-access/api/model/movie-genre.model';
import { trackByProp } from '../shared/cdk/track-by';
import { rxActions } from '@rx-angular/state/actions';
import { RouterState } from '../shared/router/router.state';
import { getIdentifierOfTypeAndLayoutUtil } from '../shared/router/get-identifier-of-type-and-layout.util';
import { GenreResource } from '../data-access/api/resources/genre.resource';
import { rxEffects } from '@rx-angular/state/effects';
import { HamburgerButtonComponent } from '../ui/component/hamburger-button/hamburger-button.component';
import { RxLet } from '@rx-angular/template/let';
import { SideDrawerComponent } from '../ui/component/side-drawer/side-drawer.component';
import { SearchBarComponent } from '../ui/component/search-bar/search-bar.component';
import { DarkModeToggleComponent } from '../ui/component/dark-mode-toggle/dark-mode-toggle.component';
import { RxFor } from '@rx-angular/template/for';
import { LazyDirective } from '../shared/cdk/lazy/lazy.directive';
import { FastSvgComponent } from '@push-based/ngx-fast-svg';

type Actions = {
  sideDrawerOpenToggle: boolean;
  loadAccountMenu: void;
};

@Component({
  standalone: true,
  imports: [
    RouterLink,
    RxLet,
    RxFor,
    FastSvgComponent,
    HamburgerButtonComponent,
    SideDrawerComponent,
    SearchBarComponent,
    DarkModeToggleComponent,
    LazyDirective,
    RouterLinkActive,
  ],
  selector: 'app-shell',
  templateUrl: './app-shell.component.html',
  styleUrls: ['./app-shell.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
})
export class AppShellComponent {
  private readonly router = inject(Router);
  public readonly routerState = inject(RouterState);
  public genreResource = inject(GenreResource);
  readonly ui = rxActions<Actions>();
  private readonly state = rxState<{ sideDrawerOpen: boolean }>(
    ({ connect, set }) => {
      set({ sideDrawerOpen: false });
      connect('sideDrawerOpen', this.ui.sideDrawerOpenToggle$);
    }
  );

  search$ = this.routerState.select(
    getIdentifierOfTypeAndLayoutUtil('search', 'list')
  );

  accountMenuComponent$ = this.ui.loadAccountMenu$.pipe(
    switchMap(() =>
      import('./account-menu/account-menu.component').then((x) => x.default)
    ),
    shareReplay(1)
  );

  constructor() {
    rxEffects(({ register }) => {
      register(
        this.router.events.pipe(
          filter((e) => e instanceof NavigationEnd),
          map((e) => (e as NavigationEnd).urlAfterRedirects),
          distinctUntilChanged()
        ),
        () => this.closeSidenav()
      );
    });
  }

  readonly genres$ = this.genreResource.getGenresCached();

  protected readonly sideDrawerOpen = this.state.signal('sideDrawerOpen');

  readonly trackByGenre: TrackByFunction<TMDBMovieGenreModel> =
    trackByProp<TMDBMovieGenreModel>('name');

  searchMovie(term: string) {
    term === ''
      ? this.router.navigate(['list/category/popular'])
      : this.router.navigate([`list/search/${term}`]);
  }

  closeSidenav = () => {
    this.ui.sideDrawerOpenToggle(false);
  };
}
