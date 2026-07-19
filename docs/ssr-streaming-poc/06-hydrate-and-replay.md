# Slice 6: Hydrate and replay events

## Outcome

After reconciliation, the browser activates the withheld application scripts. Angular hydrates the
authoritative DOM, normal interaction works, and an interaction captured before hydration is
replayed.

This completes the POC.

## TODO

- [ ] Preserve the event-replay queue and listeners established by the initial event-dispatch
      bootstrap script across document reconciliation.
- [ ] Activate the final document's scripts only after the authoritative DOM is installed.
- [ ] Preserve script order where ordering affects polyfills and application bootstrap.
- [ ] Do not reactivate the event-dispatch bootstrap script and reset its queue.
- [ ] Confirm Angular recognizes the installed document as its hydration source.
- [ ] Remove any deliberate bootstrap pause after it has served the manual replay check.
- [ ] Check the browser console for hydration mismatch or client-render fallback messages.
- [ ] Confirm the demo counter works after hydration.
- [ ] Perform an interaction before hydration and confirm Angular replays it after bootstrap.

## Manual checkpoint

Throttle or deliberately pause application-script activation so there is time to interact before
hydration. Then confirm:

- The shell and preview boundary appear before Angular bootstraps.
- An interaction is captured before hydration.
- Angular hydrates without mismatch or client-render fallback warnings.
- The captured interaction is replayed once.
- Further interactions behave normally.
- The server closes the response and destroys the platform.
