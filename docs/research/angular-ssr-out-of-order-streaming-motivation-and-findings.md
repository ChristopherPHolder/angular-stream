# Angular SSR Out-of-Order Streaming: Motivation and Findings

## Status

This document captures current source-level findings from investigating how Angular SSR could support out-of-order streaming or server-rendered fragments.

This is not intended as documentation for one application architecture in this repository. The repository is only the experimental environment.

The broader goal is to understand how Angular SSR could eventually support something closer to:

- the server can render a single component fragment on request
- the response can contain only the HTML for that component
- fragments can be produced independently of the main app shell
- fragments can later be hydrated on the client
- the server can eventually stream those fragments out of order

For the first spike, the target is narrower:

- create a `/fragments/...` endpoint
- render a single Angular component
- return only that component's HTML, not a full HTML document
- do only the minimum work needed to prove that Angular can render one standalone component on its own

## Motivation

The primary goal is not to adopt an island architecture as an end in itself.

The primary goal is to understand how Angular SSR could support:

- independently renderable fragment boundaries
- server delivery of those boundaries outside the full app shell
- eventual hydration of those boundaries on the client
- eventual out-of-order streaming of those boundaries

The single-component fragment endpoint is only the smallest practical experiment that can validate the first building block for that larger goal.

## Experimental Stance

The experiment should stay as small as possible.

Preferred order of implementation:

1. Reuse public Angular APIs where they are sufficient.
2. Reuse Angular internal implementation ideas where that shortens the path.
3. Recreate or replace small pieces of Angular SSR behavior if that is the fastest way to prove the concept.

The purpose of the first spike is not to stay purely inside public APIs at all costs. The purpose is to learn what a minimal server-rendered component pathway in Angular actually requires.

## What Angular SSR Actually Does Today

### 1. Angular SSR routes do not select a component to render

`@angular/ssr` server routes only describe:

- `path`
- `renderMode`
- `headers`
- `status`

Source:

- [route-config.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular-cli/packages/angular/ssr/src/routes/route-config.ts)

There is no public server-route option like:

- render this standalone component
- use a different bootstrap for this route
- return a fragment instead of the app document

### 2. Angular CLI SSR uses one bootstrap entry for the server app

The generated manifest contains one server bootstrap entry:

- `bootstrap: () => import('./main.server.mjs').then(m => m.default)`

Source:

- [manifest.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular-cli/packages/angular/build/src/utils/server-rendering/manifest.ts)

This is the key architectural limitation in the built-in SSR engine. The built-in app engine is designed around one app bootstrap, not per-route component bootstraps.

### 3. The app engine always renders against `index.server.html`

When a request is handled in SSR mode, Angular CLI SSR:

- matches a route in its server route tree
- loads the server bootstrap function
- loads `index.server.html`
- renders the bootstrapped Angular app into that document

Source:

- [app.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular-cli/packages/angular/ssr/src/app.ts)
- [utils/ng.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular-cli/packages/angular/ssr/src/utils/ng.ts)

This means the built-in `AngularNodeAppEngine` path is document-oriented and app-oriented, not fragment-oriented.

### 4. Route extraction is tied to Angular router config, not arbitrary fragment endpoints

Angular CLI SSR builds its route metadata by bootstrapping the app, disabling root bootstrap during route extraction, and walking the Angular router config.

Source:

- [ng-routes.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular-cli/packages/angular/ssr/src/routes/ng-routes.ts)

This is another signal that the official SSR path is meant for normal Angular app routing, not standalone fragment APIs.

## What Is Possible With Public Angular APIs

### 1. Rendering a standalone component on the server is possible

Angular public SSR APIs do support rendering an arbitrary standalone root component if we bootstrap that component directly with `renderApplication(...)`.

Source:

- [platform-server/src/utils.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular/packages/platform-server/src/utils.ts)

Angular's own tests use `renderApplication(...)` directly with standalone roots:

- [integration_spec.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular/packages/platform-server/test/integration_spec.ts)

Immediate implication:

- we can build a custom server endpoint that renders a fragment root component outside the stock `AngularNodeAppEngine`
- that endpoint does not need to render the main app shell or main router tree

Important caveat:

- `renderApplication(...)` renders into a document, so the first fragment spike likely needs one of these approaches:
- render into a minimal fragment-only host document and extract the component host HTML from the result
- or provide a custom server-side wrapper that makes extraction deterministic
- or bypass part of Angular's higher-level SSR flow and recreate a smaller rendering path if that ends up being simpler

### 2. Client-side hydration is relevant later, but not part of the first spike

Angular can create an application without immediately bootstrapping a root component:

- [platform-browser/src/browser.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular/packages/platform-browser/src/browser.ts)

Then `ApplicationRef.bootstrap(...)` can mount a component onto:

- a selector
- or a DOM node

Source:

- [application_ref.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular/packages/core/src/application/application_ref.ts)
- [dom_renderer.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular/packages/platform-browser/src/dom/dom_renderer.ts)

Implication for later work only:

- the browser side likely has enough primitives for an eventual fragment hydration experiment
- this is not required to validate the first fragment-rendering endpoint
- the first spike should not be blocked on solving hydration

## How Angular Hydration Works Today

### 1. Hydration depends on SSR annotations plus TransferState

During SSR, Angular annotates the rendered DOM and writes hydration metadata into `TransferState` under:

- `__nghData__`
- `__nghDeferData__`

Source:

