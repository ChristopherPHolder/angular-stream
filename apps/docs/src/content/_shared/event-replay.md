`eventDispatchContract` is for `withEventReplay()`: it is the script Angular
needs to queue the clicks made before the page hydrates. The handler adds it to
the template unless the template has it already. The `index.server.html` ngp
writes for a server build has it; the plain built `index.html`, and the one
Vite serves in `vite dev`, don't. Leave it out where the template lacks it and
those clicks are lost; the server logs a warning, once, when the page has
listeners to replay.
