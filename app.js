(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = {
    page: 'dashboard',
    decks: [],
    activeDeckId: null,
    csvRows: [],
    csvFileName: '',
    editImageBytes: null,
    editImageMime: '',
    editImageRemoved: false,
    previewImageUrl: null,
    cardImageUrl: null,
    deferredInstallPrompt: null,
    study: null
  };

  const pageMeta = {
    dashboard: ['ТВОЙ ПРОГРЕСС', 'Обзор'],
    decks: ['КОЛЛЕКЦИЯ', 'Сборники'],
    study: ['ФОКУС-СЕССИЯ', 'Тренировка'],
    import: ['ДАННЫЕ', 'Импорт и база']
  };

  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    bindEvents();
    registerServiceWorker();
    try {
      await LexiDB.init();
      await refreshAll();
      $('#bootScreen').classList.add('hidden');
      $('#app').classList.remove('hidden');
    } catch (error) {
      console.error(error);
      $('.boot-subtitle').textContent = error.message || 'Не удалось открыть SQLite-базу';
      $('.boot-loader').remove();
    }
  }

  function bindEvents() {
    document.addEventListener('click', handleGlobalClick);
    $('#quickStudyButton').addEventListener('click', () => showPage('study'));
    $('#newDeckButton').addEventListener('click', createDeckFlow);
    $('#newCardButton').addEventListener('click', () => openCardDialog());
    $('#closeCardsPanel').addEventListener('click', () => {
      state.activeDeckId = null;
      $('#cardsPanel').classList.add('hidden');
    });
    $('#deckSearch').addEventListener('input', renderDecks);
    $('#selectAllDecks').addEventListener('click', toggleAllStudyDecks);
    $('#studyDeckList').addEventListener('change', updateSelectedDeckCount);
    $('#startStudyButton').addEventListener('click', startStudy);
    $('#revealButton').addEventListener('click', revealCard);
    $('#flashcard').addEventListener('click', revealCard);
    $('#exitStudyButton').addEventListener('click', finishStudyEarly);
    $('#restartStudyButton').addEventListener('click', resetStudyUi);
    $('#speakButton').addEventListener('click', (event) => {
      event.stopPropagation();
      speakCurrentWord();
    });
    $$('.rating').forEach((button) => button.addEventListener('click', () => rateCurrentCard(Number(button.dataset.rating))));

    $('#cardForm').addEventListener('submit', saveCardFromDialog);
    $('#closeCardDialog').addEventListener('click', closeCardDialog);
    $('#cancelCardButton').addEventListener('click', closeCardDialog);
    $('#deleteCardButton').addEventListener('click', deleteCurrentCard);
    $('#cardImageInput').addEventListener('change', handleImageSelection);
    $('#removeImageButton').addEventListener('click', removeEditImage);
    $('#googleImagesButton').addEventListener('click', openGoogleImages);
    $('#pasteImageButton').addEventListener('click', pasteImageFromClipboard);
    $('#closePasteFallback').addEventListener('click', hidePasteFallback);
    $('#pasteTarget').addEventListener('input', handlePasteTargetInput);
    $('#cardDialog').addEventListener('paste', handlePastedImage);

    $('#csvFileInput').addEventListener('change', (event) => handleCsvFile(event.target.files[0]));
    $('#csvDropzone').addEventListener('dragover', (event) => {
      event.preventDefault();
      event.currentTarget.classList.add('dragover');
    });
    $('#csvDropzone').addEventListener('dragleave', (event) => event.currentTarget.classList.remove('dragover'));
    $('#csvDropzone').addEventListener('drop', (event) => {
      event.preventDefault();
      event.currentTarget.classList.remove('dragover');
      handleCsvFile(event.dataTransfer.files[0]);
    });
    $('#importCsvButton').addEventListener('click', importCsvRows);
    $('#exportDbButton').addEventListener('click', () => exportDatabase('lexianchor'));
    $('#dbFileInput').addEventListener('change', handleDatabaseFile);

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      state.deferredInstallPrompt = event;
      $('#installButton').classList.remove('hidden');
    });
    $('#installButton').addEventListener('click', installPwa);
    window.addEventListener('lexianchor:saving', () => setDbStatus('Сохраняю…', true));
    window.addEventListener('lexianchor:saved', () => setDbStatus('SQLite сохранена', false));
    window.addEventListener('keydown', handleKeyboardShortcuts);
  }

  function handleGlobalClick(event) {
    const nav = event.target.closest('[data-page]');
    if (nav) {
      showPage(nav.dataset.page);
      return;
    }
    const deckAction = event.target.closest('[data-deck-action]');
    if (deckAction) handleDeckAction(deckAction.dataset.deckAction, Number(deckAction.dataset.deckId));
    const cardAction = event.target.closest('[data-card-id]');
    if (cardAction) openCardDialog(Number(cardAction.dataset.cardId));
  }

  function showPage(page) {
    state.page = page;
    $$('.page').forEach((section) => section.classList.toggle('active', section.id === `page-${page}`));
    $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
    const [eyebrow, title] = pageMeta[page] || pageMeta.dashboard;
    $('#pageEyebrow').textContent = eyebrow;
    $('#pageTitle').textContent = title;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (page === 'study' && !state.study) resetStudyUi();
  }

  async function refreshAll() {
    state.decks = LexiDB.getDecks();
    renderDashboard();
    renderDecks();
    renderStudyDecks();
    renderDeckSelect();
    renderDatabaseInfo();
    if (state.activeDeckId) renderCardsPanel(state.activeDeckId);
  }

  function renderDashboard() {
    const stats = LexiDB.getStats();
    const cards = [
      ['Карточек всего', formatNumber(stats.total), '▦'],
      ['На сегодня', formatNumber(stats.due), '◷'],
      ['Серия дней', `${stats.streak} ${plural(stats.streak, 'день', 'дня', 'дней')}`, '⚡'],
      ['Точность сегодня', `${stats.accuracyToday}%`, '◎']
    ];
    $('#statsGrid').innerHTML = cards.map(([label, value, icon]) => `
      <article class="stat-card"><div class="stat-copy"><small>${label}</small><strong>${value}</strong></div><div class="stat-icon">${icon}</div></article>
    `).join('');

    const weekly = LexiDB.getWeeklyStats();
    const max = Math.max(1, ...weekly.map((item) => item.reviews));
    const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
    $('#weeklyChart').innerHTML = weekly.map((item) => {
      const date = new Date(`${item.date}T12:00:00`);
      const height = Math.max(4, Math.round((item.reviews / max) * 150));
      return `<div class="day-bar"><div class="bar-wrap"><div class="bar" style="height:${height}px" data-value="${item.reviews}"></div></div><small>${weekday.format(date).replace('.', '')}</small></div>`;
    }).join('');
    const totalWeekly = weekly.reduce((sum, item) => sum + item.reviews, 0);
    $('#weeklyTotal').textContent = `${totalWeekly} ${plural(totalWeekly, 'карточка', 'карточки', 'карточек')}`;

    const deckContainer = $('#dashboardDecks');
    if (!state.decks.length) {
      deckContainer.innerHTML = emptyState('Пока нет сборников', 'Импортируй первый CSV или создай сборник вручную.');
      return;
    }
    deckContainer.innerHTML = state.decks.slice(0, 5).map((deck) => {
      const progress = deck.total ? Math.round((deck.learned / deck.total) * 100) : 0;
      return `<div class="deck-progress-item">
        <div class="deck-mini-icon">${escapeHtml(deck.name.charAt(0).toUpperCase() || 'Λ')}</div>
        <div class="deck-progress-copy"><strong>${escapeHtml(deck.name)}</strong><small>${deck.learned} изучено · ${deck.due} на сегодня</small><div class="mini-progress"><span style="width:${progress}%"></span></div></div>
        <div class="deck-progress-value">${progress}%</div>
      </div>`;
    }).join('');
  }

  function renderDecks() {
    const query = $('#deckSearch')?.value.trim().toLowerCase() || '';
    let visible = state.decks;
    if (query) {
      const matchingDeckIds = new Set(LexiDB.getCards(null, query).map((card) => card.deck_id));
      visible = state.decks.filter((deck) => deck.name.toLowerCase().includes(query) || matchingDeckIds.has(deck.id));
    }
    const container = $('#decksGrid');
    if (!visible.length) {
      container.innerHTML = emptyState(query ? 'Ничего не найдено' : 'Нет сборников', query ? 'Попробуй другой запрос.' : 'Создай пустой сборник или импортируй CSV.');
      return;
    }
    container.innerHTML = visible.map((deck) => {
      const learnedPct = deck.total ? Math.round((deck.learned / deck.total) * 100) : 0;
      return `<article class="deck-card">
        <div class="deck-card-top"><div class="deck-icon">${escapeHtml(deck.name.charAt(0).toUpperCase() || 'Λ')}</div><div class="deck-menu"><button data-deck-action="rename" data-deck-id="${deck.id}" title="Переименовать">✎</button><button data-deck-action="delete" data-deck-id="${deck.id}" title="Удалить">×</button></div></div>
        <h3>${escapeHtml(deck.name)}</h3><p>${deck.total} ${plural(deck.total, 'карточка', 'карточки', 'карточек')}</p>
        <div class="deck-card-stats"><div class="deck-stat"><strong>${deck.due}</strong><small>сегодня</small></div><div class="deck-stat"><strong>${deck.learned}</strong><small>изучено</small></div><div class="deck-stat"><strong>${learnedPct}%</strong><small>прогресс</small></div></div>
        <div class="deck-actions"><button class="button ghost compact" data-deck-action="cards" data-deck-id="${deck.id}">Карточки</button><button class="button primary compact" data-deck-action="study" data-deck-id="${deck.id}">Учить</button></div>
      </article>`;
    }).join('');
  }

  async function createDeckFlow() {
    const name = prompt('Название нового сборника:');
    if (!name?.trim()) return;
    LexiDB.createDeck(name);
    await refreshAll();
    toast('Сборник создан', 'success');
  }

  async function handleDeckAction(action, deckId) {
    const deck = state.decks.find((item) => item.id === deckId);
    if (!deck) return;
    if (action === 'cards') {
      state.activeDeckId = deckId;
      renderCardsPanel(deckId);
      $('#cardsPanel').classList.remove('hidden');
      $('#cardsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (action === 'study') {
      showPage('study');
      await renderStudyDecks([deckId]);
      startStudy();
    } else if (action === 'rename') {
      const nextName = prompt('Новое название сборника:', deck.name);
      if (!nextName?.trim()) return;
      LexiDB.renameDeck(deckId, nextName);
      await refreshAll();
      toast('Сборник переименован', 'success');
    } else if (action === 'delete') {
      const ok = await confirmAction('Удалить сборник?', `Сборник «${deck.name}», его карточки и история повторений будут удалены.`, 'Удалить');
      if (!ok) return;
      LexiDB.deleteDeck(deckId);
      if (state.activeDeckId === deckId) state.activeDeckId = null;
      await refreshAll();
      $('#cardsPanel').classList.add('hidden');
      toast('Сборник удалён', 'success');
    }
  }

  function renderCardsPanel(deckId) {
    const deck = state.decks.find((item) => item.id === deckId);
    if (!deck) return;
    $('#cardsPanelTitle').textContent = deck.name;
    const cards = LexiDB.getCards(deckId);
    $('#cardsTable').innerHTML = cards.length ? cards.map((card) => `
      <div class="card-row"><strong>${escapeHtml(card.word)}</strong><span>${escapeHtml(card.example_el || '—')}</span><span>${escapeHtml(card.word_translation || '—')}</span><button class="button ghost" data-card-id="${card.id}">Изменить</button></div>
    `).join('') : emptyState('В сборнике пока пусто', 'Добавь карточку вручную или импортируй CSV.');
  }

  function renderStudyDecks(preselected = null) {
    const selected = preselected || $$('#studyDeckList input:checked').map((input) => Number(input.value));
    const defaultSelected = selected.length ? selected : state.decks.map((deck) => deck.id);
    const container = $('#studyDeckList');
    if (!state.decks.length) {
      container.innerHTML = emptyState('Нечего тренировать', 'Сначала добавь сборник.');
      $('#startStudyButton').disabled = true;
      updateSelectedDeckCount();
      return;
    }
    container.innerHTML = state.decks.map((deck) => `
      <label class="study-deck-option"><input type="checkbox" value="${deck.id}" ${defaultSelected.includes(deck.id) ? 'checked' : ''}><div><strong>${escapeHtml(deck.name)}</strong><small>${deck.total} карточек · ${deck.due} по расписанию</small></div><span>${deck.learned}/${deck.total}</span></label>
    `).join('');
    $('#startStudyButton').disabled = false;
    updateSelectedDeckCount();
  }

  function toggleAllStudyDecks() {
    const inputs = $$('#studyDeckList input[type="checkbox"]');
    const allSelected = inputs.length && inputs.every((input) => input.checked);
    inputs.forEach((input) => { input.checked = !allSelected; });
    updateSelectedDeckCount();
  }

  function updateSelectedDeckCount() {
    const count = $$('#studyDeckList input:checked').length;
    $('#selectedCount').textContent = `${count} ${plural(count, 'выбран', 'выбрано', 'выбрано')}`;
    $('#startStudyButton').disabled = !count;
  }

  function startStudy() {
    const deckIds = $$('#studyDeckList input:checked').map((input) => Number(input.value));
    const dueOnly = $('#dueOnlyToggle').checked;
    const limit = Number($('#studyLimit').value || 30);
    const cards = LexiDB.getStudyCards(deckIds, dueOnly, limit);
    if (!cards.length) {
      toast(dueOnly ? 'Нет карточек, подошедших к повторению. Отключи режим «по расписанию».' : 'В выбранных сборниках нет карточек.', 'error');
      return;
    }
    state.study = {
      queue: [...cards],
      initialTotal: cards.length,
      completed: 0,
      answers: 0,
      correct: 0,
      again: 0,
      startedAt: Date.now(),
      flipped: false
    };
    $('#studySetup').classList.add('hidden');
    $('#studyFinished').classList.add('hidden');
    $('#studySession').classList.remove('hidden');
    renderCurrentCard();
  }

  function renderCurrentCard() {
    const study = state.study;
    if (!study || !study.queue.length) {
      finishStudy();
      return;
    }
    const card = study.queue[0];
    study.flipped = false;
    $('#flashcard').classList.remove('flipped');
    $('#revealActions').classList.remove('hidden');
    $('#ratingActions').classList.add('hidden');
    $('#cardDeckBadge').textContent = card.deck_name;
    $('#cardWord').innerHTML = `<strong>${escapeHtml(card.word)}</strong>`;
    $('#cardWordTranscription').textContent = card.word_transcription || '';
    $('#cardExample').innerHTML = card.example_el ? highlightTerm(card.example_el, card.word) : '<span class="muted">Пример не добавлен</span>';
    $('#cardExampleTranscription').textContent = card.example_transcription || '';
    $('#cardTranslation').textContent = card.word_translation || '—';
    $('#cardExampleTranslation').textContent = card.example_translation || '—';
    $('#cardHint').textContent = card.hint || 'Подсказка не добавлена';
    $('#cardHintBox').classList.toggle('hidden', !card.hint);
    renderStudyImage(card);

    const visibleNumber = Math.min(study.completed + 1, study.initialTotal);
    $('#sessionCounter').textContent = `${visibleNumber} / ${study.initialTotal}`;
    $('#sessionDeckName').textContent = card.deck_name;
    $('#sessionProgress').style.width = `${Math.round((study.completed / study.initialTotal) * 100)}%`;
    $('#sessionScore').textContent = `${study.correct} ✓`;
    const intervals = LexiDB.previewIntervals(card);
    $('#hardInterval').textContent = formatInterval(intervals[1]);
    $('#goodInterval').textContent = formatInterval(intervals[2]);
    $('#easyInterval').textContent = formatInterval(intervals[3]);
  }

  function renderStudyImage(card) {
    if (state.cardImageUrl) URL.revokeObjectURL(state.cardImageUrl);
    state.cardImageUrl = null;
    const box = $('#cardImageBox');
    if (card.image_blob?.length) {
      state.cardImageUrl = URL.createObjectURL(new Blob([card.image_blob], { type: card.image_mime || 'image/jpeg' }));
      box.innerHTML = `<img src="${state.cardImageUrl}" alt="Визуальный якорь для ${escapeHtml(card.word)}">`;
    } else {
      box.innerHTML = '<div class="image-placeholder"><span>✦</span><small>Добавь визуальный якорь</small></div>';
    }
  }

  function revealCard() {
    if (!state.study || !state.study.queue.length) return;
    state.study.flipped = !state.study.flipped;
    $('#flashcard').classList.toggle('flipped', state.study.flipped);
    $('#revealActions').classList.toggle('hidden', state.study.flipped);
    $('#ratingActions').classList.toggle('hidden', !state.study.flipped);
  }

  async function rateCurrentCard(rating) {
    if (!state.study?.flipped || !state.study.queue.length) return;
    const study = state.study;
    const card = study.queue.shift();
    LexiDB.rateCard(card.id, rating);
    study.answers += 1;
    if (rating === 0) {
      study.again += 1;
      const refreshed = LexiDB.getCard(card.id);
      const insertionIndex = Math.min(3, study.queue.length);
      study.queue.splice(insertionIndex, 0, refreshed);
    } else {
      study.correct += 1;
      study.completed += 1;
    }
    renderCurrentCard();
  }

  function finishStudyEarly() {
    if (!state.study) return resetStudyUi();
    const proceed = confirm('Завершить текущую тренировку? Уже записанные ответы сохранятся.');
    if (proceed) finishStudy();
  }

  function finishStudy() {
    const study = state.study;
    if (!study) return resetStudyUi();
    const elapsed = Math.max(1, Math.round((Date.now() - study.startedAt) / 60000));
    const accuracy = study.answers ? Math.round((study.correct / study.answers) * 100) : 0;
    $('#studySession').classList.add('hidden');
    $('#studyFinished').classList.remove('hidden');
    $('#finishSummary').textContent = `Ты завершил ${study.completed} ${plural(study.completed, 'карточку', 'карточки', 'карточек')} и обновил расписание повторений.`;
    $('#finishStats').innerHTML = `
      <div class="finish-stat"><strong>${study.answers}</strong><small>ответов</small></div>
      <div class="finish-stat"><strong>${accuracy}%</strong><small>точность</small></div>
      <div class="finish-stat"><strong>${elapsed} мин</strong><small>время</small></div>`;
    refreshAll();
  }

  function resetStudyUi() {
    state.study = null;
    $('#studySession').classList.add('hidden');
    $('#studyFinished').classList.add('hidden');
    $('#studySetup').classList.remove('hidden');
    renderStudyDecks();
  }

  function speakCurrentWord() {
    const word = state.study?.queue?.[0]?.word;
    if (!word || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'el-GR';
    utterance.rate = 0.82;
    speechSynthesis.speak(utterance);
  }

  function handleKeyboardShortcuts(event) {
    if (state.page !== 'study' || !state.study || $('#cardDialog').open) return;
    if (event.code === 'Space') {
      event.preventDefault();
      revealCard();
    }
    if (state.study.flipped && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(event.code)) {
      rateCurrentCard(Number(event.code.slice(-1)) - 1);
    }
  }

  function renderDeckSelect(selectedId = null) {
    $('#cardDeckId').innerHTML = state.decks.map((deck) => `<option value="${deck.id}" ${deck.id === selectedId ? 'selected' : ''}>${escapeHtml(deck.name)}</option>`).join('');
  }

  async function openCardDialog(cardId = null) {
    if (!state.decks.length) {
      const name = prompt('Сначала создай сборник. Название:');
      if (!name?.trim()) return;
      LexiDB.createDeck(name);
      await refreshAll();
    }
    const card = cardId ? LexiDB.getCard(cardId) : null;
    $('#cardDialogTitle').textContent = card ? 'Редактировать карточку' : 'Новая карточка';
    $('#cardId').value = card?.id || '';
    renderDeckSelect(card?.deck_id || state.activeDeckId || state.decks[0]?.id);
    $('#editWord').value = card?.word || '';
    $('#editWordTranscription').value = card?.word_transcription || '';
    $('#editWordTranslation').value = card?.word_translation || '';
    $('#editExampleEl').value = card?.example_el || '';
    $('#editExampleTranscription').value = card?.example_transcription || '';
    $('#editExampleTranslation').value = card?.example_translation || '';
    $('#editHint').value = card?.hint || '';
    state.editImageBytes = card?.image_blob || null;
    state.editImageMime = card?.image_mime || '';
    state.editImageRemoved = false;
    renderEditImagePreview();
    $('#deleteCardButton').classList.toggle('hidden', !card);
    hidePasteFallback();
    $('#cardDialog').showModal();
    setTimeout(() => $('#editWord').focus(), 50);
  }

  function closeCardDialog() {
    $('#cardDialog').close();
    clearPreviewImageUrl();
    $('#cardImageInput').value = '';
    hidePasteFallback();
  }

  async function saveCardFromDialog(event) {
    event.preventDefault();
    const id = Number($('#cardId').value || 0);
    const payload = {
      id,
      deck_id: Number($('#cardDeckId').value),
      word: $('#editWord').value.trim(),
      word_transcription: $('#editWordTranscription').value.trim(),
      word_translation: $('#editWordTranslation').value.trim(),
      example_el: $('#editExampleEl').value.trim(),
      example_transcription: $('#editExampleTranscription').value.trim(),
      example_translation: $('#editExampleTranslation').value.trim(),
      hint: $('#editHint').value.trim(),
      image_blob: state.editImageRemoved ? null : state.editImageBytes,
      image_mime: state.editImageRemoved ? '' : state.editImageMime
    };
    if (!payload.word) return toast('Поле «Слово / фраза» обязательно', 'error');
    if (id) LexiDB.updateCard(payload); else LexiDB.insertCard(payload);
    closeCardDialog();
    await refreshAll();
    toast(id ? 'Карточка обновлена' : 'Карточка добавлена', 'success');
  }

  async function deleteCurrentCard() {
    const id = Number($('#cardId').value || 0);
    if (!id) return;
    const ok = await confirmAction('Удалить карточку?', 'Карточка и история её повторений будут удалены.', 'Удалить');
    if (!ok) return;
    LexiDB.deleteCard(id);
    closeCardDialog();
    await refreshAll();
    toast('Карточка удалена', 'success');
  }

  async function handleImageSelection(event) {
    const file = event.target.files[0];
    if (!file) return;
    await setEditImageFromFile(file);
  }

  async function pasteImageFromClipboard() {
    if (!window.isSecureContext || !navigator.clipboard?.read) {
      showPasteFallback();
      const reason = window.isSecureContext
        ? 'На этом устройстве прямое чтение изображений не поддерживается. Удерживай поле ниже и выбери «Вставить».'
        : 'Прямой доступ к буферу требует HTTPS. Удерживай поле ниже и выбери «Вставить».';
      toast(reason, 'error');
      return;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const clipboardItem of clipboardItems) {
        const imageType = clipboardItem.types.find((type) => type.startsWith('image/'));
        if (imageType) {
          const blob = await clipboardItem.getType(imageType);
          const inserted = await setEditImageFromFile(new File([blob], 'clipboard-image', { type: imageType }));
          if (inserted) {
            hidePasteFallback();
            toast('Изображение вставлено из буфера', 'success');
          }
          return;
        }

        if (clipboardItem.types.includes('text/html')) {
          const html = await (await clipboardItem.getType('text/html')).text();
          const pasted = await tryImageFromHtml(html);
          if (pasted) {
            hidePasteFallback();
            toast('Изображение вставлено из буфера', 'success');
            return;
          }
        }
      }
      toast('В буфере обмена нет изображения', 'error');
    } catch (error) {
      console.warn('Clipboard image read failed', error);
      showPasteFallback();
      toast('Браузер не разрешил прямой доступ. Удерживай поле ниже и выбери «Вставить».', 'error');
    }
  }

  function showPasteFallback() {
    const panel = $('#mobilePasteFallback');
    const target = $('#pasteTarget');
    panel.classList.remove('hidden');
    target.innerHTML = '';
    setTimeout(() => target.focus({ preventScroll: true }), 50);
  }

  function hidePasteFallback() {
    const panel = $('#mobilePasteFallback');
    const target = $('#pasteTarget');
    if (!panel || !target) return;
    panel.classList.add('hidden');
    target.innerHTML = '';
  }

  async function handlePastedImage(event) {
    const item = [...(event.clipboardData?.items || [])].find((entry) => entry.type.startsWith('image/'));
    if (item) {
      event.preventDefault();
      const inserted = await setEditImageFromFile(item.getAsFile());
      if (inserted) {
        hidePasteFallback();
        toast('Изображение вставлено из буфера', 'success');
      }
      return;
    }

    const html = event.clipboardData?.getData('text/html') || '';
    if (html) {
      const pasted = await tryImageFromHtml(html);
      if (pasted) {
        event.preventDefault();
        hidePasteFallback();
        toast('Изображение вставлено из буфера', 'success');
      }
    }
  }

  async function handlePasteTargetInput() {
    const image = $('#pasteTarget').querySelector('img');
    if (!image?.src) return;
    const pasted = await tryImageFromSource(image.src);
    if (pasted) {
      hidePasteFallback();
      toast('Изображение вставлено из буфера', 'success');
    }
  }

  async function tryImageFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const source = doc.querySelector('img')?.src;
    return source ? tryImageFromSource(source) : false;
  }

  async function tryImageFromSource(source) {
    if (!source || (!source.startsWith('data:image/') && !source.startsWith('blob:'))) return false;
    try {
      const blob = await (await fetch(source)).blob();
      if (!blob.type.startsWith('image/')) return false;
      return await setEditImageFromFile(new File([blob], 'clipboard-image', { type: blob.type }));
    } catch (error) {
      console.warn('Could not read pasted image source', error);
      return false;
    }
  }

  async function setEditImageFromFile(file) {
    try {
      const processed = await resizeImage(file, 1280, 900, 0.84);
      state.editImageBytes = processed.bytes;
      state.editImageMime = processed.mime;
      state.editImageRemoved = false;
      renderEditImagePreview();
      return true;
    } catch (error) {
      toast(error.message || 'Не удалось обработать изображение', 'error');
      return false;
    }
  }

  function removeEditImage() {
    state.editImageBytes = null;
    state.editImageMime = '';
    state.editImageRemoved = true;
    renderEditImagePreview();
  }

  function renderEditImagePreview() {
    clearPreviewImageUrl();
    const box = $('#editImagePreview');
    if (state.editImageBytes?.length) {
      state.previewImageUrl = URL.createObjectURL(new Blob([state.editImageBytes], { type: state.editImageMime || 'image/jpeg' }));
      box.innerHTML = `<img src="${state.previewImageUrl}" alt="Предпросмотр изображения">`;
    } else {
      box.innerHTML = '<div><span>✦</span><small>Изображение-якорь</small></div>';
    }
  }

  function clearPreviewImageUrl() {
    if (state.previewImageUrl) URL.revokeObjectURL(state.previewImageUrl);
    state.previewImageUrl = null;
  }

  function openGoogleImages() {
    const word = $('#editWord').value.trim();
    if (!word) return toast('Сначала введи греческое слово или фразу', 'error');
    const query = encodeURIComponent(`${word} εικόνα`);
    window.open(`https://www.google.com/search?tbm=isch&q=${query}`, '_blank', 'noopener,noreferrer');
  }

  async function resizeImage(file, maxWidth, maxHeight, quality) {
    if (!file?.type?.startsWith('image/')) throw new Error('Выбранный файл не является изображением');
    if (file.size > 20 * 1024 * 1024) throw new Error('Изображение слишком большое: максимум 20 МБ');
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    const finalBlob = blob || file;
    return { bytes: new Uint8Array(await finalBlob.arrayBuffer()), mime: finalBlob.type || file.type || 'image/jpeg' };
  }

  async function handleCsvFile(file) {
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      let text;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      } catch {
        text = new TextDecoder('windows-1251').decode(buffer);
      }
      const parsed = parseCsvToCards(text);
      state.csvRows = parsed.cards;
      state.csvFileName = file.name;
      if (!$('#importDeckName').value.trim()) $('#importDeckName').value = file.name.replace(/\.(csv|tsv)$/i, '');
      renderCsvPreview(parsed);
      $('#importCsvButton').disabled = !parsed.cards.length;
    } catch (error) {
      state.csvRows = [];
      $('#importCsvButton').disabled = true;
      $('#csvPreview').classList.add('hidden');
      toast(error.message || 'Не удалось прочитать CSV', 'error');
    }
  }

  function parseCsvToCards(text) {
    const clean = text.replace(/^\uFEFF/, '').trim();
    if (!clean) throw new Error('CSV-файл пуст');
    const delimiter = detectDelimiter(clean);
    const table = parseDelimited(clean, delimiter).filter((row) => row.some((cell) => String(cell).trim()));
    if (table.length < 2) throw new Error('В CSV нет строк с карточками');
    const headers = table[0].map(normalizeHeader);
    const aliases = {
      word: ['слово / фраза', 'слово/фраза', 'word / phrase', 'word'],
      word_transcription: ['транскрипция слова', 'word transcription'],
      word_translation: ['перевод слова', 'word translation'],
      example_el: ['пример на греческом', 'greek example', 'example in greek'],
      example_transcription: ['транскрипция', 'транскрипция примера', 'example transcription'],
      example_translation: ['перевод примера', 'example translation'],
      hint: ['подсказка / нюанс', 'подсказка/нюанс', 'подсказка', 'hint', 'note']
    };
    const index = {};
    Object.entries(aliases).forEach(([key, values]) => {
      index[key] = headers.findIndex((header) => values.includes(header));
    });
    if (index.word < 0) throw new Error('Не найдена обязательная колонка «Слово / фраза»');
    const cards = table.slice(1).map((row) => ({
      word: getCell(row, index.word),
      word_transcription: getCell(row, index.word_transcription),
      word_translation: getCell(row, index.word_translation),
      example_el: getCell(row, index.example_el),
      example_transcription: getCell(row, index.example_transcription),
      example_translation: getCell(row, index.example_translation),
      hint: getCell(row, index.hint)
    })).filter((card) => card.word);
    if (!cards.length) throw new Error('После заголовка не найдено ни одного слова');
    const missing = Object.entries(index).filter(([key, value]) => key !== 'word' && value < 0).map(([key]) => key);
    return { cards, delimiter, missing };
  }

  function renderCsvPreview(parsed) {
    const container = $('#csvPreview');
    container.classList.remove('hidden');
    const delimiterName = parsed.delimiter === '\t' ? 'TSV' : parsed.delimiter === ';' ? 'CSV с ;' : 'CSV с ,';
    const warning = parsed.missing.length ? ` · ${parsed.missing.length} необязательных колонок не найдено` : '';
    container.innerHTML = `<div class="csv-preview-head"><span>${escapeHtml(state.csvFileName)}</span><span>${parsed.cards.length} строк · ${delimiterName}${warning}</span></div>${parsed.cards.slice(0, 5).map((card) => `<div class="csv-preview-row"><strong>${escapeHtml(card.word)}</strong><span>${escapeHtml(card.example_el || '—')}</span><span>${escapeHtml(card.word_translation || '—')}</span></div>`).join('')}`;
  }

  async function importCsvRows() {
    const deckName = $('#importDeckName').value.trim();
    if (!deckName) return toast('Укажи название сборника', 'error');
    if (!state.csvRows.length) return toast('Сначала выбери CSV-файл', 'error');
    LexiDB.importCards(deckName, state.csvRows);
    state.csvRows = [];
    state.csvFileName = '';
    $('#csvFileInput').value = '';
    $('#importDeckName').value = '';
    $('#csvPreview').classList.add('hidden');
    $('#importCsvButton').disabled = true;
    await refreshAll();
    toast(`Сборник «${deckName}» импортирован`, 'success');
    showPage('decks');
  }

  function detectDelimiter(text) {
    const sample = text.split(/\r?\n/).slice(0, 5).join('\n');
    const candidates = ['\t', ';', ','];
    const scores = candidates.map((delimiter) => ({ delimiter, count: countOutsideQuotes(sample, delimiter) }));
    scores.sort((a, b) => b.count - a.count);
    return scores[0].count ? scores[0].delimiter : '\t';
  }

  function countOutsideQuotes(text, delimiter) {
    let quoted = false;
    let count = 0;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') i += 1;
        else quoted = !quoted;
      } else if (!quoted && char === delimiter) count += 1;
    }
    return count;
  }

  function parseDelimited(text, delimiter) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        row.push(cell);
        cell = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[i + 1] === '\n') i += 1;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += char;
      }
    }
    row.push(cell);
    rows.push(row);
    return rows;
  }

  function normalizeHeader(value) {
    return String(value || '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function getCell(row, position) {
    return position >= 0 ? String(row[position] ?? '').trim() : '';
  }

  function renderDatabaseInfo() {
    const info = LexiDB.getDatabaseInfo();
    $('#databaseInfo').innerHTML = `<div><strong>${info.decks}</strong><small>сборников</small></div><div><strong>${info.cards}</strong><small>карточек</small></div><div><strong>${formatBytes(info.bytes)}</strong><small>размер базы</small></div>`;
  }

  function exportDatabase(prefix = 'lexianchor') {
    const bytes = LexiDB.exportBytes();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(new Blob([bytes], { type: 'application/x-sqlite3' }), `${prefix}-${stamp}.sqlite`);
  }

  async function handleDatabaseFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const ok = await confirmAction('Заменить локальную базу?', `Файл «${file.name}» заменит текущие данные на этом устройстве. Перед заменой будет скачана резервная копия.`, 'Заменить');
    if (!ok) return;
    try {
      exportDatabase('lexianchor-backup');
      await LexiDB.replaceDatabase(await file.arrayBuffer());
      state.activeDeckId = null;
      resetStudyUi();
      await refreshAll();
      toast('SQLite-база загружена', 'success');
    } catch (error) {
      toast(`Не удалось загрузить базу: ${error.message}`, 'error');
    }
  }

  function setDbStatus(text, saving) {
    const node = $('#dbStatus');
    if (!node) return;
    node.lastChild.textContent = text;
    node.style.opacity = saving ? '.7' : '1';
  }

  async function installPwa() {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    $('#installButton').classList.add('hidden');
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker:', error));
    }
  }

  function confirmAction(title, text, okLabel = 'Продолжить') {
    return new Promise((resolve) => {
      const dialog = $('#confirmDialog');
      $('#confirmTitle').textContent = title;
      $('#confirmText').textContent = text;
      $('#confirmOk').textContent = okLabel;
      const cleanup = (value) => {
        dialog.close();
        resolve(value);
      };
      $('#confirmOk').onclick = (event) => {
        event.preventDefault();
        cleanup(true);
      };
      $('#confirmCancel').onclick = (event) => {
        event.preventDefault();
        cleanup(false);
      };
      dialog.oncancel = () => resolve(false);
      dialog.showModal();
    });
  }

  function toast(message, type = 'success') {
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = message;
    $('#toastContainer').appendChild(node);
    setTimeout(() => node.remove(), 3600);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function highlightTerm(text, term) {
    if (!term) return escapeHtml(text);
    const pattern = new RegExp(`(${escapeRegExp(term)})`, 'giu');
    return String(text).split(pattern).map((part, index) => index % 2 ? `<strong>${escapeHtml(part)}</strong>` : escapeHtml(part)).join('');
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  }

  function formatInterval(days) {
    if (days < 1 / 24) return `${Math.round(days * 1440)} мин`;
    if (days < 1) return `${Math.round(days * 24)} ч`;
    if (days < 30) {
      const rounded = Math.max(1, Math.round(days));
      return `${rounded} ${plural(rounded, 'день', 'дня', 'дней')}`;
    }
    if (days < 365) return `${Math.round(days / 30)} мес`;
    return `${(days / 365).toFixed(1)} г`;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('ru-RU').format(value || 0);
  }

  function plural(number, one, few, many) {
    const n = Math.abs(number) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }

  function emptyState(title, text) {
    return `<div class="empty-state"><div class="empty-icon">Λ</div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`;
  }
})();
