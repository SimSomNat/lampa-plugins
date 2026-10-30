// @lampa-desc: Экспериментальный выбор разрешённых потоков; для большинства фильмов требуется собственный каталог.
/* Lampa SmartBalancer — GPL-2.0. No bundled third-party runtime. */
(function (root) {
    'use strict';
    var DEMO = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
    // Curated CC BY 3.0 Blender films, matched by verified TMDB IDs only.
    var OPEN_FILMS = [
        { type: 'movie', ids: { tmdb: 45745 }, year: 2010, url: 'https://archive.org/download/Sintel/sintel-2048-stereo_512kb.mp4', format: 'mp4', language: 'en' },
        { type: 'movie', ids: { tmdb: 10378 }, year: 2008, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', format: 'hls', language: 'en' }
    ];
    function safeUrl(value) {
        if (typeof value !== 'string' || value.length > 4096 || /[\s\x00-\x1f]/.test(value)) return false;
        try { var u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch (_) { return false; }
    }
    function mediaFrom(movie, object) {
        movie = movie || {}; object = object || {};
        var type = object.method === 'tv' || movie.name || movie.first_air_date ? 'tv' : 'movie';
        var date = movie.release_date || movie.first_air_date || '';
        var source = movie.source || object.source;
        var tmdb = movie.tmdb_id || (source === 'tmdb' ? movie.id : null);
        return { type: type, tmdb: tmdb && String(tmdb), imdb: movie.imdb_id && String(movie.imdb_id), title: String(movie.title || movie.name || ''), year: String(date).slice(0, 4), season: null, episode: null };
    }
    function match(media, item) {
        if (!item || item.type !== media.type || !item.ids || typeof item.ids !== 'object') return false;
        var found = false, keys = ['tmdb', 'imdb'];
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (media[key] && item.ids[key]) {
                if (String(media[key]) !== String(item.ids[key])) return false;
                found = true;
            }
        }
        if (!found || (media.year && item.year && String(media.year) !== String(item.year))) return false;
        if (media.type === 'tv' && (!Number.isInteger(media.season) || !Number.isInteger(media.episode) || item.season !== media.season || item.episode !== media.episode)) return false;
        return true;
    }
    function normalize(media, item, provider) {
        if (!match(media, item) || !safeUrl(item.url) || item.headers || item.cookies || item.drm || item.expiresAt && (!Number.isFinite(Date.parse(item.expiresAt)) || Date.parse(item.expiresAt) <= Date.now())) return null;
        var path = item.url.split('?')[0].toLowerCase();
        var format = item.format || (/\.m3u8$/.test(path) ? 'hls' : /\.mpd$/.test(path) ? 'dash' : /\.mp4$/.test(path) ? 'mp4' : /\.mkv$/.test(path) ? 'mkv' : '');
        if (['hls', 'dash', 'mp4', 'mkv'].indexOf(format) < 0) return null;
        var key = media.tmdb && /^\d+$/.test(media.tmdb) ? 'tmdb:' + media.tmdb : media.imdb && /^tt\d+$/.test(media.imdb) ? 'imdb:' + media.imdb : '';
        return { providerId: provider, title: media.title, url: item.url, format: format, resolution: Number(item.resolution) || 0, language: String(item.language || '').slice(0, 40), voiceover: String(item.voiceover || '').slice(0, 80), status: 'unknown', expiresAt: item.expiresAt || '', autoEligible: media.type !== 'tv' || item.episodeOrder === 'tmdb', mediaKey: key, season: media.season, episode: media.episode };
    }
    function rank(items, desired, language, voiceover) {
        var target = Number(desired) || 1080;
        function preferred(item, field, value) { return value && String(item[field] || '').toLowerCase() === String(value).toLowerCase() ? 1 : 0; }
        return items.slice().sort(function (a, b) {
            var aa = a.status === 'available' ? 2 : a.status === 'unknown' ? 1 : 0;
            var bb = b.status === 'available' ? 2 : b.status === 'unknown' ? 1 : 0;
            return bb - aa || preferred(b, 'language', language) - preferred(a, 'language', language) || preferred(b, 'voiceover', voiceover) - preferred(a, 'voiceover', voiceover) || (a.resolution ? Math.abs(a.resolution - target) : 100000) - (b.resolution ? Math.abs(b.resolution - target) : 100000) || a.providerId.localeCompare(b.providerId) || a.url.localeCompare(b.url);
        });
    }
    function History(storage) { this.storage = storage; this.key = 'smartbalancer_history_v1'; }
    History.prototype.load = function () {
        try {
            var data = JSON.parse(this.storage.getItem(this.key) || 'null');
            if (!data || data.version !== 1 || !Array.isArray(data.entries)) return [];
            return data.entries.filter(function (e) { return e && typeof e.at === 'number' && e.at <= Date.now() && e.at > Date.now() - 2592000000 && /^(tmdb:\d+|imdb:tt\d+)$/.test(e.mediaKey || '') && typeof e.provider === 'string'; }).slice(-50);
        } catch (_) { return []; }
    };
    History.prototype.add = function (item) {
        if (!item.mediaKey || !/^(tmdb:\d+|imdb:tt\d+)$/.test(item.mediaKey) || !/^(catalog-[12]|open-films)$/.test(item.providerId)) return;
        var entries = this.load();
        entries.push({ mediaKey: item.mediaKey, provider: item.providerId, season: Number.isInteger(item.season) ? item.season : null, episode: Number.isInteger(item.episode) ? item.episode : null, event: 'attempted', at: Date.now() });
        try { this.storage.setItem(this.key, JSON.stringify({ version: 1, entries: entries.slice(-50) })); } catch (_) {}
    };
    History.prototype.clear = function () { try { this.storage.removeItem(this.key); } catch (_) {} };
    function validate(url, signal) {
        return fetch(url, { method: 'HEAD', signal: signal, credentials: 'omit', cache: 'no-store' }).then(function (r) {
            if (r.ok) return 'available';
            if (r.status === 401 || r.status === 403) return 'unauthorized';
            if (r.status === 404 || r.status === 410) return 'unavailable';
            return 'unknown';
        }, function () { return 'unknown'; });
    }
    function validateLimited(url, parentSignal, timeout) {
        var ctrl = new AbortController(), timer;
        function abort() { ctrl.abort(); }
        if (parentSignal.aborted) ctrl.abort();
        else parentSignal.addEventListener('abort', abort);
        var deadline = new Promise(function (resolve) { timer = setTimeout(function () { ctrl.abort(); resolve('unknown'); }, timeout); });
        return Promise.race([validate(url, ctrl.signal), deadline]).then(function (status) { clearTimeout(timer); parentSignal.removeEventListener('abort', abort); return status; });
    }
    function readCatalog(response, signal) {
        var limit = 1048576, length = Number(response.headers.get('content-length'));
        if (length > limit) return Promise.reject(new Error('catalog_too_large'));
        // A buffered fallback would make the limit unenforceable if the server lies.
        if (!response.body || !response.body.getReader || typeof TextDecoder === 'undefined') return Promise.reject(new Error('streaming_unsupported'));
        var reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
        var bytes = 0, parts = [], cancelled = false;
        function stop() { cancelled = true; try { Promise.resolve(reader.cancel()).catch(function () {}); } catch (_) {} }
        if (signal.aborted) stop(); else signal.addEventListener('abort', stop);
        function finish() { signal.removeEventListener('abort', stop); try { reader.releaseLock(); } catch (_) {} }
        function read() {
            if (cancelled) return Promise.reject(new Error('cancelled'));
            return reader.read().then(function (chunk) {
                if (cancelled) throw new Error('cancelled');
                if (chunk.done) { parts.push(decoder.decode()); return parts.join(''); }
                bytes += chunk.value.byteLength;
                if (bytes > limit) { stop(); throw new Error('catalog_too_large'); }
                parts.push(decoder.decode(chunk.value, { stream: true }));
                return read();
            });
        }
        return read().then(function (text) { finish(); return text; }, function (error) { stop(); finish(); throw error; });
    }
    function searchCatalog(url, provider, media, signal) {
        return fetch(url, { signal: signal, credentials: 'omit', cache: 'no-store' }).then(function (r) {
            if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'unauthorized' : r.status === 404 || r.status === 410 ? 'not_found' : 'http_error');
            return readCatalog(r, signal);
        }).then(function (text) {
            if (text.length > 1048576) throw new Error('catalog_too_large');
            var json;
            try { json = JSON.parse(text); } catch (_) { throw new Error('invalid_catalog'); }
            if (!json || json.version !== 1 || !Array.isArray(json.items) || json.items.length > 5000) throw new Error('invalid_catalog');
            return json.items.map(function (item) { return normalize(media, item, provider); }).filter(Boolean).slice(0, 30);
        });
    }
    function openFilms(media) {
        return OPEN_FILMS.map(function (item) { return normalize(media, item, 'open-films'); }).filter(Boolean);
    }
    // Adapter contract: id, enabled(media), search(media, context, signal).
    // These direct-URL adapters return already normalized candidates; they do
    // not extract URLs from websites or resolve protected players.
    function SourceRegistry() { this.sources = []; }
    SourceRegistry.prototype.register = function (adapter) {
        if (!adapter || !/^[a-z0-9-]+$/.test(adapter.id || '') || typeof adapter.search !== 'function' || this.sources.some(function (item) { return item.id === adapter.id; })) throw new Error('invalid_adapter');
        this.sources.push(adapter);
    };
    SourceRegistry.prototype.enabled = function (media) {
        return this.sources.filter(function (adapter) { try { return !adapter.enabled || adapter.enabled(media); } catch (_) { return false; } });
    };
    function defaultSources(urls, includeOpenFilms) {
        var registry = new SourceRegistry();
        urls.slice(0, 2).forEach(function (url, index) {
            if (!safeUrl(url)) return;
            var id = 'catalog-' + (index + 1);
            registry.register({ id: id, search: function (media, context, signal) { return searchCatalog(url, id, media, signal); } });
        });
        if (includeOpenFilms) registry.register({ id: 'open-films', enabled: function (media) { return openFilms(media).length > 0; }, search: function (media) { return Promise.resolve(openFilms(media)); } });
        return registry;
    }
    function Engine(options) { this.options = options || {}; this.session = 0; this.controllers = []; this.timers = []; this.pending = []; }
    Engine.prototype.cancel = function () { this.session++; this.controllers.forEach(function (c) { c.abort(); }); this.controllers = []; this.pending.forEach(function (stop) { stop(); }); this.pending = []; this.timers.forEach(clearTimeout); this.timers = []; };
    Engine.prototype.search = function (media, urls, progress, onCandidate) {
        var self = this; self.cancel(); var id = self.session, results = [], errors = [], checked = 0;
        var timeout = Math.max(1000, Math.min(Number(self.options.timeout) || 8000, 30000));
        var sources = (self.options.registry || defaultSources(urls, self.options.openFilms)).enabled(media);
        function task(source) {
            var ctrl = new AbortController(); self.controllers.push(ctrl);
            var timer, stop;
            var deadline = new Promise(function (_, reject) { stop = function () { reject(new Error('cancelled')); }; self.pending.push(stop); timer = setTimeout(function () { ctrl.abort(); reject(new Error('timeout')); }, timeout); self.timers.push(timer); });
            var request = Promise.resolve().then(function () { if (ctrl.signal.aborted) throw new Error('cancelled'); return source.search(media, {}, ctrl.signal); });
            var work = request.then(function (items) {
                if (id !== self.session) return [];
                results = results.concat(items);
                return items.slice(0, 3).reduce(function (chain, item) { return chain.then(function () { if (id !== self.session || ctrl.signal.aborted) return; return validateLimited(item.url, ctrl.signal, Math.min(1500, Math.floor(timeout / 2))).then(function (status) { if (id !== self.session || ctrl.signal.aborted) return; item.status = status; if (onCandidate) onCandidate(item); }); }); }, Promise.resolve()).then(function () { return items; });
            });
            return Promise.race([work, deadline]).then(function () {}, function (e) {
                if (id === self.session) {
                    var code = e && e.message;
                    errors.push(['unauthorized', 'not_found', 'http_error', 'timeout', 'invalid_catalog', 'catalog_too_large', 'streaming_unsupported'].indexOf(code) >= 0 ? code : 'unavailable_or_cors');
                }
            }).then(function () {
                clearTimeout(timer); self.pending = self.pending.filter(function (p) { return p !== stop; }); self.controllers = self.controllers.filter(function (c) { return c !== ctrl; }); self.timers = self.timers.filter(function (t) { return t !== timer; }); if (id === self.session) { checked++; if (progress) progress(checked, results.length); }
            });
        }
        return Promise.all(sources.map(task)).then(function () {
            var seen = Object.create(null);
            var unique = rank(results, self.options.quality, self.options.language, self.options.voiceover).filter(function (item) { if (seen[item.url]) return false; seen[item.url] = true; return true; });
            return { active: id === self.session, items: unique, errors: errors, checked: checked };
        });
    };
    // All calls to Lampa and its card DOM are confined to this adapter.
    function LampaBridge(host) { this.host = host; this.api = host.Lampa; }
    LampaBridge.prototype.notify = function (text) { this.api.Noty.show('SmartBalancer: ' + text); };
    LampaBridge.prototype.back = function () { this.api.Controller.toggle('content'); };
    LampaBridge.prototype.menu = function (title, items, onBack) {
        var bridge = this;
        this.api.Select.show({ title: title, items: items, onSelect: function (item) { if (item.action) item.action(); }, onBack: onBack || function () { bridge.back(); } });
    };
    LampaBridge.prototype.closeMenu = function () { this.api.Select.close(); };
    LampaBridge.prototype.settings = function () {
        if (this.api.Settings && this.api.Settings.create) this.api.Settings.create('smartbalancer');
        else this.notify('Откройте настройки SmartBalancer.');
    };
    LampaBridge.prototype.play = function (item) { this.api.Player.play({ url: item.url, title: item.title }); };
    LampaBridge.prototype.follow = function (name, callback) { this.api.Listener.follow(name, callback); };
    LampaBridge.prototype.activeCard = function () { return this.api.Activity && this.api.Activity.active ? this.api.Activity.active() : null; };
    LampaBridge.prototype.bindCard = function (object, onEnter, onLong) {
        var body = object.activity.render();
        if (body.find('.smartbalancer-button').length) return;
        var container = body.find('.full-start__buttons, .full-start-new__buttons, .buttons--container').first();
        if (!container.length) return;
        var button = this.host.$('<div class="full-start__button selector smartbalancer-button"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 4v16l12-8z"/></svg><span>Смотреть · SB</span></div>');
        button.on('hover:enter', onEnter);
        button.on('hover:long', onLong);
        container.append(button);
    };
    LampaBridge.prototype.registerSettings = function (clearHistory) {
        var api = this.api.SettingsApi;
        if (!api) return;
        api.addComponent({ component: 'smartbalancer', name: 'SmartBalancer', icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>' });
        [1, 2].forEach(function (n) { api.addParam({ component: 'smartbalancer', param: { name: 'smartbalancer_catalog' + n, type: 'input', default: '' }, field: { name: 'HTTPS URL каталога ' + n, description: 'Публичный разрешённый JSON-каталог, без секретов' } }); });
        api.addParam({ component: 'smartbalancer', param: { name: 'smartbalancer_auto', type: 'trigger', default: true }, field: { name: 'Автоматический выбор доступного потока' } });
        api.addParam({ component: 'smartbalancer', param: { name: 'smartbalancer_open_films', type: 'trigger', default: true }, field: { name: 'Открытые фильмы Blender (2 фильма)' } });
        api.addParam({ component: 'smartbalancer', param: { name: 'smartbalancer_quality', type: 'select', values: { '720': '720p', '1080': '1080p', '2160': '4K' }, default: '1080' }, field: { name: 'Желаемое качество' } });
        api.addParam({ component: 'smartbalancer', param: { name: 'smartbalancer_language', type: 'input', default: '' }, field: { name: 'Предпочитаемый язык (например ru)' } });
        api.addParam({ component: 'smartbalancer', param: { name: 'smartbalancer_voiceover', type: 'input', default: '' }, field: { name: 'Предпочитаемая озвучка (точное название)' } });
        api.addParam({ component: 'smartbalancer', param: { name: 'smartbalancer_timeout', type: 'select', values: { '4000': '4 с', '8000': '8 с', '15000': '15 с' }, default: '8000' }, field: { name: 'Тайм-аут источника' } });
        api.addParam({ component: 'smartbalancer', param: { type: 'button' }, field: { name: 'Очистить историю попыток SmartBalancer' }, onChange: clearHistory });
    };
    var core = { safeUrl: safeUrl, mediaFrom: mediaFrom, match: match, normalize: normalize, rank: rank, Engine: Engine, validate: validate, readCatalog: readCatalog, openFilms: openFilms, History: History, SourceRegistry: SourceRegistry, defaultSources: defaultSources };
    if (typeof module !== 'undefined' && module.exports) module.exports = core;
    // Lampa's extension checker recognizes source containing the public Lampa. API.
    // The listener is also required for attaching and cancelling card sessions.
    if (!root || !root.Lampa || !root.Lampa.Listener || root.smartbalancer_loaded) return;
    root.smartbalancer_loaded = true;
    var bridge = new LampaBridge(root), engine = new Engine(), history = new History(root.localStorage), current = null, currentMedia = null, searching = false, closing = false;
    function read(name, fallback) { try { var v = root.localStorage.getItem(name); if (v === null) return fallback; if (v === 'true') return true; if (v === 'false') return false; return v; } catch (_) { return fallback; } }
    function notify(text) { bridge.notify(text); }
    function back() { bridge.back(); }
    function menu(title, items, onBack) { bridge.menu(title, items, onBack); }
    function settings() { bridge.settings(); }
    function play(item) {
        if (!safeUrl(item.url) || item.expiresAt && (!Number.isFinite(Date.parse(item.expiresAt)) || Date.parse(item.expiresAt) <= Date.now())) { notify('Ссылка истекла или недопустима. Повторите поиск.'); return; }
        history.add(item);
        try { bridge.play(item); notify('Ссылка передана плееру; воспроизведение не подтверждено.'); }
        catch (_) { notify('Не удалось передать ссылку плееру. Выберите другой источник.'); }
    }
    function escapeText(value) { return String(value).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
    function showResults(result, card) {
        var items = result.items.filter(function (i) { return i.status === 'available' || i.status === 'unknown'; });
        var reasons = { unauthorized: 'каталог требует авторизацию', not_found: 'каталог не найден (404)', http_error: 'ошибка сервера каталога', timeout: 'превышено время ожидания', invalid_catalog: 'некорректный JSON-каталог', catalog_too_large: 'каталог превышает 1 МиБ', streaming_unsupported: 'WebView не поддерживает потоковое чтение', unavailable_or_cors: 'сеть, TLS или CORS не позволяют прочитать каталог' };
        if (!items.length) { notify(result.errors.length ? 'Нет вариантов: ' + (reasons[result.errors[0]] || 'ошибка источника') + '.' : result.items.length ? 'Найденные варианты недоступны или требуют авторизацию.' : 'Совпадений с точным ID и эпизодом нет.'); back(); return; }
        menu('Источники SmartBalancer', items.map(function (item) { return { title: item.providerId + ' · ' + (item.resolution ? item.resolution + 'p' : 'качество неизвестно') + ' · ' + item.format + ' · ' + item.status + (item.language ? ' · ' + escapeText(item.language) : '') + (item.voiceover ? ' · ' + escapeText(item.voiceover) : '') + (!item.autoEligible ? ' · нумерация не подтверждена' : ''), action: function () { if (current === card) { back(); play(item); } } }; }));
    }
    function run(media, manual) {
        if (searching) { notify('Поиск уже выполняется.'); return; }
        var configured = [read('smartbalancer_catalog1', ''), read('smartbalancer_catalog2', '')];
        var urls = configured.map(function (url) { return safeUrl(url) ? url : null; });
        var configuredCount = urls.filter(Boolean).length;
        var invalidCount = configured.filter(function (url) { return url && !safeUrl(url); }).length;
        engine.options.openFilms = read('smartbalancer_open_films', true);
        if (!configuredCount && !(engine.options.openFilms && openFilms(media).length)) { notify(invalidCount ? 'URL каталога должен быть HTTPS без логина и пароля.' : 'Для этого фильма нет подключённых каталогов. Укажите HTTPS URL в настройках.'); settings(); return; }
        if (invalidCount) notify('Некорректный URL каталога пропущен; остальные источники будут проверены.');
        engine.options.timeout = Number(read('smartbalancer_timeout', '8000')); engine.options.quality = read('smartbalancer_quality', '1080');
        engine.options.language = String(read('smartbalancer_language', '')).trim(); engine.options.voiceover = String(read('smartbalancer_voiceover', '')).trim();
        searching = true; var card = current;
        menu('Поиск SmartBalancer', [{ title: 'Отменить поиск', action: function () { engine.cancel(); searching = false; back(); } }], function () { if (!closing) { engine.cancel(); searching = false; back(); } });
        var count = configuredCount + (engine.options.openFilms && openFilms(media).length ? 1 : 0);
        engine.search(media, urls, function (checked, found) { if (current === card) notify('Проверено: ' + checked + '/' + count + ', вариантов: ' + found); }, function (item) {
            if (current !== card || !searching || manual || !read('smartbalancer_auto', true) || item.status !== 'available' || item.format === 'mkv' || !item.autoEligible || (engine.options.language && item.language.toLowerCase() !== engine.options.language.toLowerCase()) || (engine.options.voiceover && item.voiceover.toLowerCase() !== engine.options.voiceover.toLowerCase())) return;
            engine.cancel(); searching = false; closing = true; bridge.closeMenu(); closing = false; back(); play(item);
        }).then(function (result) {
            if (!result.active || current !== card) return;
            searching = false; closing = true; bridge.closeMenu(); closing = false;
            var available = result.items.filter(function (i) { return i.status === 'available' && i.format !== 'mkv' && i.autoEligible; });
            if (!manual && read('smartbalancer_auto', true) && available.length) { back(); play(available[0]); }
            else showResults(result, card);
        });
    }
    function episode(media, card, cb) {
        function choices(title, max, next) {
            var items = [];
            for (var n = 0; n <= max; n++) (function (value) {
                items.push({ title: String(value), action: function () { if (current === card) next(value); } });
            }(n));
            menu(title, items);
        }
        function selectSeason() { choices('Выберите сезон (0 — специальные выпуски)', 30, function (season) {
            choices('Выберите серию', 100, function (number) { media.season = season; media.episode = number; cb(); });
        }); }
        var key = media.tmdb && /^\d+$/.test(media.tmdb) ? 'tmdb:' + media.tmdb : media.imdb && /^tt\d+$/.test(media.imdb) ? 'imdb:' + media.imdb : '';
        var last = history.load().reverse().find(function (entry) { return entry.mediaKey === key && Number.isInteger(entry.season) && Number.isInteger(entry.episode); });
        if (!last) return selectSeason();
        menu('Выбор серии', [
            { title: 'Последняя попытка: сезон ' + last.season + ', серия ' + last.episode, action: function () { if (current === card) { media.season = last.season; media.episode = last.episode; cb(); } } },
            { title: 'Выбрать другую серию', action: function () { if (current === card) selectSeason(); } }
        ]);
    }
    function begin(media, manual) {
        var card = current;
        if (!card || searching) return;
        if (media.type === 'tv') episode(media, card, function () { if (current === card) run(media, manual); });
        else run(media, manual);
    }
    function cardMenu(media) {
        var card = current;
        menu('SmartBalancer', [
            { title: 'Смотреть', action: function () { if (current === card) begin(media, false); } },
            { title: 'Источники', action: function () { if (current === card) begin(media, true); } },
            { title: 'Диагностика: открытое тестовое видео', action: function () { if (current === card) { back(); play({ title: 'Диагностическое видео', url: DEMO }); } } },
            { title: 'Настройки', action: function () { if (current === card) settings(); } }
        ]);
    }
    bridge.registerSettings(function () { history.clear(); notify('История попыток очищена.'); });
    bridge.follow('full', function (e) {
        if (e.type === 'start') {
            if (bridge.activeCard() && bridge.activeCard() !== e.object) return;
            engine.cancel(); searching = false; current = e.object; currentMedia = null;
        }
        if (e.type === 'options' && current && currentMedia && e.options) {
            var card = current, media = currentMedia;
            e.options.push({ title: 'SmartBalancer: источники и диагностика', onSelect: function () { if (current === card) cardMenu(media); } });
            return;
        }
        if (e.type !== 'complite' || !e.data || !e.data.movie || !e.object || !e.object.activity) return;
        if ((bridge.activeCard() && bridge.activeCard() !== e.object) || (current && current !== e.object)) return;
        current = e.object; currentMedia = mediaFrom(e.data.movie, e.object);
        bridge.bindCard(e.object, function () { if (current === e.object && currentMedia) begin(currentMedia, false); }, function () { if (current === e.object && currentMedia) cardMenu(currentMedia); });
    });
    bridge.follow('activity', function (e) {
        if (e.type === 'start' && e.object !== current) {
            engine.cancel(); searching = false;
            current = e.component === 'full' ? e.object : null;
            currentMedia = current && current.card ? mediaFrom(current.card, current) : null;
        }
        if (e.type === 'destroy' && e.object === current) { engine.cancel(); searching = false; current = null; currentMedia = null; }
        // Lampa emits 'archive' after reactivating the previous activity, not when leaving it.
    });
}(typeof window !== 'undefined' ? window : null));
