/* LexiAnchor database layer: sql.js + IndexedDB persistence. */
(() => {
  'use strict';

  const IDB_NAME = 'lexianchor-storage';
  const IDB_STORE = 'files';
  const IDB_KEY = 'lexianchor.sqlite';
  let SQL = null;
  let db = null;
  let saveTimer = null;

  function openIdb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(IDB_STORE)) {
          database.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function idbGet(key) {
    const database = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(IDB_STORE, 'readonly');
      const request = tx.objectStore(IDB_STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => database.close();
    });
  }

  async function idbPut(key, value) {
    const database = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => {
        database.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  function rows(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(params);
      const result = [];
      while (stmt.step()) result.push(stmt.getAsObject());
      return result;
    } finally {
      stmt.free();
    }
  }

  function one(sql, params = []) {
    return rows(sql, params)[0] || null;
  }

  function run(sql, params = []) {
    db.run(sql, params);
  }

  function scalar(sql, params = []) {
    const row = one(sql, params);
    if (!row) return null;
    return row[Object.keys(row)[0]];
  }

  function columnExists(table, column) {
    return rows(`PRAGMA table_info(${table})`).some((item) => item.name === column);
  }

  function migrate() {
    db.run(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS decks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        word TEXT NOT NULL,
        word_transcription TEXT DEFAULT '',
        word_translation TEXT DEFAULT '',
        example_el TEXT DEFAULT '',
        example_transcription TEXT DEFAULT '',
        example_translation TEXT DEFAULT '',
        hint TEXT DEFAULT '',
        image_blob BLOB,
        image_mime TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS srs (
        card_id INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
        due_at TEXT NOT NULL,
        interval_days REAL NOT NULL DEFAULT 0,
        ease REAL NOT NULL DEFAULT 2.5,
        repetitions INTEGER NOT NULL DEFAULT 0,
        lapses INTEGER NOT NULL DEFAULT 0,
        last_rating INTEGER,
        last_review_at TEXT
      );
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL,
        previous_interval REAL NOT NULL DEFAULT 0,
        new_interval REAL NOT NULL DEFAULT 0,
        reviewed_at TEXT NOT NULL,
        review_date TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards(deck_id);
      CREATE INDEX IF NOT EXISTS idx_srs_due ON srs(due_at);
      CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(review_date);
      INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', '1');
    `);

    // Forward-compatible additions for old app databases.
    if (!columnExists('cards', 'image_mime')) run("ALTER TABLE cards ADD COLUMN image_mime TEXT DEFAULT ''");
  }

  async function init() {
    if (typeof initSqlJs !== 'function') {
      throw new Error('Не удалось загрузить sql.js. Проверьте интернет при первом запуске.');
    }
    SQL = await initSqlJs({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`
    });
    const stored = await idbGet(IDB_KEY);
    db = stored ? new SQL.Database(new Uint8Array(stored)) : new SQL.Database();
    migrate();
    await saveNow();
  }

  async function saveNow() {
    if (!db) return;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const bytes = db.export();
    await idbPut(IDB_KEY, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    window.dispatchEvent(new CustomEvent('lexianchor:saved'));
  }

  function scheduleSave(delay = 180) {
    if (saveTimer) clearTimeout(saveTimer);
    window.dispatchEvent(new CustomEvent('lexianchor:saving'));
    saveTimer = setTimeout(() => {
      saveNow().catch((error) => console.error('SQLite autosave failed', error));
    }, delay);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function localDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getDecks() {
    return rows(`
      SELECT d.id, d.name, d.created_at, d.updated_at,
             COUNT(c.id) AS total,
             SUM(CASE WHEN s.repetitions > 0 THEN 1 ELSE 0 END) AS learned,
             SUM(CASE WHEN s.interval_days >= 21 THEN 1 ELSE 0 END) AS mature,
             SUM(CASE WHEN s.due_at <= ? THEN 1 ELSE 0 END) AS due
      FROM decks d
      LEFT JOIN cards c ON c.deck_id = d.id
      LEFT JOIN srs s ON s.card_id = c.id
      GROUP BY d.id
      ORDER BY d.updated_at DESC, d.id DESC
    `, [nowIso()]).map((item) => ({
      ...item,
      id: Number(item.id),
      total: Number(item.total || 0),
      learned: Number(item.learned || 0),
      mature: Number(item.mature || 0),
      due: Number(item.due || 0)
    }));
  }

  function createDeck(name) {
    const timestamp = nowIso();
    run('INSERT INTO decks(name, created_at, updated_at) VALUES (?, ?, ?)', [name.trim(), timestamp, timestamp]);
    const id = Number(scalar('SELECT last_insert_rowid()'));
    scheduleSave();
    return id;
  }

  function renameDeck(id, name) {
    run('UPDATE decks SET name = ?, updated_at = ? WHERE id = ?', [name.trim(), nowIso(), id]);
    scheduleSave();
  }

  function deleteDeck(id) {
    run('DELETE FROM decks WHERE id = ?', [id]);
    scheduleSave();
  }

  function getCards(deckId = null, search = '') {
    const searchValue = `%${search.trim()}%`;
    const where = [];
    const params = [];
    if (deckId !== null) {
      where.push('c.deck_id = ?');
      params.push(deckId);
    }
    if (search.trim()) {
      where.push('(c.word LIKE ? OR c.word_translation LIKE ? OR c.example_el LIKE ? OR c.example_translation LIKE ?)');
      params.push(searchValue, searchValue, searchValue, searchValue);
    }
    return rows(`
      SELECT c.*, d.name AS deck_name, s.due_at, s.interval_days, s.ease, s.repetitions, s.lapses
      FROM cards c
      JOIN decks d ON d.id = c.deck_id
      JOIN srs s ON s.card_id = c.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY c.updated_at DESC, c.id DESC
    `, params).map(normalizeCard);
  }

  function normalizeCard(card) {
    if (!card) return null;
    return {
      ...card,
      id: Number(card.id),
      deck_id: Number(card.deck_id),
      interval_days: Number(card.interval_days || 0),
      ease: Number(card.ease || 2.5),
      repetitions: Number(card.repetitions || 0),
      lapses: Number(card.lapses || 0),
      image_blob: card.image_blob instanceof Uint8Array ? card.image_blob : null
    };
  }

  function getCard(id) {
    return normalizeCard(one(`
      SELECT c.*, d.name AS deck_name, s.due_at, s.interval_days, s.ease, s.repetitions, s.lapses
      FROM cards c
      JOIN decks d ON d.id = c.deck_id
      JOIN srs s ON s.card_id = c.id
      WHERE c.id = ?
    `, [id]));
  }

  function insertCard(card) {
    const timestamp = nowIso();
    run(`
      INSERT INTO cards(
        deck_id, word, word_transcription, word_translation, example_el,
        example_transcription, example_translation, hint, image_blob, image_mime,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      card.deck_id,
      card.word.trim(),
      card.word_transcription || '',
      card.word_translation || '',
      card.example_el || '',
      card.example_transcription || '',
      card.example_translation || '',
      card.hint || '',
      card.image_blob || null,
      card.image_mime || '',
      timestamp,
      timestamp
    ]);
    const cardId = Number(scalar('SELECT last_insert_rowid()'));
    run('INSERT INTO srs(card_id, due_at, interval_days, ease, repetitions, lapses) VALUES (?, ?, 0, 2.5, 0, 0)', [cardId, timestamp]);
    run('UPDATE decks SET updated_at = ? WHERE id = ?', [timestamp, card.deck_id]);
    scheduleSave();
    return cardId;
  }

  function updateCard(card) {
    const timestamp = nowIso();
    run(`
      UPDATE cards SET deck_id = ?, word = ?, word_transcription = ?, word_translation = ?,
        example_el = ?, example_transcription = ?, example_translation = ?, hint = ?,
        image_blob = ?, image_mime = ?, updated_at = ?
      WHERE id = ?
    `, [
      card.deck_id,
      card.word.trim(),
      card.word_transcription || '',
      card.word_translation || '',
      card.example_el || '',
      card.example_transcription || '',
      card.example_translation || '',
      card.hint || '',
      card.image_blob || null,
      card.image_mime || '',
      timestamp,
      card.id
    ]);
    run('UPDATE decks SET updated_at = ? WHERE id = ?', [timestamp, card.deck_id]);
    scheduleSave();
  }

  function deleteCard(id) {
    const card = getCard(id);
    run('DELETE FROM cards WHERE id = ?', [id]);
    if (card) run('UPDATE decks SET updated_at = ? WHERE id = ?', [nowIso(), card.deck_id]);
    scheduleSave();
  }

  function importCards(deckName, cards) {
    const timestamp = nowIso();
    let deckId = null;
    db.run('BEGIN TRANSACTION');
    try {
      run('INSERT INTO decks(name, created_at, updated_at) VALUES (?, ?, ?)', [deckName.trim(), timestamp, timestamp]);
      deckId = Number(scalar('SELECT last_insert_rowid()'));
      const cardStmt = db.prepare(`
        INSERT INTO cards(
          deck_id, word, word_transcription, word_translation, example_el,
          example_transcription, example_translation, hint, image_blob, image_mime,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, '', ?, ?)
      `);
      const srsStmt = db.prepare('INSERT INTO srs(card_id, due_at, interval_days, ease, repetitions, lapses) VALUES (?, ?, 0, 2.5, 0, 0)');
      try {
        cards.forEach((card) => {
          cardStmt.run([
            deckId,
            card.word.trim(),
            card.word_transcription || '',
            card.word_translation || '',
            card.example_el || '',
            card.example_transcription || '',
            card.example_translation || '',
            card.hint || '',
            timestamp,
            timestamp
          ]);
          const cardId = Number(scalar('SELECT last_insert_rowid()'));
          srsStmt.run([cardId, timestamp]);
        });
      } finally {
        cardStmt.free();
        srsStmt.free();
      }
      db.run('COMMIT');
      scheduleSave(0);
      return deckId;
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
  }

  function getStudyCards(deckIds, dueOnly, limit) {
    if (!deckIds.length) return [];
    const placeholders = deckIds.map(() => '?').join(',');
    const params = [...deckIds];
    let dueFilter = '';
    if (dueOnly) {
      dueFilter = 'AND s.due_at <= ?';
      params.push(nowIso());
    }
    params.push(Math.max(1, Math.min(Number(limit) || 30, 500)));
    return rows(`
      SELECT c.*, d.name AS deck_name, s.due_at, s.interval_days, s.ease, s.repetitions, s.lapses
      FROM cards c
      JOIN decks d ON d.id = c.deck_id
      JOIN srs s ON s.card_id = c.id
      WHERE c.deck_id IN (${placeholders}) ${dueFilter}
      ORDER BY RANDOM()
      LIMIT ?
    `, params).map(normalizeCard);
  }

  function previewIntervals(card) {
    const base = {
      interval_days: Number(card.interval_days || 0),
      ease: Number(card.ease || 2.5),
      repetitions: Number(card.repetitions || 0),
      lapses: Number(card.lapses || 0)
    };
    return {
      0: calculateSrs(base, 0).interval,
      1: calculateSrs(base, 1).interval,
      2: calculateSrs(base, 2).interval,
      3: calculateSrs(base, 3).interval
    };
  }

  function calculateSrs(card, rating) {
    let ease = Number(card.ease || 2.5);
    let repetitions = Number(card.repetitions || 0);
    let lapses = Number(card.lapses || 0);
    let interval = Number(card.interval_days || 0);

    if (rating === 0) {
      repetitions = 0;
      lapses += 1;
      ease = Math.max(1.3, ease - 0.2);
      interval = 10 / 1440;
    } else if (rating === 1) {
      repetitions += 1;
      ease = Math.max(1.3, ease - 0.15);
      interval = interval <= 0 ? 1 : Math.max(1, interval * 1.2);
    } else if (rating === 2) {
      repetitions += 1;
      if (repetitions === 1) interval = 1;
      else if (repetitions === 2) interval = 3;
      else interval = Math.max(1, interval * ease);
    } else {
      repetitions += 1;
      ease = Math.min(3.2, ease + 0.15);
      if (repetitions === 1) interval = 4;
      else interval = Math.max(4, interval * ease * 1.3);
    }

    interval = Math.min(interval, 3650);
    return { ease, repetitions, lapses, interval };
  }

  function rateCard(cardId, rating) {
    const card = getCard(cardId);
    if (!card) throw new Error('Карточка не найдена');
    const result = calculateSrs(card, rating);
    const reviewedAt = nowIso();
    const dueAt = new Date(Date.now() + result.interval * 86400000).toISOString();
    const reviewDate = localDate();
    db.run('BEGIN TRANSACTION');
    try {
      run(`
        UPDATE srs SET due_at = ?, interval_days = ?, ease = ?, repetitions = ?, lapses = ?,
          last_rating = ?, last_review_at = ? WHERE card_id = ?
      `, [dueAt, result.interval, result.ease, result.repetitions, result.lapses, rating, reviewedAt, cardId]);
      run(`
        INSERT INTO reviews(card_id, deck_id, rating, previous_interval, new_interval, reviewed_at, review_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [cardId, card.deck_id, rating, card.interval_days, result.interval, reviewedAt, reviewDate]);
      db.run('COMMIT');
      scheduleSave();
      return { ...result, dueAt };
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
  }

  function getStats() {
    const today = localDate();
    const overview = one(`
      SELECT COUNT(c.id) AS total,
             SUM(CASE WHEN s.due_at <= ? THEN 1 ELSE 0 END) AS due,
             SUM(CASE WHEN s.repetitions > 0 THEN 1 ELSE 0 END) AS learned,
             SUM(CASE WHEN s.interval_days >= 21 THEN 1 ELSE 0 END) AS mature
      FROM cards c JOIN srs s ON s.card_id = c.id
    `, [nowIso()]) || {};
    const todayStats = one(`
      SELECT COUNT(*) AS reviews,
             SUM(CASE WHEN rating > 0 THEN 1 ELSE 0 END) AS correct
      FROM reviews WHERE review_date = ?
    `, [today]) || {};
    const streak = calculateStreak();
    const reviews = Number(todayStats.reviews || 0);
    const correct = Number(todayStats.correct || 0);
    return {
      total: Number(overview.total || 0),
      due: Number(overview.due || 0),
      learned: Number(overview.learned || 0),
      mature: Number(overview.mature || 0),
      reviewsToday: reviews,
      accuracyToday: reviews ? Math.round((correct / reviews) * 100) : 0,
      streak
    };
  }

  function calculateStreak() {
    const dates = new Set(rows('SELECT DISTINCT review_date FROM reviews ORDER BY review_date DESC').map((item) => item.review_date));
    let cursor = new Date();
    if (!dates.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (dates.has(localDate(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function getWeeklyStats() {
    const output = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - i);
      const dateKey = localDate(date);
      const result = one('SELECT COUNT(*) AS reviews FROM reviews WHERE review_date = ?', [dateKey]);
      output.push({ date: dateKey, reviews: Number(result?.reviews || 0) });
    }
    return output;
  }

  function getDatabaseInfo() {
    const bytes = db.export();
    return {
      decks: Number(scalar('SELECT COUNT(*) FROM decks') || 0),
      cards: Number(scalar('SELECT COUNT(*) FROM cards') || 0),
      bytes: bytes.length
    };
  }

  function exportBytes() {
    return db.export();
  }

  async function replaceDatabase(bytes) {
    const backup = db.export();
    let replacement = null;
    try {
      replacement = new SQL.Database(new Uint8Array(bytes));
      const integrity = replacement.exec('PRAGMA integrity_check');
      const status = integrity?.[0]?.values?.[0]?.[0];
      if (status !== 'ok') throw new Error('SQLite integrity_check не прошёл');
      const old = db;
      db = replacement;
      migrate();
      await saveNow();
      old.close();
      replacement = null;
    } catch (error) {
      if (replacement) replacement.close();
      db = new SQL.Database(backup);
      migrate();
      throw error;
    }
  }

  window.LexiDB = {
    init,
    saveNow,
    getDecks,
    createDeck,
    renameDeck,
    deleteDeck,
    getCards,
    getCard,
    insertCard,
    updateCard,
    deleteCard,
    importCards,
    getStudyCards,
    previewIntervals,
    rateCard,
    getStats,
    getWeeklyStats,
    getDatabaseInfo,
    exportBytes,
    replaceDatabase,
    localDate
  };
})();
