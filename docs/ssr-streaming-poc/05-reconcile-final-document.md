# Slice 5: Reconcile the preview DOM

## Outcome

The browser consumes the final-document payload and replaces the preview document with Angular's
authoritative server-rendered DOM. Browser application scripts remain withheld, so hydration does
not start yet.

## TODO

- [ ] Extend the browser runtime to recognize and decode the final-document payload.
- [ ] Parse the authoritative HTML in an inert document.
- [ ] Replace the preview head and body with the authoritative head and body.
- [ ] Ensure scripts originating from the authoritative document remain inert during replacement.
- [ ] Avoid executing the Angular event-dispatch bootstrap a second time.
- [ ] Remove protocol templates and reconciliation-only markers from the installed DOM.
- [ ] Make reconciliation happen exactly once.

## Manual checkpoint

Pause before browser module activation and inspect the DOM:

- The preview boundary has been replaced by the equivalent authoritative boundary.
- The installed DOM contains Angular hydration annotations.
- Late head elements and styles from the final document are present.
- The browser application has not bootstrapped.
- No duplicate application root or protocol artifacts remain.
