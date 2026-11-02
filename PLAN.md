# Print Portal

LAN-only web app for the bizhub C224e (`10.134.13.10`). A user scans a QR at the printer, uploads a file, checks the preview, picks paper and tray, and releases the job on the panel with a one-time PIN (Secure Print).

Full plan with diagrams: https://claude.ai/artifact/Wyfue2bHqC2qWYxxKquXFs
Clickable prototype (Polish): https://claude.ai/artifact/R8JzF6YZzaDB19VpyK6Ust

## Printer facts

- Secure Print header (plain PIN, no encryption):
  `KMCOETYPE=0`, `HOLD=ON`, `HOLDTYPE=PRIVATE`, `KMJOBID="<id>"`, `HOLDKEY="<pin>"`.
- Submit over raw TCP `9100`. The printer accepts PDF and JPEG directly.
- User Authentication and Account Track are OFF.
- Held secure jobs are deleted after 60 min.
- Job History is public and shows job names. The app MUST send a neutral job name.
- Trays: Bypass, Tray 1 (A4), Tray 2 (A3), Tray 3 (A4 cabinet).
- 2026-11-02: plain-PIN job was stored (history 6666). Release at the panel not yet tested.

## Language

The app MUST be in Polish: UI, errors, release card, admin, QR card. All strings live in one file (`src/lib/i18n/pl.ts`) so English MAY be added later. Paper and tray names SHOULD match the Polish KM driver (e.g. *Zwykły papier*, *Podajnik papieru*, *Wydruk bezpieczny*).

## Stack

SvelteKit (Node adapter, strict TS), `sharp` + `pdf-lib` for layout, Ghostscript to sanitise, Poppler `pdftoppm` for previews, SQLite, Docker Compose on the Ubuntu VM, LAN interface only.

## Stages

### Stage 0: Prove release at the panel
Needs someone at the printer.
- [x] Script `send-secure`: PDF + ID + PIN + options → `10.134.13.10:9100`.
- [ ] Release a plain A4 job with its PIN.
- [ ] Release a double-sided job.
- [ ] Release a Bypass + Thick 2 job.
- [ ] Capture one Windows print per tray and paper type to confirm `MEDIASOURCE` / `MEDIAWEIGHT` names.
- [x] Margin: printer reports 5 mm on every side over IPP.

Done when a job sent by the script prints after entering its PIN.

### Stage 1: Upload → PIN
- [x] SvelteKit app skeleton, PDF upload, basic options.
- [x] Job builder (pure function, unit tested against the captured header).
- [x] Release card with ID, PIN and countdown.
- [x] All UI text in Polish via `pl.ts`.
- [x] Presets: Dokument, Zdjęcie.
- [x] Page range, copies, duplex with plain labels (*jak książka* / *jak kalendarz*).
- [x] Summary screen with sheet count before sending.
- [x] Remember last settings on the device.
- [x] Dockerfile and Compose file, bound to the LAN address.
- [ ] Deploy on the Ubuntu VM.

Done when someone on the building Wi-Fi prints a PDF from a phone with a PIN.

### Stage 2: Images and preview
- [x] Image layout: fit, fill, auto-rotate, EXIF. HEIC: iPhones convert to JPEG on upload.
- [x] Server-rendered preview of the final PDF, sheet by sheet.
- [x] N-up: 1, 2, 4, 9 photos per sheet; 1, 2, 4 pages per sheet for documents.
- [x] Paper type shown as name + g/m² + example + where to load it.
- [x] Thick paper goes to the bypass tray and prints one-sided.
- [x] Low-resolution warning and low or empty tray warning.
- [ ] Confirm grammage ranges in the C224e manual.
- [ ] Confirm thick-paper and bypass PJL names (stage 0 capture).

Done when a phone photo prints on thick paper from the bypass tray exactly as previewed.

### Stage 3: Safety and comfort
- [x] Ghostscript cleans every PDF on upload.
- [x] Limits: 50 MB, max pages per job, daily sheets per phone, 5 jobs per 10 min, colour switch.
- [x] Word, Excel, PowerPoint via LibreOffice (in the Docker image; refused clearly without it).
- [x] Admin panel at `/admin`: printer, settings, recent jobs without file names.
- [x] QR card at `/karta` (A5, Polish).

### Stage 4: Status
- [x] Live tray and toner status over IPP (port 631), shown on the page and in admin.
- [x] Admin view of recent jobs and today's totals.
- [ ] "Printed" tick. The printer does not report held Secure Print jobs over IPP, and Job History needs a Web Connection session. Admin shows "Czeka na PIN" until the PIN expires instead.

## Open decisions

1. May guests on the guest Wi-Fi print?
2. Anonymous with a daily cap, or a light login?
3. Page limits per job and per day; colour for everyone?
4. Portal address on local DNS, e.g. `druk.lan`.

## Later (not scheduled)

- Booklet printing.
- Crop and rotate by touch in the preview.
- Photo sizes 10×15 and 13×18 with cut marks.
