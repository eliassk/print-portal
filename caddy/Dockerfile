# Caddy with the Cloudflare DNS module, so certificates are issued and renewed through
# DNS-01. Nothing has to be reachable from the internet.
FROM caddy:2.10-builder AS build
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2.10
COPY --from=build /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
