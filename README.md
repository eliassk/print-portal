<div align="center">

# 🖨️ Print Portal

**Walk-up secure printing from any phone or laptop. No drivers, no accounts.**

[![CI](https://github.com/eliassk/print-portal/actions/workflows/ci.yml/badge.svg)](https://github.com/eliassk/print-portal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![SvelteKit](https://img.shields.io/badge/SvelteKit-2-FF3E00?logo=svelte&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![Languages](https://img.shields.io/badge/UI-English%20%7C%20Polski-informational)

[Features](#features) · [Quick start](#quick-start) · [Configuration](#configuration) · [Telegram bot](#telegram-bot) · [Development](#development)

</div>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/options-dark.webp">
  <img src="docs/images/options-light.webp" alt="Print settings with a live preview of the page">
</picture>

People scan a QR code next to the printer, upload a file, check an exact preview and get a **job ID and PIN**. The job waits inside the printer until they type the PIN at the panel, so nobody else walks off with their pages. Files stay on the server only while the print is set up, and are deleted once it is sent.

Built for and tested on a **Konica Minolta bizhub C224e**. Other bizhub models that accept PJL secure jobs on port 9100 will likely work; [reports for other models](https://github.com/eliassk/print-portal/issues) are welcome.

## How it works

| 1. Choose a file | 2. Check and send | 3. Pick it up |
| --- | --- | --- |
| Scan the QR code on the printer and upload a PDF, Office file or photos. | Pick copies, size, colour, duplex and paper. The preview is the exact PDF the printer gets. | Enter the job ID and PIN at the printer: **home key → Secure Print**, then Print and Start. |

<table>
<tr>
<td width="62%"><picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/picker-dark.webp">
  <img src="docs/images/picker-light.webp" alt="Selecting a cell range on a grid of the spreadsheet">
</picture></td>
<td><picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/pin-dark.webp">
  <img src="docs/images/pin-light.webp" alt="Job ID and PIN after sending">
</picture></td>
</tr>
<tr>
<td align="center"><sub>Spreadsheets: select the range to print on a grid of the sheet</sub></td>
<td align="center"><sub>Job ID and PIN, valid until the printer deletes the job</sub></td>
</tr>
<tr>
<td><img src="docs/images/admin.webp" alt="Admin panel with trays, toner, settings and recent prints"></td>
<td align="center"><img src="docs/images/phone-options.webp" alt="Print settings on a phone" width="220"></td>
</tr>
<tr>
<td align="center"><sub>Admin panel: trays, toner, limits and recent prints</sub></td>
<td align="center"><sub>Made for phones first</sub></td>
</tr>
</table>

## Features

- 📄 **Documents and photos.** PDF, Word, Excel, PowerPoint, OpenDocument, JPG and PNG. Office files are converted with LibreOffice.
- 👀 **Exact preview** of the PDF that goes to the printer, with the printable area marked.
- ⚙️ **Print options.** Copies, page range, A5/A4/A3, colour or black and white, duplex, pages per sheet, margins and 12 paper types.
- 📊 **Spreadsheets.** Choose which sheets to print and select the cell range on a grid of the sheet.
- 🔒 **Secure Print.** Every job gets an ID and PIN and is held until it is released at the panel. The PIN is never stored.
- 🧾 **Printer status** over IPP: trays, paper and toner levels, with warnings before a job would stall.
- 🏢 **Customers.** Each company in the building gets a code with an optional active date range. Only active codes can print or connect Telegram. A customer can also list networks (e.g. an office VLAN) whose people print without a code.
- 🛠️ **Admin panel** (optional): printer status, colour on or off, daily limits per phone, recent jobs.
- 📱 **Printable guide** in the admin panel: an A3 poster or two A4 pages with the portal's address, a QR code and the steps at the printer. The Telegram part shows the bot's name, or is left out when no bot is set up. Print it or save it as PDF from the print dialog.
- 💬 **Telegram bot** (optional): forward a file to the bot and get a one-time link that opens the portal with it loaded.
- 🌐 **English and Polish** interface, set with `PUBLIC_LOCALE`. Strings live in [`src/lib/i18n`](src/lib/i18n); new languages are welcome.
- 🏠 **LAN only.** Nothing has to be reachable from the internet, HTTPS included.

## Quick start

You need a Linux machine on the same network as the printer, with Docker and Docker Compose.

```bash
git clone https://github.com/eliassk/print-portal.git print-portal
cd print-portal
cp .env.example .env   # set PRINTER_HOST, LAN_IP, PORTAL_URL; PUBLIC_LOCALE=en for English
docker compose up -d --build
```

Open `http://<LAN_IP>`. Print the guide from the admin panel, under "Plakat".

To update later, run `./scripts/update.sh`. It pulls the latest code and rebuilds, with Caddy when it is set up. The containers restart on their own after a reboot.

Build with `--build-arg OFFICE=false` to leave LibreOffice out. The image is about 500 MB smaller, and Office files are refused with a clear message.

## Configuration

All settings come from `.env`. [`.env.example`](.env.example) explains each one.

| Variable | Required | What it does |
| --- | --- | --- |
| `PUBLIC_LOCALE` | no | Interface language: `pl` (default) or `en`. |
| `PRINTER_HOST` | yes | Printer address. Ports 9100 (raw) and 631 (IPP) MUST be reachable. |
| `LAN_IP` | yes (Docker) | Address the portal binds to. |
| `PORTAL_URL` | yes | Address in the QR code and in Telegram links. |
| `PORTAL_PORT` | no | Port to listen on. Default `80`. |
| `PIN_TTL_MIN` | no | How long a held job lives. MUST match the printer's delete time for secure documents. Default `60`. |
| `MAX_UPLOAD_MB`, `MAX_PHOTOS`, `BODY_SIZE_LIMIT` | no | Upload limits. |
| `ADMIN_PASSWORD`, `ADMIN_SECRET` | no | Turn on `/admin`. Both MUST be set. |
| `TELEGRAM_BOT_TOKEN` | no | Turns on the Telegram bot. |
| `PORTAL_TZ` | no | Time zone for bot messages. Default `Europe/Warsaw`. |
| `PORTAL_DOMAIN`, `CF_API_TOKEN`, `ACME_EMAIL`, `CADDY_IP`, `LAN_*` | no | HTTPS, see [HTTPS on a local domain](#https-on-a-local-domain). |

## Telegram bot

People forward a file to the bot and get a one-time link back. The link opens the portal with the file already loaded, so nothing has to be saved on the phone first.

1. Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`) and copy its token.
2. Put it in `.env` as `TELEGRAM_BOT_TOKEN=…` and restart the stack.
3. The log shows `Telegram bot @<name> started`, and the start page shows "Połącz z Telegramem".

Only connected chats can send files:

- On the portal, "Połącz z Telegramem" opens `t.me/<bot>?start=<token>`. The token works once, for 10 minutes. Only the portal hands them out, so only people on the building network can connect a chat.
- Pressing Start in Telegram sends the token to the bot, which stores the chat as authorized. It expires after 90 days without a print; every print from the bot restarts the 90 days. `/stop` disconnects it.
- Files from any other chat are refused before they are downloaded.

How it works under the hood:

- The server long-polls `api.telegram.org`. It only makes outbound HTTPS calls, so nothing new is exposed and the portal stays LAN-only.
- A file from the bot stays on the server for 60 minutes and is then deleted. The bot says so in every reply.
- Each print link works once. The first browser that opens it owns the file. The PIN step is unchanged.
- When a file from the bot is printed, the bot also sends its job ID and PIN to the chat that sent it, so the person can forward them to whoever picks the print up. The PIN is still not stored. Set `PORTAL_TZ` if the pickup time should not be shown in `Europe/Warsaw`.
- Telegram lets bots download files up to 20 MB. Bigger files go through the portal directly.
- Each chat may send 10 files per 10 minutes.

## HTTPS on a local domain

The portal stays reachable only inside the building: the name resolves only in the local DNS,
and no port is forwarded on the router. The certificate comes from Let's Encrypt through a
Cloudflare DNS record (DNS-01), so nothing has to be open from the internet. Caddy renews it
on its own, about 30 days before it expires.

1. **Cloudflare token.** My Profile → API Tokens → Create Token → "Edit zone DNS" template.
   Zone Resources: Include → Specific zone → your domain, e.g. `example.com`. Copy the token.
2. **No public record.** Do not add an A record for the portal name in Cloudflare. Caddy only
   adds and removes a temporary `_acme-challenge` TXT record.
3. **Local DNS on the router.** Add a host entry `print.example.com → <CADDY_IP>`.
4. **`.env`:** set `PORTAL_DOMAIN`, `CF_API_TOKEN`, `ACME_EMAIL`, and the ipvlan values:
   `CADDY_IP` (a free LAN address outside DHCP), `LAN_PARENT_IF`, `LAN_SUBNET`, `LAN_GATEWAY`.
   Caddy gets that address as its own, so 80 and 443 are free there even when the VM's ports
   are taken. Set `PORTAL_URL=https://print.example.com` for the QR card. The router's local
   DNS entry MUST point to `CADDY_IP`, not to the VM. The VM itself cannot reach `CADDY_IP`
   (an ipvlan rule); test from another machine.
5. **Start:**

```bash
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build
```

Check the certificate: `docker compose -f docker-compose.yml -f docker-compose.https.yml logs caddy | grep -i certificate`.

## Development

```bash
pnpm install
cp .env.example .env
pnpm dev
```

The page is at `http://localhost:5180`. Ghostscript (`gs`) and Poppler (`pdftoppm`) are required. LibreOffice (`soffice`) is optional.

### Mock printer

No printer needed. Two terminals:

```bash
pnpm mock-printer
```

```bash
pnpm dev:mock
```

Open `http://localhost:5180`. Admin is at `/admin` with password `test`. Every job lands in `data/mock-jobs/` as the raw `.prn` and the `.pdf` the printer would get. Tray and toner status come from a response recorded from a real C224e.

### Tests

```bash
pnpm test
pnpm check
```

### Send one job by hand

To check a printer before deploying, stand at it and send a test page:

```bash
pnpm send-secure scripts/test-page.pdf --host 192.168.1.50 --id 203 --pin 2030
```

Release it at the panel: **home key → Secure Print** (Polish panel: **Bezpieczny wydruk**), ID `203`, PIN `2030`.
`--dry` writes `secure-job.prn` without sending. Other flags: `--mono`, `--duplex long|short`, `--a3`, `--copies 2`, `--paper thick2`.

## Internals

### How a job is built

`src/lib/server/pjl.ts` writes a PJL header (`HOLD=ON`, `HOLDTYPE=PRIVATE`, `KMJOBID`, `HOLDKEY`, `KMCOETYPE=0`) and appends the PDF. It is sent raw to port 9100.

Not yet verified on the printer:
- PDF after `ENTER LANGUAGE = PDF` (the stored test jobs were PCL XL from the Windows driver).
- `BINDING = TOP` for short-edge duplex.
- `DRIVERCOLORSELECT = GRAYSCALE` and `PLANESINUSE = 1` for black and white.
- `PAPER = A5` (A4 is from the capture).
- `MEDIAWEIGHT = THICK1 … THICK4` and `MEDIASOURCE = MANUALFEED` for thick paper. Capture one Windows print per paper type (print to file) and fix the `WEIGHT` table in `pjl.ts`.

[Sending one job by hand](#send-one-job-by-hand) checks all of them.

### Printer status

`src/lib/server/status.ts` reads trays, toner and low-paper warnings over IPP (port 631, read-only, cached 30 s). The parser is tested against a recorded C224e response in `src/lib/server/fixtures/`.

## License

[MIT](LICENSE)
