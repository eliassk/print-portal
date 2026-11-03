# Portal druku

LAN-only web app for the bizhub C224e. Upload a document or photos on a phone, check the preview, pick paper, get an ID and PIN, release the job at the printer (Secure Print). The UI is in Polish.

- `/` print page
- `/admin` printer status, settings, recent jobs (needs `ADMIN_PASSWORD` and `ADMIN_SECRET`)
- `/karta` A5 card with the QR code, to print and hang next to the printer

Plan and stages: [PLAN.md](PLAN.md).

## Run locally

```bash
pnpm install
cp .env.example .env
pnpm dev
```

The page is at `http://<this machine>:5180`. Sending needs the printer on port 9100.

Local tools: Ghostscript (`gs`) and Poppler (`pdftoppm`) are required. LibreOffice (`soffice`) is optional; without it Word and Excel files are refused with a clear message.

## Try it with a mock printer

Two terminals:

```bash
pnpm mock-printer
```

```bash
pnpm dev:mock
```

Open `http://localhost:5180`. Admin is at `/admin` with password `test`. Every job lands in `data/mock-jobs/` as the raw `.prn` and the `.pdf` the real printer would get, and the mock prints its ID and PIN. Tray and toner status come from a response recorded from the real C224e.

## Test

```bash
pnpm test
pnpm check
```

## Stage 0: prove release at the panel

Stand at the printer, then send a test page:

```bash
pnpm send-secure scripts/test-page.pdf --id 203 --pin 2030
```

Release it: **Skrzynka → System → Wydruk bezpieczny**, ID `203`, PIN `2030`.
`--dry` writes `secure-job.prn` without sending. Other flags: `--mono`, `--duplex long|short`, `--a3`, `--copies 2`, `--paper thick2`.

## Deploy on the Ubuntu VM

```bash
cp .env.example .env   # set LAN_IP to the VM's LAN address; PORTAL_PORT if 80 is taken
docker compose up -d --build
```

## How a job is built

`src/lib/server/pjl.ts` writes a PJL header (`HOLD=ON`, `HOLDTYPE=PRIVATE`, `KMJOBID`, `HOLDKEY`, `KMCOETYPE=0`) and appends the PDF. It is sent raw to port 9100.

Not yet verified on the printer:
- PDF after `ENTER LANGUAGE = PDF` (the stored test jobs were PCL XL from the Windows driver).
- `BINDING = TOP` for short-edge duplex.
- `DRIVERCOLORSELECT = GRAYSCALE` and `PLANESINUSE = 1` for black and white.
- `PAPER = A5` (A4 is from the capture).
- `MEDIAWEIGHT = THICK1 … THICK4` and `MEDIASOURCE = MANUALFEED` for thick paper. Capture one Windows print per paper type (print to file) and fix the `WEIGHT` table in `pjl.ts`.

Stage 0 checks all of them.

## Printer status

`src/lib/server/status.ts` reads trays, toner and low-paper warnings over IPP (port 631, read-only, cached 30 s). The parser is tested against a recorded C224e response in `src/lib/server/fixtures/`.

## HTTPS on a local domain

The portal stays reachable only inside the building: the name resolves only in the local DNS,
and no port is forwarded on the router. The certificate comes from Let's Encrypt through a
Cloudflare DNS record (DNS-01), so nothing has to be open from the internet. Caddy renews it
on its own, about 30 days before it expires.

1. **Cloudflare token.** My Profile → API Tokens → Create Token → "Edit zone DNS" template.
   Zone Resources: Include → Specific zone → `konfero.pl`. Copy the token.
2. **No public record.** Do not add an A record for the portal name in Cloudflare. Caddy only
   adds and removes a temporary `_acme-challenge` TXT record.
3. **Local DNS on the router.** Add a host entry `drukarka.konfero.pl → <CADDY_IP>`.
4. **`.env`:** set `PORTAL_DOMAIN`, `CF_API_TOKEN`, `ACME_EMAIL`, and the ipvlan values:
   `CADDY_IP` (a free LAN address outside DHCP), `LAN_PARENT_IF`, `LAN_SUBNET`, `LAN_GATEWAY`.
   Caddy gets that address as its own, so 80 and 443 are free there even when the VM's ports
   are taken. Set `PORTAL_URL=https://drukarka.konfero.pl` for the QR card. The router's local
   DNS entry MUST point to `CADDY_IP`, not to the VM. The VM itself cannot reach `CADDY_IP`
   (an ipvlan rule); test from another machine.
5. **Start:**

```bash
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build
```

Check the certificate: `docker compose -f docker-compose.yml -f docker-compose.https.yml logs caddy | grep -i certificate`.

## Telegram bot

People forward a file to the bot and get a one-time link back. The link opens the portal with the file already loaded, so nothing has to be saved on the phone first.

1. Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`) and copy its token.
2. Put it in `.env` as `TELEGRAM_BOT_TOKEN=…` and restart the stack.
3. The log shows `Telegram bot @<name> started`, and the start page shows "Połącz z Telegramem".

Only connected chats can send files:

- On the portal, "Połącz z Telegramem" opens `t.me/<bot>?start=<token>`. The token works once, for 10 minutes. Only the portal hands them out, so only people on the building network can connect a chat.
- Pressing Start in Telegram sends the token to the bot, which stores the chat as authorized. It expires after 90 days without a print; every print from the bot restarts the 90 days. `/stop` disconnects it.
- Files from any other chat are refused before they are downloaded.

How it works:

- The server long-polls `api.telegram.org`. It only makes outbound HTTPS calls, so nothing new is exposed and the portal stays LAN-only.
- A file from the bot stays on the server for 60 minutes and is then deleted. The bot says so in every reply.
- Each print link works once. The first browser that opens it owns the file. The PIN step is unchanged.
- When a file from the bot is printed, the bot also sends its job ID and PIN to the chat that sent it, so the person can forward them to whoever picks the print up. The PIN is still not stored. Set `PORTAL_TZ` if the pickup time should not be shown in `Europe/Warsaw`.
- Telegram lets bots download files up to 20 MB. Bigger files go through the portal directly.
- Each chat may send 10 files per 10 minutes.
