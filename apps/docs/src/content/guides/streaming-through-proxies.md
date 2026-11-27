A streamed page only helps if each chunk reaches the browser when the server
sends it. Anything between the two that waits for the whole response before
passing it on (compression middleware, a reverse proxy, a CDN) turns it back
into a page that arrives all at once, and nothing fails: the page still
renders, just late. This page is about finding and fixing that.

## Checking that a response streams

Ask `curl` when each piece arrived. `-N` turns off curl's own buffering, and
`--trace-time --trace-ascii -` prints a timestamp for every piece read from the
socket:

```bash
curl -sN -o /dev/null --trace-time --trace-ascii - http://localhost:3000/ | grep 'Recv data'
```

```text
19:52:21.629836 <= Recv data, 3059 bytes (0xbf3)
19:52:23.629224 <= Recv data, 807 bytes (0x327)
```

That is the Node example, whose widget's data takes two seconds: the shell at
once, and the widget's chunk two seconds later. A response that comes as one
`Recv data` line, or as several within a few milliseconds of each other at the
end, was buffered somewhere.

To see what arrived when, time the markers instead. The shell holds
`data-placeholder` where the data will go, and each block arrives as a
`<template data-ngs="…">`:

```bash
curl -sN http://localhost:3000/ | perl -MTime::HiRes=time -ne '
  BEGIN { $t0 = time }
  printf "%5d ms  %s\n", (time - $t0) * 1000, $& if /data-placeholder|<template data-ngs="\w+"/'
```

```text
    4 ms  data-placeholder
 2007 ms  <template data-ngs="d0"
```

Run it against the server itself first, then against each hop in front of it,
the public URL last. The first one that arrives all at once is the one that
buffers. Add `--compressed` to take the path a browser takes: a proxy may
stream plain responses and still hold back compressed ones.

## Compression middleware

Compression is the most common cause. A compressor collects output until it
has enough to compress well, and only then writes; for a page that is all of
it.

- **`compression`** (Express, Connect, `node:http`) adds `res.flush()`, which
  pushes out what it has compressed so far.
  [`createNodeHandler()`](../reference/node.md#createnodehandler) calls it after
  every chunk, so `app.use(compression())` in front of the handler streams
  compressed pages with nothing more to do. Without the flush, the same
  response arrives in one piece when the last block is done.
- **Other middleware built on Node's `zlib`** (`@fastify/compress`,
  `koa-compress` and others) has to flush after each write as well. zlib does
  that when the stream is created with `flush: zlib.constants.Z_SYNC_FLUSH`
  (Brotli: `zlib.constants.BROTLI_OPERATION_FLUSH`); look up where your
  middleware takes zlib options, then check with `curl --compressed`.
- **Or don't compress HTML in Node** and let the proxy in front do it, or
  leave pages out of the middleware's filter. Scripts and styles, which don't
  stream, can still be compressed.

## Nginx

Nginx buffers responses from the server it proxies to by default, and sends
them on once the buffer fills or the response ends. Two ways round it:

- The handler sends `X-Accel-Buffering: no` with every page. Nginx reads it
  and turns buffering off for that response only, which leaves it on for
  everything else. This needs no configuration.
- Or turn buffering off for the location: `proxy_buffering off;`.

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  # Not needed for pages, which send X-Accel-Buffering: no.
  proxy_buffering off;
}
```

`proxy_set_header Host $host` passes the public host name on, so list it in
`allowedHosts`. Nginx sends `X-Forwarded-Proto`, but the handler only reads it
with `trustProxy: true`.

If Nginx compresses (`gzip on`), check with `curl --compressed` that the
compressed response still arrives in pieces.

## Other proxies, load balancers and CDNs

The rule is the same for all of them: anything that holds a response to
inspect, rewrite, compress or cache it may hold the whole of it.

- A streamed page carries `Cache-Control: no-store`, since a cached copy of a
  partial response would be worse than none, so a CDN shouldn't cache it. The
  buffered page sent when streaming fails before its first byte carries no
  `Cache-Control` at all, and a CDN may cache it by its own defaults; if that
  matters, add a no-cache rule for pages at the CDN. A CDN that rewrites HTML
  on the way (inserting scripts, minifying, obfuscating email addresses) may
  need the whole page first. Turn those features off for pages, or check that
  they stream.
- A proxy that speaks HTTP/1.0 to the server gets the response without chunked
  encoding, closed at the end instead. That still streams, but costs a
  connection per request; speak HTTP/1.1 to Node where you can.
- A service mesh, an API gateway or a serverless platform in front of Node
  may buffer as well. Some buffer always and need a streaming mode turned on.

Check every hop with the curl commands above; there is no header that proves
a proxy streams.

## Timeouts

A streamed response is open for as long as the slowest block takes, and each
timeout on the way is measured differently:

- **Time to first byte** isn't a problem: the shell goes out before any of the
  app's requests have answered.
- **Idle time** between two chunks is what most proxies limit. Nginx's
  `proxy_read_timeout` (60 s by default) is the time between two reads from
  the server, not the length of the response; load balancers have an idle
  timeout of their own. A block that takes longer than that after the one
  before it gets the connection cut.
- **Total time** is what some platforms limit: the response is cut when it
  runs past the platform's request timeout, however steadily chunks arrive.
- **Node itself** doesn't limit a response. `server.requestTimeout` (300 s)
  bounds receiving the request only, and `server.timeout` is off.

The page has no timeout of its own: the response stays open until the last
request the app made has answered. Put a timeout on the app's slow requests
(`timeout()` from RxJS on the `HttpClient` call), shorter than the shortest
limit in front of it, and show an error in the block when it fires. The block
is then sent with the error instead of the connection being cut.