- [annotate.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular/packages/core/src/hydration/annotate.ts)
- [hydration/utils.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular/packages/core/src/hydration/utils.ts)

That state is serialized into:

- `<script id="${APP_ID}-state" type="application/json">`

Source:

- [platform-server/src/transfer_state.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular/packages/platform-server/src/transfer_state.ts)

On the client, `TransferState` reads that script back using `APP_ID`.

Source:

- [core/src/transfer_state.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular/packages/core/src/transfer_state.ts)

### 2. DOM hydration expects the metadata to be present when the app bootstraps

`provideClientHydration()` and its DOM hydration support only enable hydration when the client can already find the transferred hydration metadata.

Source:

- [platform-browser/src/hydration.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular/packages/platform-browser/src/hydration.ts)
- [core/src/hydration/api.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular/packages/core/src/hydration/api.ts)

Hydration also validates SSR integrity markers in the document before proceeding.

Source:

- [platform-server/src/utils.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular/packages/platform-server/src/utils.ts)
- [hydration/utils.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular/packages/core/src/hydration/utils.ts)

### 3. Incremental hydration is tied to deferred blocks discovered at app bootstrap

Incremental hydration is currently built around Angular defer blocks and internal dehydrated block registries.

Source:

- [core/src/hydration/api.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular/packages/core/src/hydration/api.ts)
- [core/src/hydration/node_lookup_utils.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular/packages/core/src/hydration/node_lookup_utils.ts)
- [core/src/defer/triggering.ts](/Users/Christopher.Holder/Projects/angular-stream/opensrc/repos/github.com/angular/angular/packages/core/src/defer/triggering.ts)

Important implication:

- Angular's current incremental hydration is not a general-purpose "late attach any fetched fragment" API
- it expects the dehydrated blocks and their metadata to already be in the DOM and TransferState when the Angular app boots

This matters for the larger out-of-order streaming problem, but it should not expand the first spike. The first spike only needs to prove server-side single-component rendering.

## Most Likely Viable Direction

The most realistic path is not "teach the built-in SSR route config to return a component".

The most realistic first step is:

1. Add a custom server endpoint outside `AngularNodeAppEngine`
2. Render a standalone fragment root using `renderApplication(...)`
3. Extract and return only the component HTML for that fragment

This first spike is purely server-side fragment rendering. It does not require browser hydration, client insertion, or an island architecture implementation on the client.

A later follow-up may evolve this into:

- fragment hydration
- fragment streaming
- out-of-order streaming of multiple fragments

Those are explicitly outside the first spike.

## What Looks Feasible Right Now

### Feasible

- a dedicated fragment endpoint such as `/fragments/movie-card/:id`
- rendering a standalone fragment root without any main app shell
- returning only the HTML for that fragment
- extracting the component host subtree from a server-rendered result
- replacing or recreating a thin part of Angular SSR behavior if that reduces complexity

### Feasible but needs validation

- whether the fragment can be rendered cleanly without returning a full document
- whether extracting the component subtree is deterministic enough for server use
- whether a standalone component still ends up needing too much application context to render in isolation
- whether a minimal fragment host template is needed to keep extraction simple
- whether a smaller custom rendering path is simpler than trying to adapt the stock SSR path

## What Is Not Supported by Public APIs Today

The following does not appear to be supported by current public Angular SSR and hydration APIs:

- configuring `@angular/ssr` server routes to render a different root component directly
- asking the built-in `AngularNodeAppEngine` to return only a component fragment instead of the full document
- hydrating a fetched fragment into the already-running main Angular app with current incremental hydration semantics
- re-running Angular's defer-block discovery and hydration-trigger wiring for arbitrary HTML inserted later into an already-booted app

## Recommended Direction

Start with a single standalone fragment endpoint. Keep it separate from the built-in Angular SSR app-engine path.

The spike should optimize for validation of these questions:

- can we server-render one standalone component outside the main app shell
- can we return only the HTML for that component
- can we do that cleanly enough to support a `/fragments/...` API shape
- what wrapper or extraction strategy is required to avoid returning a full document
- which pieces can be reused directly from Angular
- which pieces are simpler to recreate for the experiment

## Open Questions For The First Spike

- Should the fragment endpoint return exactly the component host HTML, or a very small stable wrapper around it?
- What is the cleanest extraction boundary in the rendered output?
- Should the first fragment be fully self-contained, with its own data fetch on the server, instead of trying to share application state?
- Do we need a fragment-specific server document template to make extraction deterministic?
- Is the fastest path still `renderApplication(...)`, or do we need a smaller custom rendering implementation?

## Initial Recommendation

For the first spike:

- use one standalone component
- avoid router integration inside the fragment
- avoid nested defer blocks initially
- avoid any client-side hydration concerns
- focus only on the server endpoint and raw fragment HTML output
- defer hydration and island questions until after fragment rendering works
- allow recreating small Angular SSR pieces if that is the shortest route to a working fragment endpoint

The next document turns this into a concrete spike plan:

- [Angular SSR Out-of-Order Streaming: Single-Component Fragment Experiment Plan](/Users/Christopher.Holder/Projects/angular-stream/docs/research/angular-ssr-out-of-order-streaming-single-component-fragment-experiment-plan.md)
- [Angular SSR Out-of-Order Streaming: Fragment Experiment Implementation Plan](/Users/Christopher.Holder/Projects/angular-stream/docs/research/angular-ssr-out-of-order-streaming-fragment-implementation-plan.md)
