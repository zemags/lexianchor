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
    deferredInstallPrompt: null,
    studyMode: 'flashcards',
    study: null,
    lastQuizMistakes: [],
    lastQuizConfig: null,
    lastSwipeMistakes: [],
    lastSwipeConfig: null,
    lastMistakeMode: 'quiz',
    quizImageUrl: null,
    swipeImageUrl: null,
    swipeFeedbackTimer: null,
    swipeGesture: null,
    quizAutoTimer: null,
    cardImageUrl: null,
    previewImageUrl: null,
    editImageBytes: null,
    editImageMime: '',
    editImageRemoved: false,
    editImageSource: '',
    editImageAuthor: '',
    editImageSourceUrl: '',
    editImageSearchQueryEn: '',
    editImageSearchQueryEnSource: '',
    editImageSearchTranslationProvider: '',
    pendingImageSource: null,
    imageLab: null,
    pexels: {
      context: 'card',
      query: '',
      page: 1,
      totalResults: 0,
      results: [],
      loading: false,
      originalQuery: '',
      translationProvider: '',
      translationFromCache: false
    },
    translator: {
      instance: null,
      promise: null,
      downloadProgress: 0
    }
  };

  const PEXELS_KEY_STORAGE = 'lexianchor.pexelsApiKey';
  const MYMEMORY_EMAIL_STORAGE = 'lexianchor.myMemoryEmail';
  const AUTO_TRANSLATE_STORAGE = 'lexianchor.autoTranslateImageQueries';

  const pageMeta = {
    dashboard: ['ТВОЙ ПРОГРЕСС', 'Обзор'],
    decks: ['ТВОЯ КОЛЛЕКЦИЯ', 'Сборники'],
    study: ['ФОКУС-СЕССИЯ', 'Тренировка'],
    import: ['ДАННЫЕ И ПЕРЕНОС', 'Импорт и база']
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
      $('.boot-loader')?.remove();
    }
  }

  function bindEvents() {
    document.addEventListener('click', handleGlobalClick);
    $('#quickStudyButton').addEventListener('click', () => showPage('study'));
    $('#settingsButton').addEventListener('click', openSettingsDialog);
    $('#closeSettingsDialog').addEventListener('click', closeSettingsDialog);
    $('#cancelSettingsButton').addEventListener('click', closeSettingsDialog);
    $('#settingsForm').addEventListener('submit', saveSettings);
    $('#togglePexelsKey').addEventListener('click', togglePexelsKeyVisibility);
    $('#testPexelsKey').addEventListener('click', testPexelsKey);
    $('#clearPexelsKey').addEventListener('click', clearPexelsKey);
    $('#testTranslationButton').addEventListener('click', testTranslationIntegration);
    $('#autoTranslateToggle').addEventListener('change', updateTranslatorBadge);
    $('#newDeckButton').addEventListener('click', createDeckFlow);
    $('#newCardButton').addEventListener('click', () => openCardDialog());
    $('#imageLabAllButton').addEventListener('click', () => openImageLab([]));
    $('#cardsImageLabButton').addEventListener('click', () => openImageLab(state.activeDeckId ? [state.activeDeckId] : []));
    $('#closeCardsPanel').addEventListener('click', closeCardsPanel);
    $('#deckSearch').addEventListener('input', renderDecks);

    $$('.mode-option').forEach((button) => button.addEventListener('click', () => setStudyMode(button.dataset.studyMode)));
    $('#selectAllDecks').addEventListener('click', toggleAllStudyDecks);
    $('#studyDeckList').addEventListener('change', updateSelectedDeckCount);
    $('#startStudyButton').addEventListener('click', startStudy);
    $('#revealButton').addEventListener('click', revealCard);
    $('#flashcard').addEventListener('click', revealCard);
    $('#exitStudyButton').addEventListener('click', finishStudyEarly);
    $('#restartStudyButton').addEventListener('click', resetStudyUi);
    $('#repeatMistakesButton').addEventListener('click', repeatMistakes);
    $('#quizNextButton').addEventListener('click', nextQuizQuestion);
    $('#quizAnswers').addEventListener('click', handleQuizAnswerClick);
    $('#swipeLeftButton').addEventListener('click', () => answerSwipe(false));
    $('#swipeRightButton').addEventListener('click', () => answerSwipe(true));
    $('#swipeCard').addEventListener('pointerdown', handleSwipePointerDown);
    $('#swipeCard').addEventListener('pointermove', handleSwipePointerMove);
    $('#swipeCard').addEventListener('pointerup', handleSwipePointerUp);
    $('#swipeCard').addEventListener('pointercancel', handleSwipePointerCancel);
    $('#speakButton').addEventListener('click', (event) => {
      event.stopPropagation();
      speakCurrentWord();
    });
    $('#cardImageAttribution').addEventListener('click', (event) => event.stopPropagation());
    $$('.rating').forEach((button) => button.addEventListener('click', () => rateCurrentCard(Number(button.dataset.rating))));

    $('#cardForm').addEventListener('submit', saveCardFromDialog);
    $('#closeCardDialog').addEventListener('click', closeCardDialog);
    $('#cancelCardButton').addEventListener('click', closeCardDialog);
    $('#deleteCardButton').addEventListener('click', deleteCurrentCard);
    $('#cardImageInput').addEventListener('change', handleImageSelection);
    $('#removeImageButton').addEventListener('click', removeEditImage);
    $('#pexelsCardButton').addEventListener('click', () => openPexelsDialog('card'));
    $('#googleImagesButton').addEventListener('click', openGoogleImages);
    $('#pasteImageButton').addEventListener('click', () => readClipboardImage(setEditImageFromFile, showPasteFallback));
    $('#closePasteFallback').addEventListener('click', hidePasteFallback);
    $('#pasteTarget').addEventListener('input', handlePasteTargetInput);
    $('#cardDialog').addEventListener('paste', handlePastedImage);
    $('#editImageSearchQuery').addEventListener('input', clearEditTranslationCache);
    $('#editWordTranslation').addEventListener('input', () => {
      if (!$('#editImageSearchQuery').value.trim()) clearEditTranslationCache();
    });

    $('#closeImageLab').addEventListener('click', closeImageLab);
    $('#imageLabPexels').addEventListener('click', () => openPexelsDialog('lab'));
    $('#imageLabGoogle').addEventListener('click', openImageLabGoogle);
    $('#imageLabPaste').addEventListener('click', () => readClipboardImage(setImageLabImageFromFile, showImageLabPasteFallback));
    $('#imageLabFile').addEventListener('change', handleImageLabFile);
    $('#imageLabPasteTarget').addEventListener('input', handleImageLabPasteTargetInput);
    $('#imageLabDialog').addEventListener('paste', handleImageLabPaste);
    $('#imageLabQuery').addEventListener('input', clearImageLabTranslationCache);
    $('#imageLabSkip').addEventListener('click', skipImageLabCard);
    $('#imageLabRemove').addEventListener('click', clearImageLabImage);
    $('#imageLabSaveNext').addEventListener('click', saveImageLabAndNext);
    $('#imageLabAutoRemaining').addEventListener('click', autoFillImageLabRemaining);

    $('#closePexelsDialog').addEventListener('click', closePexelsDialog);
    $('#pexelsSearchButton').addEventListener('click', () => searchPexels(true));
    $('#pexelsSearchInput').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        searchPexels(true);
      }
    });
    $('#pexelsLoadMore').addEventListener('click', () => searchPexels(false));
    $('#pexelsUseFirst').addEventListener('click', useFirstPexelsResult);
    $('#pexelsResults').addEventListener('click', handlePexelsResultClick);

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
    if (deckAction) {
      handleDeckAction(deckAction.dataset.deckAction, Number(deckAction.dataset.deckId));
      return;
    }
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
    const dbInfo = LexiDB.getDatabaseInfo();
    const quiz = LexiDB.getQuizStats(30);
    const imageCoverage = dbInfo.cards ? Math.round((dbInfo.images / dbInfo.cards) * 100) : 0;
    const cards = [
      ['Карточек всего', formatNumber(stats.total), '▦'],
      ['На сегодня', formatNumber(stats.due), '◷'],
      ['Серия дней', `${stats.streak} ${plural(stats.streak, 'день', 'дня', 'дней')}`, '⚡'],
      ['С картинками', `${imageCoverage}%`, '✦'],
      ['Тесты за 30 дней', quiz.total ? `${quiz.accuracy}%` : '—', '4']
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
      container.innerHTML = emptyState(query ? 'Ничего не найдено' : 'Нет сборников', query ? 'Попробуй другой запрос.' : 'Создай сборник или импортируй CSV.');
      return;
    }
    container.innerHTML = visible.map((deck) => {
      const learnedPct = deck.total ? Math.round((deck.learned / deck.total) * 100) : 0;
      const missingImages = LexiDB.getCardsWithoutImages([deck.id]).length;
      return `<article class="deck-card">
        <div class="deck-card-top"><div class="deck-icon">${escapeHtml(deck.name.charAt(0).toUpperCase() || 'Λ')}</div><div class="deck-menu"><button data-deck-action="rename" data-deck-id="${deck.id}" title="Переименовать">✎</button><button data-deck-action="delete" data-deck-id="${deck.id}" title="Удалить">×</button></div></div>
        <h3>${escapeHtml(deck.name)}</h3><p>${deck.total} ${plural(deck.total, 'карточка', 'карточки', 'карточек')}</p>
        <div class="deck-card-stats"><div class="deck-stat"><strong>${deck.due}</strong><small>сегодня</small></div><div class="deck-stat"><strong>${deck.learned}</strong><small>изучено</small></div><div class="deck-stat"><strong>${learnedPct}%</strong><small>прогресс</small></div></div>
        <div class="deck-actions"><button class="button surface compact" data-deck-action="cards" data-deck-id="${deck.id}">Карточки</button><button class="button primary compact" data-deck-action="study" data-deck-id="${deck.id}">Учить</button><button class="button secondary compact deck-image-action" data-deck-action="images" data-deck-id="${deck.id}">✦ Картинки · ${missingImages}</button></div>
      </article>`;
    }).join('');
  }

  async function createDeckFlow() {
    const name = prompt('Название нового сборника:');
    if (!name?.trim()) return;
    LexiDB.createDeck(name);
    await refreshAll();
    toast('Сборник создан');
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
      renderStudyDecks([deckId]);
    } else if (action === 'images') {
      openImageLab([deckId]);
    } else if (action === 'rename') {
      const nextName = prompt('Новое название сборника:', deck.name);
      if (!nextName?.trim()) return;
      LexiDB.renameDeck(deckId, nextName);
      await refreshAll();
      toast('Сборник переименован');
    } else if (action === 'delete') {
      const ok = await confirmAction('Удалить сборник?', `Сборник «${deck.name}», его карточки и история будут удалены.`, 'Удалить');
      if (!ok) return;
      LexiDB.deleteDeck(deckId);
      if (state.activeDeckId === deckId) state.activeDeckId = null;
      closeCardsPanel();
      await refreshAll();
      toast('Сборник удалён');
    }
  }

  function closeCardsPanel() {
    state.activeDeckId = null;
    $('#cardsPanel').classList.add('hidden');
  }

  function renderCardsPanel(deckId) {
    const deck = state.decks.find((item) => item.id === deckId);
    if (!deck) return;
    $('#cardsPanelTitle').textContent = deck.name;
    const cards = LexiDB.getCards(deckId);
    $('#cardsTable').innerHTML = cards.length ? cards.map((card) => `
      <div class="card-row"><strong>${escapeHtml(card.word)}</strong><span>${escapeHtml(card.example_el || '—')}</span><span>${escapeHtml(card.word_translation || '—')} ${card.image_blob?.length ? '· ✦' : '· без картинки'}</span><button class="button surface compact" data-card-id="${card.id}">Изменить</button></div>
    `).join('') : emptyState('В сборнике пока пусто', 'Добавь карточку вручную или импортируй CSV.');
  }

  function setStudyMode(mode) {
    state.studyMode = ['flashcards', 'quiz', 'swipe'].includes(mode) ? mode : 'flashcards';
    $$('.mode-option').forEach((button) => button.classList.toggle('active', button.dataset.studyMode === state.studyMode));
    $('#flashcardOptions').classList.toggle('hidden', state.studyMode !== 'flashcards');
    $('#quizOptions').classList.toggle('hidden', state.studyMode !== 'quiz');
    $('#swipeOptions').classList.toggle('hidden', state.studyMode !== 'swipe');
    const labels = { flashcards: 'Начать тренировку', quiz: 'Начать тест', swipe: 'Начать свайп-тренировку' };
    $('#startStudyButton').textContent = labels[state.studyMode];
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
    clearTimeout(state.quizAutoTimer);
    const deckIds = $$('#studyDeckList input:checked').map((input) => Number(input.value));
    const limit = Math.max(1, Math.min(Number($('#studyLimit').value || 30), 500));
    if (!deckIds.length) return toast('Выбери хотя бы один сборник', 'error');
    if (state.studyMode === 'quiz') startQuiz(deckIds, limit);
    else if (state.studyMode === 'swipe') startSwipeStudy(deckIds, limit);
    else startFlashcardStudy(deckIds, limit);
  }

  function startFlashcardStudy(deckIds, limit) {
    const dueOnly = $('#dueOnlyToggle').checked;
    const cards = LexiDB.getStudyCards(deckIds, dueOnly, limit);
    if (!cards.length) {
      toast(dueOnly ? 'Нет карточек по расписанию. Отключи этот переключатель.' : 'В выбранных сборниках нет карточек.', 'error');
      return;
    }
    state.study = {
      mode: 'flashcards',
      queue: cards.map((card) => ({ ...card, _relearning: false })),
      relearningQueue: [],
      initialTotal: cards.length,
      completed: 0,
      answers: 0,
      correct: 0,
      again: 0,
      startedAt: Date.now(),
      flipped: false
    };
    openStudySession('flashcards');
    renderCurrentCard();
  }

  function startQuiz(deckIds, limit, forcedCards = null) {
    const direction = $('#quizDirection').value;
    const affectsSrs = $('#quizAffectsSrs').checked;
    const autoNext = $('#quizAutoNext').checked;
    const allSelectedCards = deckIds.flatMap((id) => LexiDB.getCards(id));
    const field = direction === 'el-ru' ? 'word_translation' : 'word';
    const promptField = direction === 'el-ru' ? 'word' : 'word_translation';
    const validPool = allSelectedCards.filter((card) => String(card[field] || '').trim() && String(card[promptField] || '').trim());
    const uniqueAnswers = new Set(validPool.map((card) => normalizeAnswer(card[field])));
    if (uniqueAnswers.size < 4) {
      toast('Для теста нужно минимум 4 карточки с уникальными ответами в выбранных сборниках.', 'error');
      return;
    }
    let questions = forcedCards ? forcedCards.filter((card) => validPool.some((item) => item.id === card.id)) : shuffle([...validPool]).slice(0, limit);
    if (!questions.length) return toast('Нет подходящих карточек для теста', 'error');
    state.study = {
      mode: 'quiz',
      queue: questions,
      pool: validPool,
      index: 0,
      initialTotal: questions.length,
      answers: 0,
      correct: 0,
      wrongCards: [],
      startedAt: Date.now(),
      direction,
      affectsSrs,
      autoNext,
      answered: false,
      currentOptions: []
    };
    state.lastQuizConfig = { deckIds: [...deckIds], direction, affectsSrs, autoNext };
    openStudySession('quiz');
    renderQuizQuestion();
  }

  function buildSwipeTruthPlan(count) {
    const matches = Math.ceil(count / 2);
    return shuffle(Array.from({ length: count }, (_, index) => index < matches));
  }

  function startSwipeStudy(deckIds, limit, forcedCards = null) {
    const direction = $('#swipeDirection').value;
    const affectsSrs = $('#swipeAffectsSrs').checked;
    const allSelectedCards = deckIds.flatMap((id) => LexiDB.getCards(id));
    const answerField = direction === 'el-ru' ? 'word_translation' : 'word';
    const promptField = direction === 'el-ru' ? 'word' : 'word_translation';
    const validPool = allSelectedCards.filter((card) => String(card[answerField] || '').trim() && String(card[promptField] || '').trim());
    const uniqueAnswers = new Set(validPool.map((card) => normalizeAnswer(card[answerField])));
    if (uniqueAnswers.size < 2) {
      toast('Для свайп-тренировки нужны минимум 2 карточки с разными переводами.', 'error');
      return;
    }
    const questions = forcedCards
      ? forcedCards.filter((card) => validPool.some((item) => item.id === card.id))
      : shuffle([...validPool]).slice(0, limit);
    if (!questions.length) return toast('Нет подходящих карточек для свайп-тренировки', 'error');
    state.study = {
      mode: 'swipe',
      queue: questions,
      pool: validPool,
      truthPlan: buildSwipeTruthPlan(questions.length),
      index: 0,
      initialTotal: questions.length,
      answers: 0,
      correct: 0,
      wrongCards: [],
      startedAt: Date.now(),
      direction,
      affectsSrs,
      currentPair: null,
      transitioning: false
    };
    state.lastSwipeConfig = { deckIds: [...deckIds], direction, affectsSrs };
    openStudySession('swipe');
    renderSwipeQuestion();
  }

  function openStudySession(mode) {
    $('#studySetup').classList.add('hidden');
    $('#studyFinished').classList.add('hidden');
    $('#studySession').classList.remove('hidden');
    $('#flashcardSession').classList.toggle('hidden', mode !== 'flashcards');
    $('#quizSession').classList.toggle('hidden', mode !== 'quiz');
    $('#swipeSession').classList.toggle('hidden', mode !== 'swipe');
  }

  function releaseDueRelearningCards(study) {
    if (!study?.relearningQueue?.length) return;
    const now = Date.now();
    const ready = [];
    const waiting = [];
    study.relearningQueue.forEach((item) => {
      if (new Date(item.dueAt).getTime() <= now) ready.push(item);
      else waiting.push(item);
    });
    study.relearningQueue = waiting;
    ready
      .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
      .forEach((item) => {
        const refreshed = LexiDB.getCard(item.cardId);
        if (refreshed) study.queue.push({ ...refreshed, _relearning: true });
      });
  }

  function renderCurrentCard() {
    const study = state.study;
    if (!study || study.mode !== 'flashcards') {
      finishStudy();
      return;
    }
    releaseDueRelearningCards(study);
    if (!study.queue.length) {
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
    $('#cardHint').textContent = card.hint || '';
    $('#cardHintBox').classList.toggle('hidden', !card.hint);
    renderStudyImage(card);

    const visibleNumber = Math.min(study.completed + 1, study.initialTotal);
    setSessionHeader(visibleNumber, study.initialTotal, card.deck_name, study.completed, study.correct);
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
      state.cardImageUrl = bytesToObjectUrl(card.image_blob, card.image_mime);
      box.innerHTML = `<img src="${state.cardImageUrl}" alt="Визуальный якорь для ${escapeHtml(card.word)}">`;
      renderImageAttribution($('#cardImageAttribution'), card.image_source, card.image_author, card.image_source_url);
    } else {
      box.innerHTML = '<div class="image-placeholder"><span>✦</span><small>У карточки пока нет визуального якоря</small></div>';
      renderImageAttribution($('#cardImageAttribution'), '', '', '');
    }
  }

  function revealCard() {
    if (!state.study || state.study.mode !== 'flashcards' || !state.study.queue.length) return;
    state.study.flipped = !state.study.flipped;
    $('#flashcard').classList.toggle('flipped', state.study.flipped);
    $('#revealActions').classList.toggle('hidden', state.study.flipped);
    $('#ratingActions').classList.toggle('hidden', !state.study.flipped);
  }

  async function rateCurrentCard(rating) {
    if (!state.study?.flipped || state.study.mode !== 'flashcards' || !state.study.queue.length) return;
    const study = state.study;
    const card = study.queue.shift();
    const schedule = LexiDB.rateCard(card.id, rating);
    study.answers += 1;

    if (!card._relearning) study.completed += 1;

    if (rating === 0) {
      study.again += 1;
      study.relearningQueue = (study.relearningQueue || []).filter((item) => item.cardId !== card.id);
      study.relearningQueue.push({ cardId: card.id, dueAt: schedule.dueAt });
    } else {
      study.correct += 1;
    }

    renderCurrentCard();
  }

  function renderQuizQuestion() {
    const study = state.study;
    if (!study || study.mode !== 'quiz' || study.index >= study.queue.length) {
      finishStudy();
      return;
    }
    clearTimeout(state.quizAutoTimer);
    clearTimeout(state.swipeFeedbackTimer);
    revokeQuizImage();
    revokeSwipeImage();
    const card = study.queue[study.index];
    study.answered = false;
    study.currentOptions = buildQuizOptions(card, study.pool, study.direction);
    const prompt = study.direction === 'el-ru' ? card.word : card.word_translation;
    const promptTranscription = study.direction === 'el-ru' ? card.word_transcription : '';
    $('#quizDirectionBadge').textContent = study.direction === 'el-ru' ? 'EL → RU' : 'RU → EL';
    $('#quizDeckBadge').textContent = card.deck_name;
    $('#quizPrompt').textContent = prompt;
    $('#quizPromptTranscription').textContent = promptTranscription || '';
    $('#quizFeedback').className = 'quiz-feedback hidden';
    $('#quizFeedback').innerHTML = '';
    $('#quizNextButton').classList.add('hidden');
    $('#quizAnswers').innerHTML = study.currentOptions.map((option, index) => `<button type="button" class="quiz-answer" data-option-index="${index}"><span>${index + 1}</span><strong>${escapeHtml(option.text)}</strong></button>`).join('');
    setSessionHeader(study.index + 1, study.initialTotal, card.deck_name, study.index, study.correct);
  }

  function buildQuizOptions(card, pool, direction) {
    const answerField = direction === 'el-ru' ? 'word_translation' : 'word';
    const correctText = String(card[answerField] || '').trim();
    const used = new Set([normalizeAnswer(correctText)]);
    const distractors = [];
    for (const candidate of shuffle([...pool])) {
      if (candidate.id === card.id) continue;
      const text = String(candidate[answerField] || '').trim();
      const key = normalizeAnswer(text);
      if (!text || used.has(key)) continue;
      used.add(key);
      distractors.push({ text, correct: false });
      if (distractors.length === 3) break;
    }
    return shuffle([{ text: correctText, correct: true }, ...distractors]);
  }

  function handleQuizAnswerClick(event) {
    const button = event.target.closest('[data-option-index]');
    if (!button) return;
    answerQuiz(Number(button.dataset.optionIndex));
  }

  function answerQuiz(optionIndex) {
    const study = state.study;
    if (!study || study.mode !== 'quiz' || study.answered) return;
    const option = study.currentOptions[optionIndex];
    if (!option) return;
    const card = study.queue[study.index];
    study.answered = true;
    study.answers += 1;
    if (option.correct) study.correct += 1;
    else if (!study.wrongCards.some((item) => item.id === card.id)) study.wrongCards.push(card);

    LexiDB.recordQuizAnswer(card.id, option.correct, study.direction);
    if (study.affectsSrs) LexiDB.rateCard(card.id, option.correct ? 1 : 0);

    $$('#quizAnswers .quiz-answer').forEach((button, index) => {
      button.disabled = true;
      const answer = study.currentOptions[index];
      if (answer.correct) button.classList.add('correct');
      else if (index === optionIndex) button.classList.add('wrong');
      else button.classList.add('dimmed');
    });
    renderQuizFeedback(card, option.correct);
    $('#sessionScore').textContent = `${study.correct} ✓`;
    $('#quizNextButton').classList.remove('hidden');
    if (study.autoNext) state.quizAutoTimer = setTimeout(nextQuizQuestion, 2000);
  }

  function renderQuizFeedback(card, correct) {
    const panel = $('#quizFeedback');
    panel.className = `quiz-feedback ${correct ? 'success' : 'error'}`;
    let image = '<div class="feedback-image image-placeholder"><span>✦</span></div>';
    if (card.image_blob?.length) {
      state.quizImageUrl = bytesToObjectUrl(card.image_blob, card.image_mime);
      image = `<img class="feedback-image" src="${state.quizImageUrl}" alt="${escapeHtml(card.word)}">`;
    }
    panel.innerHTML = `
      <div class="feedback-title"><span>${correct ? '✓' : '×'}</span><strong>${correct ? 'Правильно' : 'Неправильно'}</strong></div>
      <div class="feedback-details">${image}<div class="feedback-word"><strong>${escapeHtml(card.word)}</strong><span>${escapeHtml(card.word_transcription || '')}</span><div class="feedback-translation">${escapeHtml(card.word_translation || '—')}</div>${card.example_el || card.example_translation ? `<div class="feedback-example">${highlightTerm(card.example_el || '—', card.word)}${card.example_transcription ? `<small>${escapeHtml(card.example_transcription)}</small>` : ''}${card.example_translation ? `<small>${escapeHtml(card.example_translation)}</small>` : ''}</div>` : ''}${card.hint ? `<div class="feedback-hint">✦ ${escapeHtml(card.hint)}</div>` : ''}</div></div>
    `;
  }

  function nextQuizQuestion() {
    const study = state.study;
    if (!study || study.mode !== 'quiz' || !study.answered) return;
    clearTimeout(state.quizAutoTimer);
    study.index += 1;
    renderQuizQuestion();
  }

  function buildSwipePair(card, pool, direction, requestedMatch) {
    const answerField = direction === 'el-ru' ? 'word_translation' : 'word';
    const correctAnswer = String(card[answerField] || '').trim();
    let isMatch = Boolean(requestedMatch);
    let candidateCard = card;
    if (!isMatch) {
      const candidates = pool.filter((candidate) => candidate.id !== card.id && normalizeAnswer(candidate[answerField]) !== normalizeAnswer(correctAnswer));
      if (candidates.length) candidateCard = candidates[Math.floor(Math.random() * candidates.length)];
      else isMatch = true;
    }
    return {
      card,
      candidateCard,
      isMatch,
      promptText: direction === 'el-ru' ? String(card.word || '').trim() : String(card.word_translation || '').trim(),
      correctAnswer,
      shownAnswer: String(candidateCard[answerField] || '').trim()
    };
  }

  function renderSwipeQuestion() {
    const study = state.study;
    if (!study || study.mode !== 'swipe' || study.index >= study.queue.length) {
      finishStudy();
      return;
    }
    clearTimeout(state.swipeFeedbackTimer);
    revokeSwipeImage();
    state.swipeGesture = null;
    const card = study.queue[study.index];
    const pair = buildSwipePair(card, study.pool, study.direction, study.truthPlan[study.index]);
    study.currentPair = pair;
    study.transitioning = false;

    const sourceGreek = study.direction === 'el-ru';
    $('#swipeDirectionBadge').textContent = sourceGreek ? 'EL → RU' : 'RU → EL';
    $('#swipeDeckBadge').textContent = card.deck_name;
    $('#swipePromptLabel').textContent = sourceGreek ? 'ГРЕЧЕСКОЕ СЛОВО / ФРАЗА' : 'РУССКОЕ СЛОВО / ФРАЗА';
    $('#swipePrompt').textContent = sourceGreek ? card.word : card.word_translation;
    $('#swipePromptTranscription').textContent = sourceGreek ? (card.word_transcription || '') : '';
    $('#swipeCandidate').textContent = pair.shownAnswer;
    $('#swipeCandidateTranscription').textContent = sourceGreek ? '' : (pair.candidateCard.word_transcription || '');
    $('#swipeFeedback').className = 'swipe-feedback hidden';
    $('#swipeFeedback').innerHTML = '';
    $('#swipeRoundInfo').innerHTML = '<strong>Сравни пару</strong><small>← неверно · верно →</small>';
    resetSwipeCardPosition();
    renderSwipeImage(card);
    setSessionHeader(study.index + 1, study.initialTotal, card.deck_name, study.index, study.correct);
  }

  function renderSwipeImage(card) {
    revokeSwipeImage();
    const box = $('#swipeImageBox');
    if (card.image_blob?.length) {
      state.swipeImageUrl = bytesToObjectUrl(card.image_blob, card.image_mime);
      box.innerHTML = `<img src="${state.swipeImageUrl}" alt="Визуальный якорь для ${escapeHtml(card.word)}">`;
      box.classList.remove('empty');
    } else {
      box.innerHTML = '<div><span>✦</span><small>Сравни слово и перевод</small></div>';
      box.classList.add('empty');
    }
  }

  function revokeSwipeImage() {
    if (state.swipeImageUrl) URL.revokeObjectURL(state.swipeImageUrl);
    state.swipeImageUrl = null;
  }

  function handleSwipePointerDown(event) {
    const study = state.study;
    if (!study || study.mode !== 'swipe' || study.transitioning || event.button !== 0) return;
    state.swipeGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      deltaY: 0,
      horizontal: false
    };
    const card = $('#swipeCard');
    card.classList.add('dragging');
    try { card.setPointerCapture(event.pointerId); } catch (_) { /* no-op */ }
  }

  function handleSwipePointerMove(event) {
    const gesture = state.swipeGesture;
    const study = state.study;
    if (!gesture || gesture.pointerId !== event.pointerId || !study || study.mode !== 'swipe' || study.transitioning) return;
    gesture.deltaX = event.clientX - gesture.startX;
    gesture.deltaY = event.clientY - gesture.startY;
    if (!gesture.horizontal) {
      if (Math.abs(gesture.deltaY) > Math.abs(gesture.deltaX) && Math.abs(gesture.deltaY) > 10) return;
      if (Math.abs(gesture.deltaX) > 7) gesture.horizontal = true;
    }
    if (!gesture.horizontal) return;
    event.preventDefault();
    const rotation = Math.max(-15, Math.min(15, gesture.deltaX / 18));
    $('#swipeCard').style.transform = `translate3d(${gesture.deltaX}px, ${Math.min(18, Math.abs(gesture.deltaX) * 0.035)}px, 0) rotate(${rotation}deg)`;
    updateSwipeStamps(gesture.deltaX);
  }

  function handleSwipePointerUp(event) {
    const gesture = state.swipeGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const threshold = Math.min(105, Math.max(72, $('#swipeCard').offsetWidth * 0.22));
    state.swipeGesture = null;
    if (gesture.horizontal && Math.abs(gesture.deltaX) >= threshold) answerSwipe(gesture.deltaX > 0);
    else resetSwipeCardPosition();
  }

  function handleSwipePointerCancel() {
    state.swipeGesture = null;
    resetSwipeCardPosition();
  }

  function updateSwipeStamps(deltaX) {
    const strength = Math.min(1, Math.abs(deltaX) / 110);
    $('.swipe-stamp-right').style.opacity = deltaX > 0 ? strength : 0;
    $('.swipe-stamp-left').style.opacity = deltaX < 0 ? strength : 0;
  }

  function resetSwipeCardPosition() {
    const card = $('#swipeCard');
    card.classList.remove('dragging', 'swipe-out-left', 'swipe-out-right');
    card.style.transform = '';
    $('.swipe-stamp-right').style.opacity = 0;
    $('.swipe-stamp-left').style.opacity = 0;
  }

  function answerSwipe(userSaysMatch) {
    const study = state.study;
    if (!study || study.mode !== 'swipe' || study.transitioning || !study.currentPair) return;
    const pair = study.currentPair;
    const judgmentCorrect = userSaysMatch === pair.isMatch;
    study.transitioning = true;
    study.answers += 1;
    if (judgmentCorrect) study.correct += 1;
    else if (!study.wrongCards.some((item) => item.id === pair.card.id)) study.wrongCards.push(pair.card);

    LexiDB.recordQuizAnswer(pair.card.id, judgmentCorrect, `swipe-${study.direction}`);
    if (study.affectsSrs) LexiDB.rateCard(pair.card.id, judgmentCorrect ? 1 : 0);

    const cardNode = $('#swipeCard');
    cardNode.classList.remove('dragging');
    cardNode.classList.add(userSaysMatch ? 'swipe-out-right' : 'swipe-out-left');
    updateSwipeStamps(userSaysMatch ? 130 : -130);
    emitSwipeParticles(userSaysMatch ? 'right' : 'left');
    showSwipeFeedback(pair, judgmentCorrect, userSaysMatch);
    $('#sessionScore').textContent = `${study.correct} ✓`;

    const delay = judgmentCorrect ? 900 : 1750;
    state.swipeFeedbackTimer = setTimeout(() => {
      if (!state.study || state.study !== study || study.mode !== 'swipe') return;
      study.index += 1;
      renderSwipeQuestion();
    }, delay);
  }

  function showSwipeFeedback(pair, judgmentCorrect, userSaysMatch) {
    const node = $('#swipeFeedback');
    node.className = `swipe-feedback ${judgmentCorrect ? 'success' : 'error'}`;
    if (judgmentCorrect) {
      node.innerHTML = `<strong>${userSaysMatch ? '✓ Пара совпадает' : '✓ Ты заметил подмену'}</strong><small>${escapeHtml(pair.promptText)} — ${escapeHtml(pair.correctAnswer)}</small>`;
    } else if (pair.isMatch) {
      node.innerHTML = `<strong>✕ Это был правильный перевод</strong><small>${escapeHtml(pair.promptText)} — ${escapeHtml(pair.correctAnswer)}</small>`;
    } else {
      node.innerHTML = `<strong>✕ Перевод был подменён</strong><small>Правильно: ${escapeHtml(pair.correctAnswer)}</small>`;
    }
    $('#swipeRoundInfo').innerHTML = judgmentCorrect
      ? '<strong>Отлично!</strong><small>Следующая пара…</small>'
      : `<strong>Запомни:</strong><small>${escapeHtml(pair.correctAnswer)}</small>`;
  }

  function emitSwipeParticles(direction) {
    const container = $('#swipeParticles');
    container.innerHTML = '';
    const isRight = direction === 'right';
    const count = 9 + Math.floor(Math.random() * 5);
    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement('span');
      particle.className = `swipe-particle ${isRight ? 'right' : 'left'}`;
      particle.textContent = isRight ? '✓' : '×';
      particle.style.setProperty('--particle-y', `${8 + Math.random() * 78}%`);
      particle.style.setProperty('--particle-x', `${(isRight ? 1 : -1) * (20 + Math.random() * 150)}px`);
      particle.style.setProperty('--particle-r', `${-45 + Math.random() * 90}deg`);
      particle.style.setProperty('--particle-delay', `${Math.random() * 0.16}s`);
      particle.style.setProperty('--particle-scale', `${0.7 + Math.random() * 0.8}`);
      container.appendChild(particle);
    }
    setTimeout(() => { container.innerHTML = ''; }, 1500);
  }

  function setSessionHeader(current, total, deckName, completed, correct) {
    $('#sessionCounter').textContent = `${current} / ${total}`;
    $('#sessionDeckName').textContent = deckName;
    $('#sessionProgress').style.width = `${Math.round((completed / total) * 100)}%`;
    $('#sessionScore').textContent = `${correct} ✓`;
  }

  function finishStudyEarly() {
    if (!state.study) return resetStudyUi();
    const proceed = confirm('Завершить текущую тренировку? Уже записанные ответы сохранятся.');
    if (proceed) finishStudy();
  }

  function finishStudy() {
    const study = state.study;
    if (!study) return resetStudyUi();
    clearTimeout(state.quizAutoTimer);
    clearTimeout(state.swipeFeedbackTimer);
    revokeQuizImage();
    revokeSwipeImage();
    const elapsed = Math.max(1, Math.round((Date.now() - study.startedAt) / 60000));
    const accuracy = study.answers ? Math.round((study.correct / study.answers) * 100) : 0;
    $('#studySession').classList.add('hidden');
    $('#studySetup').classList.add('hidden');
    $('#studyFinished').classList.remove('hidden');
    $('#finishMistakes').classList.add('hidden');
    $('#repeatMistakesButton').classList.add('hidden');

    if (study.mode === 'quiz' || study.mode === 'swipe') {
      const isSwipe = study.mode === 'swipe';
      state.lastMistakeMode = study.mode;
      if (isSwipe) state.lastSwipeMistakes = [...study.wrongCards];
      else state.lastQuizMistakes = [...study.wrongCards];
      $('#finishTitle').textContent = accuracy >= 85 ? 'Отличный результат!' : accuracy >= 60 ? 'Хорошая тренировка!' : 'Ошибки уже стали полезнее';
      $('#finishSummary').textContent = isSwipe
        ? `Свайп-тренировка завершена: ${study.correct} верных решений из ${study.answers}.`
        : `Тест завершён: ${study.correct} правильных ответов из ${study.answers}.`;
      $('#finishStats').innerHTML = `<div><strong>${study.correct}/${study.answers}</strong><small>${isSwipe ? 'решений' : 'правильно'}</small></div><div><strong>${accuracy}%</strong><small>точность</small></div><div><strong>${elapsed} мин</strong><small>время</small></div>`;
      if (study.wrongCards.length) {
        $('#finishMistakes').classList.remove('hidden');
        $('#finishMistakes').innerHTML = `<strong>Слова с ошибками</strong><div class="mistake-chips">${study.wrongCards.map((card) => `<span>${escapeHtml(card.word)}</span>`).join('')}</div>`;
        $('#repeatMistakesButton').classList.remove('hidden');
      }
    } else {
      const pendingAgain = study.relearningQueue?.length || 0;
      const nextDue = pendingAgain
        ? Math.max(1, Math.ceil((Math.min(...study.relearningQueue.map((item) => new Date(item.dueAt).getTime())) - Date.now()) / 60000))
        : 0;
      $('#finishTitle').textContent = 'Отличная работа!';
      $('#finishSummary').textContent = pendingAgain
        ? `Ты просмотрел ${study.completed} карточек. ${pendingAgain} ${plural(pendingAgain, 'карточка назначена', 'карточки назначены', 'карточек назначены')} повторно примерно через ${nextDue} мин.`
        : `Ты завершил ${study.completed} карточек. Повторения уже сохранены в SQLite.`;
      $('#finishStats').innerHTML = `<div><strong>${study.completed}</strong><small>просмотрено</small></div><div><strong>${accuracy}%</strong><small>без «Снова»</small></div><div><strong>${pendingAgain}</strong><small>ждут повтора</small></div>`;
    }
    state.study = null;
    refreshAll();
  }

  function repeatMistakes() {
    if (state.lastMistakeMode === 'swipe') {
      if (!state.lastSwipeMistakes.length || !state.lastSwipeConfig) return;
      const config = state.lastSwipeConfig;
      setStudyMode('swipe');
      $('#swipeDirection').value = config.direction;
      $('#swipeAffectsSrs').checked = config.affectsSrs;
      startSwipeStudy(config.deckIds, state.lastSwipeMistakes.length, state.lastSwipeMistakes);
      return;
    }
    if (!state.lastQuizMistakes.length || !state.lastQuizConfig) return;
    const config = state.lastQuizConfig;
    setStudyMode('quiz');
    $('#quizDirection').value = config.direction;
    $('#quizAffectsSrs').checked = config.affectsSrs;
    $('#quizAutoNext').checked = config.autoNext;
    startQuiz(config.deckIds, state.lastQuizMistakes.length, state.lastQuizMistakes);
  }

  function resetStudyUi() {
    clearTimeout(state.quizAutoTimer);
    clearTimeout(state.swipeFeedbackTimer);
    state.study = null;
    revokeQuizImage();
    revokeSwipeImage();
    $('#studySetup').classList.remove('hidden');
    $('#studySession').classList.add('hidden');
    $('#studyFinished').classList.add('hidden');
    renderStudyDecks();
    setStudyMode(state.studyMode);
  }

  function speakCurrentWord() {
    const card = state.study?.mode === 'flashcards' ? state.study.queue[0] : null;
    if (!card || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(card.word);
    utterance.lang = 'el-GR';
    utterance.rate = 0.82;
    speechSynthesis.speak(utterance);
  }

  function handleKeyboardShortcuts(event) {
    const dialogOpen = $$('dialog[open]').length > 0;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (dialogOpen || typing || !state.study) return;
    if (state.study.mode === 'flashcards') {
      if (event.code === 'Space') {
        event.preventDefault();
        revealCard();
      }
      if (state.study.flipped && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(event.code)) {
        rateCurrentCard(Number(event.code.slice(-1)) - 1);
      }
    } else if (state.study.mode === 'quiz') {
      if (!state.study.answered && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(event.code)) {
        answerQuiz(Number(event.code.slice(-1)) - 1);
      } else if (state.study.answered && ['Space', 'Enter'].includes(event.code)) {
        event.preventDefault();
        nextQuizQuestion();
      }
    } else if (state.study.mode === 'swipe') {
      if (['ArrowLeft', 'KeyA'].includes(event.code)) {
        event.preventDefault();
        answerSwipe(false);
      } else if (['ArrowRight', 'KeyD'].includes(event.code)) {
        event.preventDefault();
        answerSwipe(true);
      }
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
    $('#editImageSearchQuery').value = card?.image_search_query || '';
    state.editImageSearchQueryEn = card?.image_search_query_en || '';
    state.editImageSearchQueryEnSource = card?.image_search_query_en_source || '';
    state.editImageSearchTranslationProvider = card?.image_search_translation_provider || '';
    renderEditTranslationCache();
    state.editImageBytes = card?.image_blob || null;
    state.editImageMime = card?.image_mime || '';
    state.editImageRemoved = false;
    state.editImageSource = card?.image_source || '';
    state.editImageAuthor = card?.image_author || '';
    state.editImageSourceUrl = card?.image_source_url || '';
    state.pendingImageSource = null;
    renderEditImagePreview();
    $('#deleteCardButton').classList.toggle('hidden', !card);
    hidePasteFallback();
    $('#cardDialog').showModal();
    if (!isMobileLike()) setTimeout(() => $('#editWord').focus(), 60);
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
      image_search_query: $('#editImageSearchQuery').value.trim(),
      image_search_query_en: state.editImageSearchQueryEn || '',
      image_search_query_en_source: state.editImageSearchQueryEnSource || '',
      image_search_translation_provider: state.editImageSearchTranslationProvider || '',
      image_blob: state.editImageRemoved ? null : state.editImageBytes,
      image_mime: state.editImageRemoved ? '' : state.editImageMime,
      image_source: state.editImageRemoved ? '' : state.editImageSource,
      image_author: state.editImageRemoved ? '' : state.editImageAuthor,
      image_source_url: state.editImageRemoved ? '' : state.editImageSourceUrl
    };
    if (!payload.word) return toast('Поле «Слово / фраза» обязательно', 'error');
    if (id) LexiDB.updateCard(payload); else LexiDB.insertCard(payload);
    closeCardDialog();
    await refreshAll();
    toast(id ? 'Карточка обновлена' : 'Карточка добавлена');
  }

  async function deleteCurrentCard() {
    const id = Number($('#cardId').value || 0);
    if (!id) return;
    const ok = await confirmAction('Удалить карточку?', 'Карточка и история её повторений будут удалены.', 'Удалить');
    if (!ok) return;
    LexiDB.deleteCard(id);
    closeCardDialog();
    await refreshAll();
    toast('Карточка удалена');
  }

  async function handleImageSelection(event) {
    const file = event.target.files[0];
    if (!file) return;
    state.pendingImageSource = { source: 'local', url: '' };
    await setEditImageFromFile(file);
    event.target.value = '';
  }

  async function setEditImageFromFile(file) {
    try {
      const processed = await resizeImage(file, 900, 700, 0.80);
      state.editImageBytes = processed.bytes;
      state.editImageMime = processed.mime;
      state.editImageRemoved = false;
      state.editImageSource = state.pendingImageSource?.source || 'clipboard';
      state.editImageSourceUrl = state.pendingImageSource?.url || '';
      state.editImageAuthor = state.pendingImageSource?.author || '';
      state.pendingImageSource = null;
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
    state.editImageSource = '';
    state.editImageAuthor = '';
    state.editImageSourceUrl = '';
    renderEditImagePreview();
  }

  function renderEditImagePreview() {
    clearPreviewImageUrl();
    const box = $('#editImagePreview');
    if (state.editImageBytes?.length) {
      state.previewImageUrl = bytesToObjectUrl(state.editImageBytes, state.editImageMime);
      box.innerHTML = `<img src="${state.previewImageUrl}" alt="Предпросмотр изображения">`;
      renderImageAttribution($('#editImageAttribution'), state.editImageSource, state.editImageAuthor, state.editImageSourceUrl);
    } else {
      box.innerHTML = '<div><span>✦</span><small>Изображение-якорь</small></div>';
      renderImageAttribution($('#editImageAttribution'), '', '', '');
    }
  }

  function clearPreviewImageUrl() {
    if (state.previewImageUrl) URL.revokeObjectURL(state.previewImageUrl);
    state.previewImageUrl = null;
  }

  function openGoogleImages() {
    const queryInput = $('#editImageSearchQuery');
    const fallback = $('#editWordTranslation').value.trim() || $('#editWord').value.trim();
    const query = queryInput.value.trim() || fallback;
    if (!query) return toast('Сначала введи слово или поисковый запрос', 'error');
    if (!queryInput.value.trim()) queryInput.value = query;
    const url = googleImagesUrl(query);
    state.pendingImageSource = { source: 'google', url };
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function getPexelsKey() {
    try {
      return localStorage.getItem(PEXELS_KEY_STORAGE) || '';
    } catch (error) {
      console.warn('Unable to read Pexels key', error);
      return '';
    }
  }

  function setPexelsKey(value) {
    try {
      if (value) localStorage.setItem(PEXELS_KEY_STORAGE, value);
      else localStorage.removeItem(PEXELS_KEY_STORAGE);
      return true;
    } catch (error) {
      console.warn('Unable to save Pexels key', error);
      toast('Браузер не разрешил сохранить ключ локально', 'error');
      return false;
    }
  }

  function openSettingsDialog() {
    const key = getPexelsKey();
    $('#pexelsApiKeyInput').value = key;
    $('#pexelsApiKeyInput').type = 'password';
    $('#togglePexelsKey').textContent = 'Показать';
    $('#myMemoryEmailInput').value = getLocalSetting(MYMEMORY_EMAIL_STORAGE, '');
    $('#autoTranslateToggle').checked = getAutoTranslateEnabled();
    updatePexelsKeyBadge(Boolean(key));
    updateTranslatorBadge();
    updateTranslatorSupportText();
    $('#settingsDialog').showModal();
  }

  function closeSettingsDialog() {
    $('#settingsDialog').close();
  }

  function updatePexelsKeyBadge(configured, text = '') {
    const badge = $('#pexelsKeyBadge');
    badge.textContent = text || (configured ? 'Настроено' : 'Не настроено');
    badge.classList.toggle('connected', configured);
  }

  function saveSettings(event) {
    event.preventDefault();
    const key = $('#pexelsApiKeyInput').value.trim();
    const email = $('#myMemoryEmailInput').value.trim();
    if (!setPexelsKey(key)) return;
    if (!setLocalSetting(MYMEMORY_EMAIL_STORAGE, email)) return;
    if (!setLocalSetting(AUTO_TRANSLATE_STORAGE, $('#autoTranslateToggle').checked ? '1' : '0')) return;
    updatePexelsKeyBadge(Boolean(key));
    updateTranslatorBadge();
    closeSettingsDialog();
    toast('Настройки интеграций сохранены на этом устройстве');
  }

  function togglePexelsKeyVisibility() {
    const input = $('#pexelsApiKeyInput');
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    $('#togglePexelsKey').textContent = visible ? 'Показать' : 'Скрыть';
  }

  function clearPexelsKey() {
    $('#pexelsApiKeyInput').value = '';
    setPexelsKey('');
    updatePexelsKeyBadge(false);
    toast('Pexels API key удалён с этого устройства');
  }

  function getLocalSetting(key, fallback = '') {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      console.warn(`Unable to read ${key}`, error);
      return fallback;
    }
  }

  function setLocalSetting(key, value) {
    try {
      if (value === '' || value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, String(value));
      return true;
    } catch (error) {
      console.warn(`Unable to save ${key}`, error);
      toast('Браузер не разрешил сохранить настройку локально', 'error');
      return false;
    }
  }

  function getAutoTranslateEnabled() {
    const dialog = $('#settingsDialog');
    const toggle = $('#autoTranslateToggle');
    if (dialog?.open && toggle) return toggle.checked;
    return getLocalSetting(AUTO_TRANSLATE_STORAGE, '1') !== '0';
  }

  function updateTranslatorBadge() {
    const enabled = $('#autoTranslateToggle')?.checked ?? getAutoTranslateEnabled();
    const badge = $('#translatorBadge');
    if (!badge) return;
    badge.textContent = enabled ? 'Включено' : 'Выключено';
    badge.classList.toggle('connected', enabled);
  }

  function updateTranslatorSupportText(message = '') {
    const target = $('#translatorSupportText');
    if (!target) return;
    if (message) {
      target.textContent = message;
      return;
    }
    target.textContent = canUseChromeTranslator()
      ? 'На этом компьютере доступен локальный Chrome Translator.'
      : 'Chrome Translator недоступен — будет использован MyMemory.';
  }

  function canUseChromeTranslator() {
    return !isMobileLike() && 'Translator' in self && typeof self.Translator?.create === 'function';
  }

  function containsCyrillic(text) {
    return /[\u0400-\u052f]/u.test(text || '');
  }

  function normalizeTranslatedQuery(value) {
    return String(value || '')
      .replace(/^\s*["“”«»]+|["“”«»]+\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function getChromeTranslator(onProgress = null) {
    if (!canUseChromeTranslator()) throw new Error('Chrome Translator недоступен');
    if (state.translator.instance) return state.translator.instance;
    if (!state.translator.promise) {
      state.translator.promise = self.Translator.create({
        sourceLanguage: 'ru',
        targetLanguage: 'en',
        monitor(monitor) {
          monitor.addEventListener('downloadprogress', (event) => {
            state.translator.downloadProgress = Math.round(Number(event.loaded || 0) * 100);
            onProgress?.(state.translator.downloadProgress);
          });
        }
      }).then((translator) => {
        state.translator.instance = translator;
        return translator;
      }).catch((error) => {
        state.translator.promise = null;
        throw error;
      });
    }
    return state.translator.promise;
  }

  async function translateWithChrome(text, onProgress = null) {
    const translator = await getChromeTranslator(onProgress);
    const translated = normalizeTranslatedQuery(await translator.translate(text));
    if (!translated || translated.toLowerCase() === text.trim().toLowerCase()) {
      throw new Error('Chrome Translator не вернул английский перевод');
    }
    return translated;
  }

  function decodeHtmlEntities(value) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value || '');
    return textarea.value;
  }

  async function translateWithMyMemory(text) {
    const params = new URLSearchParams({
      q: text.slice(0, 220),
      langpair: 'ru|en',
      mt: '1'
    });
    const settingsEmail = $('#settingsDialog')?.open ? $('#myMemoryEmailInput')?.value : '';
    const email = String(settingsEmail || getLocalSetting(MYMEMORY_EMAIL_STORAGE, '')).trim();
    if (email) params.set('de', email);
    const response = await fetch(`https://api.mymemory.translated.net/get?${params}`, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`MyMemory: HTTP ${response.status}`);
    const data = await response.json();
    const translated = normalizeTranslatedQuery(decodeHtmlEntities(data?.responseData?.translatedText));
    const status = Number(data?.responseStatus || 200);
    if (status >= 400 || !translated || /MYMEMORY WARNING/i.test(translated)) {
      throw new Error(data?.responseDetails || 'MyMemory не вернул перевод');
    }
    return translated;
  }

  async function resolveEnglishImageQuery(sourceQuery, cached = {}, onStatus = null) {
    const source = String(sourceQuery || '').trim();
    if (!source) return { query: '', sourceQuery: '', provider: 'empty', fromCache: false };
    if (!containsCyrillic(source) || !getAutoTranslateEnabled()) {
      return { query: source, sourceQuery: source, provider: containsCyrillic(source) ? 'fallback' : 'original', fromCache: false };
    }
    if (cached.english && cached.source === source) {
      onStatus?.(`Сохранённый перевод: ${cached.english}`);
      return { query: cached.english, sourceQuery: source, provider: cached.provider || 'cache', fromCache: true };
    }
    if (canUseChromeTranslator()) {
      try {
        onStatus?.('Перевожу на устройстве через Chrome Translator…');
        const query = await translateWithChrome(source, (progress) => onStatus?.(`Загружаю языковую модель Chrome: ${progress}%`));
        return { query, sourceQuery: source, provider: 'chrome', fromCache: false };
      } catch (error) {
        console.warn('Chrome Translator fallback', error);
      }
    }
    try {
      onStatus?.('Chrome Translator недоступен. Перевожу через MyMemory…');
      const query = await translateWithMyMemory(source);
      return { query, sourceQuery: source, provider: 'mymemory', fromCache: false };
    } catch (error) {
      console.warn('MyMemory fallback', error);
      onStatus?.('Перевод недоступен — выполняю поиск по-русски.');
      return { query: source, sourceQuery: source, provider: 'fallback', fromCache: false };
    }
  }

  function providerLabel(provider) {
    return ({
      chrome: 'Chrome Translator',
      mymemory: 'MyMemory',
      cache: 'сохранённый перевод',
      fallback: 'русский запрос',
      original: 'исходный запрос'
    })[provider] || provider || 'перевод';
  }

  async function testTranslationIntegration() {
    const button = $('#testTranslationButton');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Проверяю…';
    try {
      const result = await resolveEnglishImageQuery('приятная утренняя прохлада', {}, updateTranslatorSupportText);
      updateTranslatorSupportText(`${providerLabel(result.provider)}: ${result.query}`);
      toast(`Тестовый перевод: ${result.query}`);
    } catch (error) {
      updateTranslatorSupportText('Не удалось проверить перевод');
      toast(error.message || 'Ошибка перевода', 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function clearEditTranslationCache() {
    state.editImageSearchQueryEn = '';
    state.editImageSearchQueryEnSource = '';
    state.editImageSearchTranslationProvider = '';
    renderEditTranslationCache();
  }

  function renderEditTranslationCache() {
    const target = $('#editTranslationCache');
    if (!target) return;
    const visible = Boolean(state.editImageSearchQueryEn && state.editImageSearchQueryEnSource);
    target.classList.toggle('hidden', !visible);
    target.innerHTML = visible
      ? `<span>EN</span><strong>${escapeHtml(state.editImageSearchQueryEn)}</strong><small>${escapeHtml(providerLabel(state.editImageSearchTranslationProvider))}</small>`
      : '';
  }

  function clearImageLabTranslationCache() {
    if (!state.imageLab) return;
    state.imageLab.queryEn = '';
    state.imageLab.queryEnSource = '';
    state.imageLab.translationProvider = '';
    renderImageLabTranslationCache();
  }

  function renderImageLabTranslationCache() {
    const target = $('#imageLabTranslationCache');
    const lab = state.imageLab;
    if (!target || !lab) return;
    const visible = Boolean(lab.queryEn && lab.queryEnSource);
    target.classList.toggle('hidden', !visible);
    target.innerHTML = visible
      ? `<span>EN</span><strong>${escapeHtml(lab.queryEn)}</strong><small>${escapeHtml(providerLabel(lab.translationProvider))}</small>`
      : '';
  }

  async function testPexelsKey() {
    const key = $('#pexelsApiKeyInput').value.trim();
    if (!key) return toast('Сначала вставь Pexels API key', 'error');
    const button = $('#testPexelsKey');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Проверяю…';
    try {
      await requestPexels('Greek language', 1, 1, key);
      updatePexelsKeyBadge(true, 'Ключ работает');
      toast('Подключение к Pexels работает');
    } catch (error) {
      updatePexelsKeyBadge(false, 'Ошибка ключа');
      toast(error.message || 'Не удалось проверить ключ', 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function openPexelsDialog(context = 'card') {
    const key = getPexelsKey();
    if (!key) {
      toast('Сначала добавь Pexels API key в настройках', 'error');
      openSettingsDialog();
      return;
    }
    state.pexels.context = context;
    state.pexels.results = [];
    state.pexels.page = 1;
    state.pexels.totalResults = 0;
    state.pexels.translationProvider = '';
    state.pexels.translationFromCache = false;
    const sourceQuery = context === 'lab'
      ? $('#imageLabQuery').value.trim()
      : $('#editImageSearchQuery').value.trim() || $('#editWordTranslation').value.trim() || $('#editWord').value.trim();
    const cached = getCurrentImageTranslationCache(context);
    const query = cached.english && cached.source === sourceQuery ? cached.english : sourceQuery;
    state.pexels.originalQuery = sourceQuery;
    state.pexels.query = query;
    $('#pexelsSearchInput').value = query;
    $('#pexelsResults').innerHTML = '';
    $('#pexelsEmpty').classList.remove('hidden');
    $('#pexelsLoadMore').classList.add('hidden');
    $('#pexelsUseFirst').classList.add('hidden');
    renderPexelsTranslationInfo(cached.english && cached.source === sourceQuery
      ? { query: cached.english, sourceQuery, provider: cached.provider || 'cache', fromCache: true }
      : null);
    $('#pexelsStatus').textContent = query ? 'Подготавливаю запрос…' : 'Введите поисковый запрос';
    $('#pexelsDialog').showModal();
    if (query) searchPexels(true);
    else if (!isMobileLike()) setTimeout(() => $('#pexelsSearchInput').focus(), 60);
  }

  function getCurrentImageTranslationCache(context = state.pexels.context) {
    if (context === 'lab') {
      return {
        english: state.imageLab?.queryEn || '',
        source: state.imageLab?.queryEnSource || '',
        provider: state.imageLab?.translationProvider || ''
      };
    }
    return {
      english: state.editImageSearchQueryEn || '',
      source: state.editImageSearchQueryEnSource || '',
      provider: state.editImageSearchTranslationProvider || ''
    };
  }

  function storeCurrentImageTranslation(result, context = state.pexels.context) {
    if (!result?.sourceQuery) return;
    if (!containsCyrillic(result.sourceQuery)) {
      if (context === 'lab' && state.imageLab) {
        state.imageLab.queryEn = '';
        state.imageLab.queryEnSource = '';
        state.imageLab.translationProvider = '';
        renderImageLabTranslationCache();
      } else {
        clearEditTranslationCache();
      }
      return;
    }
    const english = result.provider === 'fallback' ? '' : result.query;
    if (context === 'lab' && state.imageLab) {
      state.imageLab.queryEn = english;
      state.imageLab.queryEnSource = result.sourceQuery;
      state.imageLab.translationProvider = result.provider;
      renderImageLabTranslationCache();
    } else {
      state.editImageSearchQueryEn = english;
      state.editImageSearchQueryEnSource = result.sourceQuery;
      state.editImageSearchTranslationProvider = result.provider;
      renderEditTranslationCache();
    }
  }

  function renderPexelsTranslationInfo(result = null, message = '') {
    const target = $('#pexelsTranslationInfo');
    if (!target) return;
    if (message) {
      target.classList.remove('hidden');
      target.innerHTML = `<span class="translation-spinner"></span><strong>${escapeHtml(message)}</strong>`;
      return;
    }
    if (!result || !result.sourceQuery || result.query === result.sourceQuery) {
      target.classList.add('hidden');
      target.innerHTML = '';
      return;
    }
    target.classList.remove('hidden');
    target.innerHTML = `<span>RU → EN</span><div><small>${escapeHtml(result.sourceQuery)}</small><strong>${escapeHtml(result.query)}</strong></div><em>${escapeHtml(providerLabel(result.fromCache ? 'cache' : result.provider))}</em>`;
  }

  function closePexelsDialog() {
    $('#pexelsDialog').close();
  }

  async function requestPexels(query, page = 1, perPage = 12, key = getPexelsKey()) {
    if (!key) throw new Error('Pexels API key не настроен');
    const params = new URLSearchParams({
      query,
      page: String(page),
      per_page: String(perPage),
      orientation: 'landscape',
      locale: /[Ͱ-Ͽ]/.test(query) ? 'el-GR' : /[Ѐ-ӿ]/.test(query) ? 'ru-RU' : 'en-US'
    });
    const response = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: key }
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('Pexels отклонил API key');
      if (response.status === 429) throw new Error('Лимит запросов Pexels исчерпан');
      throw new Error(`Ошибка Pexels API: ${response.status}`);
    }
    return response.json();
  }

  async function searchPexels(reset = true) {
    if (state.pexels.loading) return;
    const enteredQuery = $('#pexelsSearchInput').value.trim();
    if (!enteredQuery) return toast('Введите запрос для поиска картинки', 'error');
    state.pexels.loading = true;
    const button = $('#pexelsSearchButton');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = reset ? 'Перевожу…' : 'Ищу…';
    try {
      let query = state.pexels.query;
      if (reset) {
        const cached = getCurrentImageTranslationCache();
        const sourceQuery = enteredQuery === cached.english && cached.source ? cached.source : enteredQuery;
        const result = await resolveEnglishImageQuery(sourceQuery, cached, (message) => {
          $('#pexelsStatus').textContent = message;
          renderPexelsTranslationInfo(null, message);
        });
        query = result.query;
        state.pexels.originalQuery = result.sourceQuery;
        state.pexels.translationProvider = result.provider;
        state.pexels.translationFromCache = result.fromCache;
        state.pexels.query = query;
        $('#pexelsSearchInput').value = query;
        storeCurrentImageTranslation(result);
        renderPexelsTranslationInfo(result);
        button.textContent = 'Ищу…';
      }
      const page = reset ? 1 : state.pexels.page + 1;
      const data = await requestPexels(query, page, 12);
      state.pexels.page = page;
      state.pexels.totalResults = Number(data.total_results || 0);
      state.pexels.results = reset ? (data.photos || []) : [...state.pexels.results, ...(data.photos || [])];
      renderPexelsResults();
    } catch (error) {
      toast(error.message || 'Не удалось выполнить поиск Pexels', 'error');
      $('#pexelsStatus').textContent = error.message || 'Ошибка поиска';
    } finally {
      state.pexels.loading = false;
      button.disabled = false;
      button.textContent = original;
    }
  }

  function renderPexelsResults() {
    const photos = state.pexels.results;
    $('#pexelsEmpty').classList.toggle('hidden', photos.length > 0);
    $('#pexelsUseFirst').classList.toggle('hidden', photos.length === 0);
    $('#pexelsLoadMore').classList.toggle('hidden', !photos.length || photos.length >= state.pexels.totalResults);
    $('#pexelsStatus').textContent = photos.length
      ? `${formatNumber(state.pexels.totalResults)} результатов · показано ${photos.length}`
      : 'По этому запросу ничего не найдено';
    $('#pexelsResults').innerHTML = photos.map((photo) => `
      <button type="button" class="pexels-photo" data-pexels-id="${photo.id}" aria-label="Выбрать фото ${escapeHtml(photo.alt || '')}">
        <img src="${escapeHtml(photo.src?.medium || photo.src?.small || '')}" alt="${escapeHtml(photo.alt || state.pexels.query)}" loading="lazy">
        <span><strong>${escapeHtml(photo.photographer || 'Pexels')}</strong><small>Выбрать изображение</small></span>
      </button>
    `).join('');
  }

  async function handlePexelsResultClick(event) {
    const item = event.target.closest('[data-pexels-id]');
    if (!item) return;
    const photo = state.pexels.results.find((entry) => Number(entry.id) === Number(item.dataset.pexelsId));
    if (photo) await choosePexelsPhoto(photo, item);
  }

  async function useFirstPexelsResult() {
    const photo = state.pexels.results[0];
    if (photo) await choosePexelsPhoto(photo, $('#pexelsUseFirst'));
  }

  async function choosePexelsPhoto(photo, trigger = null) {
    const original = trigger?.innerHTML;
    if (trigger) {
      trigger.disabled = true;
      if (trigger.matches('.pexels-photo')) trigger.classList.add('loading');
      else trigger.textContent = 'Загружаю…';
    }
    try {
      const file = await downloadPexelsPhoto(photo);
      const metadata = {
        source: 'pexels',
        url: photo.url || '',
        author: photo.photographer || 'Pexels'
      };
      let success = false;
      if (state.pexels.context === 'lab') {
        if (!state.imageLab) throw new Error('Лаборатория картинок уже закрыта');
        state.imageLab.pendingSource = metadata;
        success = await setImageLabImageFromFile(file);
        $('#imageLabQuery').value = state.pexels.originalQuery || state.pexels.query;
      } else {
        state.pendingImageSource = metadata;
        success = await setEditImageFromFile(file);
        $('#editImageSearchQuery').value = state.pexels.originalQuery || state.pexels.query;
      }
      if (success) {
        closePexelsDialog();
        toast(`Фото ${photo.photographer ? `от ${photo.photographer}` : 'из Pexels'} выбрано`);
      }
    } catch (error) {
      toast(error.message || 'Не удалось загрузить фотографию', 'error');
    } finally {
      if (trigger) {
        trigger.disabled = false;
        trigger.classList.remove?.('loading');
        if (original !== undefined) trigger.innerHTML = original;
      }
    }
  }

  async function downloadPexelsPhoto(photo) {
    const url = photo.src?.large || photo.src?.landscape || photo.src?.medium || photo.src?.original;
    if (!url) throw new Error('Pexels не вернул ссылку на изображение');
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) throw new Error(`Не удалось скачать изображение: ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('Pexels вернул файл неизвестного формата');
    return new File([blob], `pexels-${photo.id}.${blob.type.split('/')[1] || 'jpg'}`, { type: blob.type });
  }

  async function autoFillImageLabRemaining() {
    const lab = state.imageLab;
    if (!lab) return;
    if (lab.autoRunning) {
      lab.autoCancel = true;
      $('#imageLabAutoRemaining').textContent = 'Останавливаю…';
      return;
    }
    if (!getPexelsKey()) {
      toast('Сначала добавь Pexels API key в настройках', 'error');
      openSettingsDialog();
      return;
    }
    const remaining = Math.min(100, Math.max(0, lab.queue.length - lab.index));
    if (!remaining) return toast('Нет карточек для автоподбора', 'error');
    const ok = await confirmAction(
      'Автоматически подобрать картинки?',
      `Для ${remaining} карточек будет выбран первый результат Pexels. После этого картинки можно заменить вручную. Максимум 100 карточек за один запуск.`,
      'Начать автоподбор'
    );
    if (!ok) return;
    lab.autoRunning = true;
    lab.autoCancel = false;
    const button = $('#imageLabAutoRemaining');
    button.textContent = '■ Остановить';
    button.classList.add('danger');
    let added = 0;
    let skipped = 0;
    try {
      const end = Math.min(lab.queue.length, lab.index + remaining);
      for (let i = lab.index; i < end; i += 1) {
        if (lab.autoCancel) break;
        const card = lab.queue[i];
        const sourceQuery = (card.image_search_query || card.word_translation || card.word || '').trim();
        lab.index = i;
        $('#imageLabCounter').textContent = `${i + 1} / ${lab.queue.length}`;
        $('#imageLabProgress').style.width = `${Math.round((i / lab.queue.length) * 100)}%`;
        $('#imageLabWord').textContent = card.word;
        $('#imageLabTranslation').textContent = `Подготавливаю: ${sourceQuery}`;
        try {
          if (!sourceQuery) throw new Error('Пустой запрос');
          const resolved = await resolveEnglishImageQuery(sourceQuery, {
            english: card.image_search_query_en || '',
            source: card.image_search_query_en_source || '',
            provider: card.image_search_translation_provider || ''
          }, (message) => {
            $('#imageLabTranslation').textContent = message;
          });
          const query = resolved.query;
          $('#imageLabTranslation').textContent = `Ищу: ${query}`;
          const data = await requestPexels(query, 1, 1);
          const photo = data.photos?.[0];
          if (!photo) throw new Error('Нет результатов');
          const file = await downloadPexelsPhoto(photo);
          const processed = await resizeImage(file, 900, 700, 0.80);
          LexiDB.updateCard({
            ...card,
            image_search_query: sourceQuery,
            image_search_query_en: resolved.provider === 'fallback' ? '' : resolved.query,
            image_search_query_en_source: resolved.sourceQuery,
            image_search_translation_provider: resolved.provider,
            image_blob: processed.bytes,
            image_mime: processed.mime,
            image_source: 'pexels',
            image_author: photo.photographer || 'Pexels',
            image_source_url: photo.url || ''
          });
          added += 1;
          lab.processed += 1;
        } catch (error) {
          console.warn(`Autopick skipped card ${card.id}`, error);
          skipped += 1;
        }
        lab.index = i + 1;
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
    } finally {
      lab.autoRunning = false;
      lab.autoCancel = false;
      button.textContent = '⚡ Автоподбор оставшихся';
      button.classList.remove('danger');
      renderImageLab();
      toast(`Автоподбор завершён: ${added} добавлено, ${skipped} пропущено`);
    }
  }

  async function readClipboardImage(onFile, showFallback) {
    if (!window.isSecureContext || !navigator.clipboard?.read) {
      showFallback();
      toast(window.isSecureContext ? 'Используй системную вставку в поле ниже.' : 'Прямой доступ к буферу требует HTTPS.', 'error');
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const success = await onFile(new File([blob], 'clipboard-image', { type: imageType }));
          if (success) toast('Изображение вставлено из буфера');
          return;
        }
        if (item.types.includes('text/html')) {
          const html = await (await item.getType('text/html')).text();
          const file = await imageFileFromHtml(html);
          if (file) {
            const success = await onFile(file);
            if (success) toast('Изображение вставлено из буфера');
            return;
          }
        }
      }
      toast('В буфере обмена нет изображения', 'error');
    } catch (error) {
      console.warn('Clipboard read failed', error);
      showFallback();
      toast('Браузер не разрешил прямой доступ. Используй поле системной вставки.', 'error');
    }
  }

  function showPasteFallback() {
    $('#mobilePasteFallback').classList.remove('hidden');
    $('#pasteTarget').innerHTML = '';
  }

  function hidePasteFallback() {
    $('#mobilePasteFallback').classList.add('hidden');
    $('#pasteTarget').innerHTML = '';
  }

  async function handlePastedImage(event) {
    const file = fileFromClipboardEvent(event);
    if (file) {
      event.preventDefault();
      const success = await setEditImageFromFile(file);
      if (success) {
        hidePasteFallback();
        toast('Изображение вставлено');
      }
      return;
    }
    const html = event.clipboardData?.getData('text/html') || '';
    if (html) {
      const htmlFile = await imageFileFromHtml(html);
      if (htmlFile) {
        event.preventDefault();
        const success = await setEditImageFromFile(htmlFile);
        if (success) {
          hidePasteFallback();
          toast('Изображение вставлено');
        }
      }
    }
  }

  async function handlePasteTargetInput() {
    const file = await imageFileFromEditable($('#pasteTarget'));
    if (!file) return;
    const success = await setEditImageFromFile(file);
    if (success) {
      hidePasteFallback();
      toast('Изображение вставлено');
    }
  }

  function openImageLab(deckIds = []) {
    const cards = LexiDB.getCardsWithoutImages(deckIds);
    state.imageLab = {
      queue: cards,
      index: 0,
      deckIds,
      bytes: null,
      mime: '',
      source: '',
      sourceUrl: '',
      author: '',
      previewUrl: null,
      pendingSource: null,
      queryEn: '',
      queryEnSource: '',
      translationProvider: '',
      processed: 0,
      autoRunning: false,
      autoCancel: false
    };
    $('#imageLabDialog').showModal();
    renderImageLab();
  }

  function closeImageLab() {
    if (state.imageLab?.autoRunning) {
      state.imageLab.autoCancel = true;
      toast('Останавливаю автоподбор…');
      return;
    }
    clearImageLabPreviewUrl();
    $('#imageLabDialog').close();
    $('#imageLabFile').value = '';
    $('#imageLabPasteFallback').classList.add('hidden');
    state.imageLab = null;
  }

  function renderImageLab() {
    const lab = state.imageLab;
    if (!lab || lab.index >= lab.queue.length) {
      $('#imageLabContent').classList.add('hidden');
      $('#imageLabEmpty').classList.remove('hidden');
      $('#imageLabEmpty').innerHTML = `<strong>${lab?.queue.length ? 'Все карточки обработаны' : 'Нет карточек без картинок'}</strong><span>${lab?.processed ? `Сохранено изображений: ${lab.processed}.` : 'В выбранных сборниках у всех карточек уже есть визуальные якоря.'}</span>`;
      refreshAll();
      return;
    }
    $('#imageLabContent').classList.remove('hidden');
    $('#imageLabEmpty').classList.add('hidden');
    clearImageLabImage();
    const card = lab.queue[lab.index];
    $('#imageLabCounter').textContent = `${lab.index + 1} / ${lab.queue.length}`;
    $('#imageLabProgress').style.width = `${Math.round((lab.index / lab.queue.length) * 100)}%`;
    $('#imageLabDeck').textContent = card.deck_name;
    $('#imageLabDeckBadge').textContent = card.deck_name;
    $('#imageLabWord').textContent = card.word;
    $('#imageLabTranslation').textContent = card.word_translation || 'Перевод не указан';
    $('#imageLabQuery').value = card.image_search_query || card.word_translation || card.word;
    lab.queryEn = card.image_search_query_en || '';
    lab.queryEnSource = card.image_search_query_en_source || '';
    lab.translationProvider = card.image_search_translation_provider || '';
    renderImageLabTranslationCache();
    $('#imageLabPasteFallback').classList.add('hidden');
    $('#imageLabPasteTarget').innerHTML = '';
  }

  function openImageLabGoogle() {
    const query = $('#imageLabQuery').value.trim();
    if (!query) return toast('Введи поисковый запрос', 'error');
    const url = googleImagesUrl(query);
    state.imageLab.pendingSource = { source: 'google', url };
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleImageLabFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    state.imageLab.pendingSource = { source: 'local', url: '' };
    await setImageLabImageFromFile(file);
  }

  async function setImageLabImageFromFile(file) {
    if (!state.imageLab) return false;
    try {
      const processed = await resizeImage(file, 900, 700, 0.80);
      clearImageLabPreviewUrl();
      state.imageLab.bytes = processed.bytes;
      state.imageLab.mime = processed.mime;
      state.imageLab.source = state.imageLab.pendingSource?.source || 'clipboard';
      state.imageLab.sourceUrl = state.imageLab.pendingSource?.url || '';
      state.imageLab.author = state.imageLab.pendingSource?.author || '';
      state.imageLab.pendingSource = null;
      state.imageLab.previewUrl = bytesToObjectUrl(processed.bytes, processed.mime);
      $('#imageLabPreview').innerHTML = `<img src="${state.imageLab.previewUrl}" alt="Предпросмотр">`;
      renderImageAttribution($('#imageLabAttribution'), state.imageLab.source, state.imageLab.author, state.imageLab.sourceUrl);
      $('#imageLabPasteFallback').classList.add('hidden');
      return true;
    } catch (error) {
      toast(error.message || 'Не удалось обработать изображение', 'error');
      return false;
    }
  }

  function clearImageLabImage() {
    if (!state.imageLab) return;
    clearImageLabPreviewUrl();
    state.imageLab.bytes = null;
    state.imageLab.mime = '';
    state.imageLab.source = '';
    state.imageLab.sourceUrl = '';
    state.imageLab.author = '';
    $('#imageLabPreview').innerHTML = '<div><span>✦</span><small>Выбери визуальный якорь</small></div>';
    renderImageAttribution($('#imageLabAttribution'), '', '', '');
  }

  function clearImageLabPreviewUrl() {
    if (state.imageLab?.previewUrl) URL.revokeObjectURL(state.imageLab.previewUrl);
    if (state.imageLab) state.imageLab.previewUrl = null;
  }

  function showImageLabPasteFallback() {
    $('#imageLabPasteFallback').classList.remove('hidden');
    $('#imageLabPasteTarget').innerHTML = '';
  }

  async function handleImageLabPaste(event) {
    const file = fileFromClipboardEvent(event);
    if (file) {
      event.preventDefault();
      const success = await setImageLabImageFromFile(file);
      if (success) toast('Изображение вставлено');
      return;
    }
    const html = event.clipboardData?.getData('text/html') || '';
    const htmlFile = html ? await imageFileFromHtml(html) : null;
    if (htmlFile) {
      event.preventDefault();
      const success = await setImageLabImageFromFile(htmlFile);
      if (success) toast('Изображение вставлено');
    }
  }

  async function handleImageLabPasteTargetInput() {
    const file = await imageFileFromEditable($('#imageLabPasteTarget'));
    if (!file) return;
    const success = await setImageLabImageFromFile(file);
    if (success) toast('Изображение вставлено');
  }

  function skipImageLabCard() {
    if (!state.imageLab) return;
    state.imageLab.index += 1;
    renderImageLab();
  }

  async function saveImageLabAndNext() {
    const lab = state.imageLab;
    if (!lab) return;
    if (!lab.bytes?.length) return toast('Сначала выбери или вставь картинку', 'error');
    const card = lab.queue[lab.index];
    LexiDB.updateCard({
      ...card,
      image_search_query: $('#imageLabQuery').value.trim(),
      image_search_query_en: lab.queryEn || '',
      image_search_query_en_source: lab.queryEnSource || '',
      image_search_translation_provider: lab.translationProvider || '',
      image_blob: lab.bytes,
      image_mime: lab.mime,
      image_source: lab.source,
      image_author: lab.author || '',
      image_source_url: lab.sourceUrl
    });
    lab.processed += 1;
    lab.index += 1;
    renderImageLab();
  }

  async function resizeImage(file, maxWidth, maxHeight, quality) {
    if (!file?.type?.startsWith('image/')) throw new Error('Выбранный файл не является изображением');
    if (file.size > 25 * 1024 * 1024) throw new Error('Изображение слишком большое: максимум 25 МБ');
    const decoded = await decodeImage(file);
    const scale = Math.min(1, maxWidth / decoded.width, maxHeight / decoded.height);
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);
    decoded.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    const finalBlob = blob || file;
    return { bytes: new Uint8Array(await finalBlob.arrayBuffer()), mime: finalBlob.type || file.type || 'image/jpeg' };
  }

  async function decodeImage(file) {
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
    }
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const node = new Image();
        node.onload = () => resolve(node);
        node.onerror = () => reject(new Error('Не удалось прочитать изображение'));
        node.src = url;
      });
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  function fileFromClipboardEvent(event) {
    const item = [...(event.clipboardData?.items || [])].find((entry) => entry.type.startsWith('image/'));
    return item?.getAsFile() || null;
  }

  async function imageFileFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const source = doc.querySelector('img')?.src;
    return source ? imageFileFromSource(source) : null;
  }

  async function imageFileFromEditable(node) {
    const source = node.querySelector('img')?.src;
    return source ? imageFileFromSource(source) : null;
  }

  async function imageFileFromSource(source) {
    if (!source || (!source.startsWith('data:image/') && !source.startsWith('blob:'))) return null;
    try {
      const blob = await (await fetch(source)).blob();
      return blob.type.startsWith('image/') ? new File([blob], 'pasted-image', { type: blob.type }) : null;
    } catch {
      return null;
    }
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
      hint: ['подсказка / нюанс', 'подсказка/нюанс', 'подсказка', 'hint', 'note'],
      image_search_query: ['поиск картинки', 'запрос для картинки', 'image search', 'image query']
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
      hint: getCell(row, index.hint),
      image_search_query: getCell(row, index.image_search_query)
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
    container.innerHTML = `<div class="csv-preview-head"><span>${escapeHtml(state.csvFileName)}</span><span>${parsed.cards.length} строк · ${delimiterName}${warning}</span><span>Предпросмотр</span></div>${parsed.cards.slice(0, 5).map((card) => `<div class="csv-preview-row"><strong>${escapeHtml(card.word)}</strong><span>${escapeHtml(card.example_el || '—')}</span><span>${escapeHtml(card.word_translation || '—')}</span></div>`).join('')}`;
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
    toast(`Сборник «${deckName}» импортирован`);
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
    $('#databaseInfo').innerHTML = `<div><strong>${info.decks}</strong><small>сборников</small></div><div><strong>${info.cards}</strong><small>карточек</small></div><div><strong>${info.images}</strong><small>картинок</small></div><div><strong>${formatBytes(info.bytes)}</strong><small>размер</small></div>`;
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
    const ok = await confirmAction('Заменить локальную базу?', `Файл «${file.name}» заменит текущие данные. Перед заменой будет скачана резервная копия.`, 'Заменить');
    if (!ok) return;
    try {
      exportDatabase('lexianchor-backup');
      await LexiDB.replaceDatabase(await file.arrayBuffer());
      state.activeDeckId = null;
      resetStudyUi();
      await refreshAll();
      toast('SQLite-база загружена');
    } catch (error) {
      toast(`Не удалось загрузить базу: ${error.message}`, 'error');
    }
  }

  function setDbStatus(text, saving) {
    const node = $('#dbStatus');
    if (!node) return;
    node.lastChild.textContent = text;
    node.style.opacity = saving ? '.68' : '1';
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

  function renderImageAttribution(node, source, author, url) {
    if (!node) return;
    if (source !== 'pexels') {
      node.classList.add('hidden');
      node.innerHTML = '';
      return;
    }
    const label = `Photo by ${author || 'Pexels'} on Pexels`;
    node.innerHTML = url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
      : escapeHtml(label);
    node.classList.remove('hidden');
  }

  function googleImagesUrl(query) {
    return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
  }

  function bytesToObjectUrl(bytes, mime) {
    return URL.createObjectURL(new Blob([bytes], { type: mime || 'image/jpeg' }));
  }

  function revokeQuizImage() {
    if (state.quizImageUrl) URL.revokeObjectURL(state.quizImageUrl);
    state.quizImageUrl = null;
  }

  function isMobileLike() {
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
  }

  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function normalizeAnswer(value) {
    return String(value || '').trim().toLocaleLowerCase('el-GR').replace(/\s+/g, ' ');
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
    return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`;
  }
})();
