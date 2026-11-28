No. Angular renders a page on the server until the application is stable, and
sends the finished document in one piece. As of Angular 22.3, nothing in
`@angular/platform-server` or `@angular/ssr` sends HTML while the page is still
rendering, and the [roadmap][roadmap] lists no plan for it.

What Angular does have is the half of streaming that is hard to add from
outside: [incremental hydration][ih], which lets a part of the page stay plain
server HTML underneath a running application. angular-ssr-stream adds the other
half on top of it. The rest of this page shows where each of those statements
comes from.

## What Angular sends

Server rendering in Angular comes down to one function,
[`renderApplication()`][render], and its return type is most of the answer:

```ts
function renderApplication(bootstrap, options): Promise<string>;
```

One string, once. Before it resolves it
[waits for the application to be stable][stable], which includes every
`HttpClient` request the page made. A page whose product renders at once, whose
reviews take one second and whose recommendations take three is sent after
three seconds, all of it.

`@angular/ssr`, the package the Angular CLI sets up, calls the same renderer.
It adds routing on the server, a render mode per route, redirects and critical
CSS. None of them changes when the HTML is sent.

## Why it looks as if it did

The question gets both answers, because three things in Angular read like
streaming and are not.

**`@angular/ssr` returns a stream.** The `Response` it builds for a
server-rendered page has a `ReadableStream` for a body. This is everything that
goes into it ([source][app]):

```ts title="@angular/ssr 22.3.0, src/app.ts"
// Use a stream to send the response before finishing rendering and inling critical CSS, improving performance via header flushing.
const stream = new ReadableStream({
  start: async (controller) => {
    try {
      let renderedHtml = await result.content();
      renderedHtml = this.inlineCriticalCss(renderedHtml);
      controller.enqueue(this.textEncoder.encode(renderedHtml));
      controller.close();
    } catch (error) {
      await result.destroy();
      controller.error(error);
    }
  },
  cancel: () => result.destroy(),
});

return new Response(stream, responseInit);
```

One `enqueue()`, with the whole document, after rendering has finished. The
comment says what the stream is for: the status line and the headers can leave
before the body exists. The HTML still arrives in one piece.

**`writeResponseToNodeResponse()` says it streams.** Its [comment][write]
begins "Streams a web-standard `Response` into a Node.js `ServerResponse`", and
it does: it copies that body to a Node response, chunk by chunk. There is one
chunk.

**`@defer` and incremental hydration defer things.** They decide when a part's
JavaScript is loaded and when the part becomes interactive, in the browser.
Neither decides when its HTML is sent. On the server a [`@defer` block][defer]
renders its `@placeholder`, or its content if it has a `hydrate` trigger.
Either way it is part of the one document, and the document waits for
everything in it.

## What Angular has instead

The guide's own definition of [incremental hydration][ih]:

> Incremental hydration is an advanced type of hydration that can leave
> sections of your application dehydrated and incrementally trigger hydration
> of those sections as they are needed.

In practice: a `@defer` block with a `hydrate` trigger is rendered on the
server, and in the browser Angular leaves its markup alone until the trigger
fires. The application around it is hydrated and running; the block is still
plain HTML that Angular has not claimed.

Angular built this to load less JavaScript up front. It is also exactly what
streaming needs. To send a part late, something has to put new markup into a
page whose application has already started, without Angular finding a mismatch.
A block that Angular is not looking at yet is the one place where that is
allowed.

Two projects build streaming on it from outside Angular: this one, and
[Analog](https://analogjs.org), the meta-framework, whose renderer is
experimental. [Analog's streaming SSR, compared](../guides/analog-streaming-ssr.md)
sends one page through both.

## Adding the other half

angular-ssr-stream does the sending. It renders with Angular's own platform, but
it does not wait for the application to be stable before the first byte:

1. **The shell goes out at once**: everything that does not wait for data,
   with each `@defer` block in the state it has with no data. The browser loads
   Angular and hydrates the shell while the response is still open.
2. **Each slow part follows** in the same response, when the request it waited
   for finishes. A small inline script puts it in place, whether or not Angular
   is running yet.
3. **Angular hydrates the part** when its trigger fires. Its data came with it,
   so nothing is fetched twice.

In an app, a slow part is the block Angular already has. Nothing about the
template is specific to this library:

```html
<article>
  @defer (on immediate; hydrate when listReady()) {
  <ui-movie-list [movies]="movies$" />
  }
</article>
```

The rest is a few providers in the app config and a server entry for where the
app runs:

- [Introduction](../getting-started/introduction.md): the three steps above, in
  more detail.
- [Installation](../getting-started/installation.md): what it needs, and the
  setup page for each server and platform.
- [Making something stream](../guides/making-something-stream.md): which
  blocks stream, and which trigger to pick.
- [Why stream out of order](why-stream-out-of-order.md): the same page sent
  three ways on one clock, what streaming buys it, and the fifteen years of
  frameworks that did it first.
- [The demo](https://angular-ssr-stream-demo.chris-holder.workers.dev/) streams
  a real widget into an open page, and times each step.

## What streaming does not do

- **It does not make a slow request faster.** A streamed page and a page sent
  whole are complete at the same moment. Streaming stops the rest of the page,
  and the browser's work on styles, fonts and scripts, from waiting for the
  slow part.
- **It cannot change the status code late.** The status goes out with the
  shell, so a part that fails afterwards cannot turn the response into an error
  page or a redirect.
- **It is not part of Angular.** The library leans on Angular internals, so it
  supports the versions a check in CI proves, 19.2 to 22 today; see
  [Compatibility](../getting-started/installation.md#compatibility). With the
  Angular CLI it works
  inside `@angular/ssr`, streaming the routes it renders on the server; every
  other setup renders without `@angular/ssr`.
  [Caveats and limitations](../reference/limitations.md) has the list.

## Check a page yourself

`curl -N` prints a response as it arrives, so it shows which kind a server
sends:

```bash
curl -N https://your-app.example/a-slow-page
```

Nothing and then the whole document is a page sent whole. The top of the
document at once and the rest in pieces is a streamed one.
[Debugging and verifying](../guides/debugging.md) goes further, and the demo's
[response inspector](https://angular-ssr-stream-demo.chris-holder.workers.dev/inspect)
shows every flush of a real response with the time it arrived.

[roadmap]: https://angular.dev/roadmap
[ih]: https://angular.dev/guide/incremental-hydration
[render]: https://angular.dev/api/platform-server/renderApplication
[stable]: https://github.com/angular/angular/blob/v22.3.0/packages/platform-server/src/utils.ts#L370
[app]: https://github.com/angular/angular-cli/blob/v22.3.0/packages/angular/ssr/src/app.ts#L347-L363
[write]: https://github.com/angular/angular-cli/blob/v22.3.0/packages/angular/ssr/node/src/response.ts#L29-L30
[defer]: https://angular.dev/guide/templates/defer
