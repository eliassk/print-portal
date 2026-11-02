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
3. **Local DNS on the router.** Add a host entry `drukarka.konfero.pl → <LAN_IP>`.
4. **`.env`:** set `PORTAL_DOMAIN`, `CF_API_TOKEN`, `ACME_EMAIL`. When 443 is taken (UISP on
   mediacontrol-vm), set `HTTPS_PORT=8443` and `HTTPS_PORT_SUFFIX=:8443`, and set
   `PORTAL_URL=https://drukarka.konfero.pl:8443` for the QR card.
5. **Start:**

```bash
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build
```

Check the certificate: `docker compose -f docker-compose.yml -f docker-compose.https.yml logs caddy | grep -i certificate`.
