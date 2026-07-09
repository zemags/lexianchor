# LexiAnchor — Greek Trainer

A mobile PWA application with decks, spaced repetition, mnemonic images, CSV import, and a portable SQLite database. No server or account is required — all data stays on the device.

## Quick Start on a Laptop

### macOS

1. Extract the archive.
2. Double-click `start.command`. If macOS blocks it, right-click the file and select **Open**.
3. Open `http://localhost:8080` in Google Chrome.

### Windows

1. Extract the archive.
2. Run `start.bat`.
3. Open `http://localhost:8080` in Google Chrome.

You can also start it manually:

```bash
python3 server.py
```

Do not open `index.html` directly by double-clicking it through `file://`. WebAssembly, the service worker, and PWA features require a web server.

## Using the App on a Phone

### Option 1 — On the Same Wi-Fi Network as the Laptop

Start `server.py`, find the laptop’s local IP address, and open the following address on the phone:

```text
http://LAPTOP-IP:8080
```

This option is suitable for home use, but installing the PWA and using offline mode on a phone usually requires HTTPS. For a full installation, use Option 2.

### Option 2 — GitHub Pages or Any Static HTTPS Hosting

Upload the folder contents to a GitHub repository and enable GitHub Pages. The application is fully static: the database is not uploaded to GitHub and is stored locally in the user’s browser.

After the first online launch, Chrome caches the application and the SQLite library. The app can then work offline. In Chrome on Android, open the `⋮` menu and select **Install app** or **Add to Home screen**.

## Transferring the Database from a Laptop to a Phone

1. On the laptop, import the CSV files, add images, and use the trainer.
2. Open **Import & Database** → **Download Current .sqlite**.
3. Transfer the file to the phone using Google Drive, Telegram Saved Messages, AirDrop, or a cable.
4. On the phone, open LexiAnchor → **Import & Database** → **Load .sqlite from Device**.
5. Before replacing the database, the application automatically downloads a backup copy of the current database.

SQLite is automatically saved inside the browser after every change. Export is only required for backups and transferring the database between devices.

## CSV

Tab-separated files, semicolon-separated files, and comma-separated files are supported. Only the `Слово / фраза` column is required; all other fields may be empty.

Expected columns:

* Слово / фраза
* Транскрипция слова
* Перевод слова
* Пример на греческом
* Транскрипция
* Перевод примера
* Подсказка / нюанс

The `sample_cards.csv` file can be opened in Excel or Google Sheets as an example. The `demo.sqlite` file is a ready-to-use test database with three cards and can be loaded immediately through the **Import & Database** section.

## Images

In the card editor, the **Google Images** button opens a search using the original Greek word. Save a suitable image and select it in the application. On a computer, you can also copy an image and paste it into the open card editor.

Automatic downloading of the first Google image is intentionally not used. It requires an external search API, may stop working because of blocking or API changes, and does not guarantee that the image may legally be reused.

Images are resized to a maximum of 1280×900, converted to WebP, and stored directly inside the SQLite database. The card uses `object-fit: contain`, so the image is not cropped.

## Keyboard Shortcuts During Training

* `Space` — flip the card
* `1` — Again
* `2` — Hard
* `3` — Good
* `4` — Easy

## Technical Foundation

* HTML, CSS, and JavaScript without a framework
* `sql.js` / SQLite WebAssembly
* IndexedDB for automatic local storage of the exportable SQLite file
* Web App Manifest and Service Worker for PWA installation and offline caching

An internet connection is required during the first launch to load `sql.js` from the CDN. After a successful launch, the service worker stores the library in the browser cache.
