# Angular SSR Out-of-Order Streaming: Fragment Experiment Implementation Plan

## Purpose

This document turns the research and experiment framing into a concrete implementation sequence.

The immediate target is still narrow:

- implement one `/fragments/...` endpoint
- render one standalone Angular component on the server
- return only that component's HTML

The larger purpose is to validate the smallest independently renderable fragment unit that a future out-of-order streaming design could build on.

## Non-Goals For This First Implementation

Do not solve these yet:

- client-side hydration
- client-side insertion
- multiple fragment types
- multiple fragment instances
- streaming responses
- integration with the main Angular SSR route pipeline

## Implementation Strategy

Use the smallest path that proves the concept.

Priority order:

1. Reuse public Angular APIs if they get us to a fragment endpoint quickly.
2. Reuse Angular implementation patterns if they reduce uncertainty.
3. Replace or recreate small SSR pieces if that is simpler than adapting the full SSR stack.

## High-Level Design

The first implementation should have these parts:

1. A fragment candidate component
2. A fragment root wrapper component
3. A fragment server renderer
4. A fragment HTML extraction step
5. A Fastify endpoint under `/fragments/...`
6. A validation path that lets us inspect the raw output easily

## Phase 1: Choose The Fragment Candidate

Pick one component that is easiest to render independently.

Selection criteria:

- standalone or easy to wrap as standalone
- minimal dependency on router state
- minimal dependency on shell layout
- minimal dependency on global state
- deterministic input shape
- visually obvious output

Deliverable:

- one concrete first fragment target

Decision:

- if no existing component is clean enough, build a dedicated experiment-only component instead of forcing a route component into the spike

## Phase 2: Create A Fragment Root

Create a dedicated standalone root whose only job is to render the chosen fragment target.

Responsibilities:

- accept the minimum required input
- provide only the dependencies needed by the fragment
- avoid the main shell
- avoid router-driven composition if possible

Guidelines:

- keep it experiment-local
- do not reuse the main app root
- do not route into it through the normal Angular router

Deliverable:

- one minimal standalone fragment root

## Phase 3: Build A Server Rendering Function

Create a dedicated server rendering function for fragments.

Preferred first approach:

- use `renderApplication(...)`
- render the fragment root into a minimal document
- keep the document shape intentionally simple so extraction is deterministic

Suggested responsibilities:

- accept fragment params
- load server data
- construct the fragment root inputs
- render the fragment root
- return both:
- the raw rendered HTML
- the extracted fragment HTML

Why both:

- raw HTML helps debugging
- extracted fragment HTML is the actual API output

Deliverable:

- one reusable fragment render function

## Phase 4: Define Response Shaping

This is the most important design choice in the first implementation.

The renderer should produce a response we can trim to fragment HTML reliably.

Preferred extraction order:

1. Render a minimal document where the body contains only one known fragment host.
2. Extract only that host element's outer HTML.
3. If that is brittle, extract `body.innerHTML`.
4. Only if necessary, return a small stable wrapper around the fragment.

Avoid:

- regex extraction from arbitrary full-page HTML
- depending on the main app `index.server.html`
- coupling extraction to unrelated script/style markup

Deliverable:

- one clearly defined extraction rule

## Phase 5: Add The Fragment Endpoint

Add a dedicated Fastify endpoint before the catch-all SSR handler.

Suggested shape:

- `/fragments/<fragment-type>/:id`

Responsibilities:

- validate input
- call the fragment renderer
- return extracted fragment HTML
- optionally support a debug mode to return raw render output

Suggested debug support:

- query param such as `?debug=raw`
- or a separate internal-only endpoint

Deliverable:

- one working fragment endpoint

## Phase 6: Validate Output

Validate these behaviors manually before expanding scope:

- the endpoint does not return the main shell
- the endpoint does not return unrelated app markup
- the endpoint returns stable fragment HTML
- server data is correctly reflected in the output
- the extraction boundary is deterministic

Deliverable:

- one short validation note describing:
- raw output shape
- extracted output shape
- whether the strategy feels stable enough to build on

## Phase 7: Record Reuse Vs Recreation

This experiment needs explicit notes on what came from Angular directly and what had to be recreated.

Track:

- public Angular APIs reused
- Angular internal concepts copied or adapted
- custom code written because Angular's default SSR path was too document-oriented

Deliverable:

- a short technical note that explains the minimal rendering path

## Recommended File Responsibilities

The exact filenames can change, but the responsibilities should stay separate.

Suggested slices:

- fragment root component
- fragment server render helper
- fragment endpoint registration
- experiment-only docs or validation notes

Keep the implementation isolated enough that it can later be removed or evolved without touching the main SSR path too deeply.

## Decision Gates

### Gate 1: Is An Existing Component Viable?

If yes:

- continue with the chosen existing component

If no:

- create a purpose-built experiment component

### Gate 2: Is `renderApplication(...)` Enough?

If yes:

- keep using it

If no:

- shrink the problem and recreate only the rendering pieces needed for a single-component render path

### Gate 3: Can We Extract Exact Component HTML Reliably?

If yes:

- the endpoint returns exact component HTML

If no:

- return a small stable wrapper and document why

## Concrete Step Order

1. Select the first fragment candidate.
2. Define the minimum inputs and data needed for it.
3. Create a fragment root wrapper.
4. Implement a server render helper using a minimal document.
5. Inspect the raw output locally.
6. Choose and implement the extraction rule.
7. Add the `/fragments/...` Fastify endpoint.
8. Verify the endpoint output manually.
9. Write down what Angular pieces were reused and what was replaced.
10. Decide whether the next step should be hydration or streaming-oriented work.

## Immediate Next Action

Start with phase 1 and phase 2 together:

- choose the first fragment candidate
- create its standalone fragment root

That choice determines how much application context the renderer will need, and it is the main factor that will either keep the experiment small or make it balloon.

## Related Docs

- [Angular SSR Out-of-Order Streaming: Motivation and Findings](/Users/Christopher.Holder/Projects/angular-stream/docs/research/angular-ssr-out-of-order-streaming-motivation-and-findings.md)
- [Angular SSR Out-of-Order Streaming: Single-Component Fragment Experiment Plan](/Users/Christopher.Holder/Projects/angular-stream/docs/research/angular-ssr-out-of-order-streaming-single-component-fragment-experiment-plan.md)
