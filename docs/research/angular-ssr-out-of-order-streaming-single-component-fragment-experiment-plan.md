# Angular SSR Out-of-Order Streaming: Single-Component Fragment Experiment Plan

## Goal

Explore how Angular SSR could eventually support out-of-order streaming of server-rendered fragments.

The first experiment is intentionally much smaller:

- render a single Angular standalone component on the server
- expose it through a `/fragments/...` endpoint
- return only that component's HTML
- treat it as an initial approximation of a server-rendered component

The first experiment does not need to solve streaming yet. It only needs to validate the minimal building block that streaming would depend on.

## Intent

This experiment is named around out-of-order streaming because that is the actual research direction.

The first implementation target is much smaller on purpose:

- render one Angular standalone component on the server
- expose it through a fragment endpoint
- return only that component's HTML

If that works, we have identified a minimal fragment unit that could later participate in hydration or streaming experiments.

## First Experiment

Validate whether Angular can support a server-rendered fragment endpoint that returns only the HTML of a single Angular component:

- rendered on demand by a dedicated server endpoint
- returned separately from the main page request
- returned as fragment HTML rather than a full HTML document

This is an experiment, not a commitment to one application architecture.

## Scope

### In scope

- one server-rendered fragment endpoint
- one isolated standalone component render target
- server-side data loading for that component
- extraction of fragment HTML from the server-rendered result
- documentation of what works and what breaks
- learning which Angular SSR pieces can be reused directly
- learning which pieces are easier to reimplement for the experiment

### Out of scope

- integrating this into all routes
- changing Angular CLI SSR internals
- modifying `AngularNodeAppEngine`
- full general-purpose fragment framework
- any browser-side island bootstrapping
- full client hydration implementation
- actual out-of-order streaming
- trying to match React Server Components behavior on the first pass

## Implementation Principles

The experiment should stay as small as possible.

Preferred implementation order:

1. Reuse public Angular APIs if they are sufficient.
2. Reuse Angular internal implementation ideas if that shortens the path.
3. Recreate or replace small parts of Angular SSR if that makes the experiment simpler.

The experiment is allowed to recreate internals when necessary. The goal is not API purity. The goal is to identify the minimum mechanism required to server-render one standalone component independently.

## Hypothesis

We should be able to render a standalone Angular component as a mini app via `renderApplication(...)`, expose it on a dedicated endpoint, and then return only the HTML for that component.

The likely hard boundary in this first experiment is not SSR itself. The likely hard boundary is how to avoid returning a complete HTML document, given that Angular's public server rendering APIs are document-oriented.

If the public path is too document-oriented, a smaller custom rendering path may be easier than forcing the built-in SSR pipeline to behave like a fragment renderer.

## Success Criteria

The first experiment is successful if we can demonstrate all of the following:

1. A request to a custom endpoint returns HTML for a single standalone component rather than the main app shell.
2. The fragment can render real server-fetched data.
3. The endpoint returns a fragment payload rather than a full HTML document.
4. We can clearly document the extraction strategy used to isolate the component HTML.
5. We can clearly document which Angular pieces were reused and which were recreated.

## Failure Criteria

The first experiment should be considered blocked if any of these turns out to be unavoidable:

- the server render can only practically return a complete HTML document
- the component cannot be isolated from the app shell cleanly enough to expose as a fragment endpoint
- the chosen component requires too much app-level context to be rendered independently
- the minimum viable implementation becomes too coupled to Angular's full app-level SSR pipeline

If that happens, the spike still has value if it produces a precise write-up of the blocking constraint.

## Proposed Experiment Shape

### Phase 1: Single-component server rendering

Build a custom endpoint, outside the stock Angular SSR app engine path, that:

- accepts an identifier
- fetches the required server data
- renders one standalone component with `renderApplication(...)`
- returns only the resulting fragment HTML

Deliverable:

- proof that we can serve a fragment without rendering the main app shell
- proof that we do not need to return a full HTML document to the caller

### Phase 2: Response-shaping validation

Validate the server response shape:

- inspect the raw server output
- verify the extraction boundary
- verify the response can be used as HTML for a fragment API
- document whether a small wrapper is needed

Deliverable:

- explicit answer on whether the endpoint can return:
- exactly the component host HTML
- or a small deterministic wrapper around it

### Phase 3: Hydration follow-up recommendation

After the fragment endpoint works, decide how the next experiment should approach hydration:

- use Angular's hydration primitives directly
- recreate a smaller hydration pathway for fragments
- keep fragments server-only for now
- or move on to streaming questions first

Deliverable:

- a recommendation for the next investigation, based on what the fragment endpoint revealed

### Phase 4: Out-of-order streaming follow-up

