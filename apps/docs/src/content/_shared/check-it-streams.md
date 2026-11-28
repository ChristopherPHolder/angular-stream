Request a page and print when each piece of the response arrives:

```bash
curl -sN -o /dev/null --trace-time --trace-ascii - {{url}} | grep 'Recv data'
```

```text
07:51:38.138747 <= Recv data, 3557 bytes (0xde5)
07:51:40.145185 <= Recv data, 807 bytes (0x327)
```

The shell comes at once, as one line or a few with the same time. A line that
comes later is a chunk, sent when a `@defer` block's data was there: here, one
block whose request took two seconds. A page with nothing slow on it arrives
in one piece, so check one that waits for data. If such a page still arrives
all at once, something held the response back until it was complete; see
[Checking that a response streams](../guides/streaming-through-proxies.md#checking-that-a-response-streams).
