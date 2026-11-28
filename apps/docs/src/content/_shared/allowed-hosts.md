`allowedHosts` must list every hostname the server answers for: Angular's SSR
host guard rejects any other `host` header, and the page is answered with
`403`.