Only after the first experiment works should we ask the larger question:

- how would several independently rendered fragments be scheduled and streamed out of order from Angular SSR

Deliverable:

- a constrained follow-up question for streaming, based on what we learn from the single-component experiment

## Recommended First Fragment

Choose a component with these properties:

- standalone
- no router dependency
- one deterministic input parameter
- one small server fetch
- visually obvious when hydrated
- minimal shared global state

Good candidates:

- a movie summary card
- a person summary card
- a list preview card

Avoid on the first pass:

- route components that depend on the whole shell
- components with complex child lazy loading
- components with multiple nested defer blocks
- components deeply coupled to global app state

## Proposed Technical Approach

### Server side

Create a dedicated endpoint before the current catch-all SSR route, for example:

- `/fragments/movie-card/:id`

That endpoint should:

- fetch the data needed by the fragment
- call a dedicated fragment renderer
- return only the HTML for the fragment

The fragment renderer should:

- bootstrap one standalone fragment root
- render with `renderApplication(...)`
- use a fragment-oriented server wrapper so the output can be extracted cleanly

If that becomes awkward, the renderer may:

- recreate a minimal subset of Angular SSR behavior
- use Angular internals as reference material rather than as the runtime path
- bypass higher-level SSR app-engine abstractions entirely

### Response shaping

The spike needs to choose one of these response strategies:

- render a minimal server document and extract only the component host subtree before responding
- render a minimal server document and return only the body inner HTML if the body contains only the fragment
- return a small stable wrapper if exact host-only extraction is too brittle

## Questions The Spike Must Answer

### SSR questions

- Can the fragment endpoint return HTML that is smaller than a full document?
- If Angular insists on a full document shape, can we safely extract the island portion we need?
- Do we need a custom fragment host template instead of `index.server.html`?
- Can we return exact component HTML, or do we need a stable wrapper?
- Does the chosen component need too much app-level configuration to render independently?
- Which parts of Angular SSR are actually essential for this experiment?
- Which parts are simpler to replace than to reuse?

### Longer-term questions

- If single-component rendering works, what would be required to hydrate that fragment on the client later?
- If several such fragments existed, how could Angular SSR stream them out of order?

## Risks

### Risk 1: The output is still document-shaped

Angular may render correctly on the server, but only in a way that naturally produces a full document.

Mitigation:

- use a minimal fragment-specific wrapper
- make extraction deterministic
- validate the response body, not just the render step

### Risk 2: The component still depends on too much app context

A candidate component may depend on providers, shell services, or router state from the main app.

Mitigation:

- choose a deliberately self-contained standalone component
- build a fragment-specific root wrapper if needed

### Risk 3: Reusing the official SSR stack creates unnecessary complexity

Trying too hard to stay inside the stock SSR pipeline may create more work than recreating the minimum needed behavior.

Mitigation:

- treat public APIs as preferred, not mandatory
- recreate small pieces if that keeps the experiment smaller
- optimize for learning, not for long-term polish

## Deliverables

The first experiment should leave behind:

- one isolated fragment endpoint
- one isolated fragment root component
- one short validation report describing:
  - whether SSR worked
  - whether the endpoint returned fragment HTML or document HTML
  - what extraction strategy was required
  - what app-level dependencies had to be recreated
  - which Angular APIs or internals were reused
  - which pieces were simpler to implement ourselves

## Suggested Execution Order

1. Pick the fragment candidate component.
2. Build a fragment root wrapper around that component.
3. Add a custom Fastify fragment endpoint.
4. Server-render the fragment with real data.
5. Shape the response so it returns only fragment HTML.
6. Record exactly what wrapper or extraction was required.
7. Record which Angular parts were reused versus recreated.
8. Decide whether the next experiment should investigate hydration or streaming.

## Recommended Output From The First Experiment

At the end of the first experiment, we should be able to answer one of these clearly:

- "Angular can serve component fragments through a custom endpoint with acceptable response shaping."
- "Angular can render the fragment, but only through a document-shaped output that needs extraction."
- "The chosen component is too coupled to app-level context to be a useful first fragment."
- "Angular public APIs are insufficient to produce a clean fragment endpoint without more framework work."

## Related Research

- [Angular SSR Out-of-Order Streaming: Motivation and Findings](/Users/Christopher.Holder/Projects/angular-stream/docs/research/angular-ssr-out-of-order-streaming-motivation-and-findings.md)
- [Angular SSR Out-of-Order Streaming: Fragment Experiment Implementation Plan](/Users/Christopher.Holder/Projects/angular-stream/docs/research/angular-ssr-out-of-order-streaming-fragment-implementation-plan.md)
