import {
  fragmentMovieCardFixtures,
} from '../../app/experiments/fragments/movie-card/fragment-movie-card.data';
import { renderMovieCardFragment } from './render-movie-card-fragment';

describe('renderMovieCardFragment', () => {
  it('returns fragment-only HTML for a known fixture id', async () => {
    const fixture = fragmentMovieCardFixtures['1'];
    const html = await renderMovieCardFragment('1');

    expect(html).toContain('<exp-fragment-movie-card');
    expect(html).not.toContain('<html');
    expect(html).not.toContain('<head>');
    expect(html).not.toContain('<body>');
    expect(html).toContain(fixture.title);
    expect(html).toContain(fixture.year);
    expect(html).toContain(fixture.rating);
    expect(html).toContain(fixture.summary);
  });
});
