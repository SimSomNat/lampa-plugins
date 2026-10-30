// @lampa-desc: Поиск видео по карточке; доступность зависит от источников.
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
    function mediaFrom(movie, object, data) {
        movie = movie || {}; object = object || {};
        var type = object.method === 'tv' || movie.name || movie.first_air_date ? 'tv' : 'movie';
        var date = movie.release_date || movie.first_air_date || '';
        var source = movie.source || object.source;
        var tmdb = movie.tmdb_id || (source === 'tmdb' ? movie.id : null);
        return { type: type, tmdb: tmdb && String(tmdb), imdb: movie.imdb_id && String(movie.imdb_id), title: String(movie.title || movie.name || ''), originalTitle: String(movie.original_title || movie.original_name || movie.title || movie.name || '').slice(0, 160), runtime: Number(movie.runtime) || 0, year: String(date).slice(0, 4), season: null, episode: null, seasons: seasonMetadata(movie, data) };
    }
    function nonnegativeInteger(value) {
        if (typeof value === 'string' && /^\d+$/.test(value)) value = Number(value);
        return Number.isSafeInteger(value) && value >= 0 ? value : null;
    }
    function seasonMetadata(movie, data) {
        movie = movie || {}; data = data || {};
        var seasons = [], seen = Object.create(null);
        if (Array.isArray(movie.seasons)) movie.seasons.forEach(function (season) {
            var number = season && nonnegativeInteger(season.season_number), count = season && nonnegativeInteger(season.episode_count);
            if (number === null || number > 9999 || seen[number] || count === 0) return;
            seen[number] = true;
            seasons.push({ number: number, count: Number.isInteger(count) && count > 0 && count <= 10000 ? count : null, episodes: [] });
        });
        var total = nonnegativeInteger(movie.number_of_seasons);
        if (!seasons.length && total && total <= 1000) {
            for (var n = 1; n <= total; n++) seasons.push({ number: n, count: null, episodes: [] });
        }
        var details = data.episodes;
        var detailSeason = details && nonnegativeInteger(details.season_number);
        if (details && detailSeason !== null && Array.isArray(details.episodes)) {
            var season = seasons.find(function (entry) { return entry.number === detailSeason; });
            if (!season && !seen[detailSeason] && detailSeason <= 9999) {
                season = { number: detailSeason, count: null, episodes: [] }; seasons.push(season);
            }
            if (season) season.episodes = exactEpisodes(details, season.number);
        }
        return seasons.sort(function (a, b) { return a.number - b.number; });
    }
    function exactEpisodes(data, season) {
        var seen = Object.create(null);
        var detailSeason = data && nonnegativeInteger(data.season_number);
        if (!data || !Array.isArray(data.episodes) || (detailSeason !== null && detailSeason !== season)) return [];
        return data.episodes.filter(function (episode) {
            var number = episode && nonnegativeInteger(episode.episode_number), episodeSeason = episode && nonnegativeInteger(episode.season_number);
            if (!episode || number === null || number > 9999 || (episodeSeason !== null && episodeSeason !== season) || seen[number]) return false;
            seen[number] = true; return true;
        }).map(function (episode) { return { number: nonnegativeInteger(episode.episode_number), title: String(episode.name || '').slice(0, 120) }; }).sort(function (a, b) { return a.number - b.number; });
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
        var format = item.format || (/\.m3u8$/.test(path) ? 'hls' : /\.mpd$/.test(path) ? 'dash' : /\.mp4$/.test(path) ? 'mp4' : /\.mkv$/.test(path) ? 'mkv' : /\.webm$/.test(path) ? 'webm' : '');
        if (['hls', 'dash', 'mp4', 'mkv', 'webm'].indexOf(format) < 0) return null;
        var key = media.tmdb && /^\d+$/.test(media.tmdb) ? 'tmdb:' + media.tmdb : media.imdb && /^tt\d+$/.test(media.imdb) ? 'imdb:' + media.imdb : '';
        return { providerId: provider, title: media.title, url: item.url, format: format, resolution: Number(item.resolution) || 0, language: String(item.language || '').slice(0, 40), voiceover: String(item.voiceover || '').slice(0, 80), license: String(item.license || '').slice(0, 80), status: 'unknown', expiresAt: item.expiresAt || '', autoEligible: media.type !== 'tv' || (item.episodeOrder === 'tmdb' && media.episodeConfirmed !== false), mediaKey: key, season: media.season, episode: media.episode };
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
        if (!item.mediaKey || !/^(tmdb:\d+|imdb:tt\d+)$/.test(item.mediaKey) || !/^(catalog-[12]|open-films|wikimedia|reya)$/.test(item.providerId)) return;
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
    function canSearchWikimedia(media) {
        return media.type === 'movie' && !!(media.tmdb || media.imdb) && !!(media.originalTitle || media.title) && media.runtime > 0;
    }
    // This public API advertises direct playback by its own relay; no player
    // code, keys or special HTTP headers are read or forwarded by the plugin.
    function canSearchReya(media) {
        return !!media && (media.type === 'movie' || media.type === 'tv') && /^\d+$/.test(String(media.tmdb || ''));
    }
    function reyaSearch(media, context, signal) {
        if (!canSearchReya(media)) return Promise.resolve([]);
        if (media.type === 'tv' && (!Number.isInteger(media.season) || !Number.isInteger(media.episode) || media.season < 0 || media.episode < 1)) return Promise.resolve([]);
        var url = 'https://vidnst.reyamika.eu.cc/api/stream?tmdbId=' + encodeURIComponent(media.tmdb) + '&type=' + media.type;
        if (media.type === 'tv') url += '&season=' + media.season + '&episode=' + media.episode;
        return fetch(url, { signal: signal, credentials: 'omit', cache: 'no-store' }).then(function (response) {
            if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'unauthorized' : response.status === 404 || response.status === 410 ? 'not_found' : 'http_error');
            return readCatalog(response, signal);
        }).then(function (text) {
            var data; try { data = JSON.parse(text); } catch (_) { throw new Error('invalid_catalog'); }
            if (!data || String(data.tmdbId) !== String(media.tmdb) || data.mediaType !== media.type || !Array.isArray(data.streams) || data.streams.length > 100) throw new Error('invalid_catalog');
            if (media.type === 'tv' && (Number(data.season) !== media.season || Number(data.episode) !== media.episode)) throw new Error('invalid_catalog');
            return data.streams.filter(function (stream) {
                if (!stream || stream.type !== 'hls' || stream.source !== 'vidsrc' || !safeUrl(stream.url) || stream.drm || stream.cookies) return false;
                if (stream.headers && (typeof stream.headers !== 'object' || Object.keys(stream.headers).length)) return false;
                try { var parsed = new URL(stream.url); return parsed.hostname === 'vidnst.reyamika.eu.cc' && parsed.pathname.indexOf('/proxy/') === 0; } catch (_) { return false; }
            }).map(function (stream) {
                return normalize(media, { type: media.type, ids: { tmdb: media.tmdb }, year: media.year, season: media.season, episode: media.episode, url: stream.url, format: 'hls', resolution: parseInt(stream.quality, 10) || 0 }, 'reya');
            }).filter(Boolean).slice(0, 5);
        });
    }
    function mediaWikiJson(base, params, signal) {
        var query = Object.keys(params).map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]); }).join('&');
        return fetch(base + '?' + query, { signal: signal, credentials: 'omit', cache: 'no-store' }).then(function (response) {
            if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'unauthorized' : 'http_error');
            return readCatalog(response, signal);
        }).then(function (body) {
            try { return JSON.parse(body); } catch (_) { throw new Error('invalid_catalog'); }
        });
    }
    function claimStrings(claims, property) {
        return (Array.isArray(claims && claims[property]) ? claims[property] : []).map(function (entry) {
            return entry && entry.mainsnak && entry.mainsnak.datavalue && entry.mainsnak.datavalue.value;
        }).filter(function (value) { return typeof value === 'string'; });
    }
    function wikimediaSearch(media, context, signal) {
        if (!canSearchWikimedia(media)) return Promise.resolve([]);
        var wikidata = 'https://www.wikidata.org/w/api.php', commons = 'https://commons.wikimedia.org/w/api.php';
        var term = String(media.originalTitle || media.title).slice(0, 160);
        return mediaWikiJson(wikidata, { action: 'wbsearchentities', search: term, language: 'en', format: 'json', origin: '*', limit: 6 }, signal).then(function (result) {
            var ids = (Array.isArray(result.search) ? result.search : []).map(function (entry) { return entry && entry.id; }).filter(function (id) { return /^Q\d+$/.test(id || ''); }).slice(0, 6);
            if (!ids.length) return [];
            return mediaWikiJson(wikidata, { action: 'wbgetentities', ids: ids.join('|'), props: 'claims', format: 'json', origin: '*' }, signal).then(function (entities) {
                var files = [];
                ids.forEach(function (id) {
                    var claims = entities.entities && entities.entities[id] && entities.entities[id].claims;
                    var tmdb = claimStrings(claims, 'P4947'), imdb = claimStrings(claims, 'P345');
                    if ((media.tmdb && tmdb.length && tmdb.indexOf(String(media.tmdb)) < 0) || (media.imdb && imdb.length && imdb.indexOf(String(media.imdb)) < 0)) return;
                    if (!(media.tmdb && tmdb.indexOf(String(media.tmdb)) >= 0) && !(media.imdb && imdb.indexOf(String(media.imdb)) >= 0)) return;
                    claimStrings(claims, 'P10').forEach(function (file) { if (file.length <= 200 && !/[|\x00-\x1f]/.test(file) && files.indexOf(file) < 0) files.push(file); });
                });
                if (!files.length) return [];
                return mediaWikiJson(commons, { action: 'query', titles: files.slice(0, 4).map(function (file) { return 'File:' + file; }).join('|'), prop: 'videoinfo', viprop: 'url|size|mime|extmetadata|derivatives', format: 'json', origin: '*' }, signal).then(function (response) {
                    var pages = response && response.query && response.query.pages || {}, items = [];
                    Object.keys(pages).forEach(function (key) {
                        var page = pages[key], video = page && Array.isArray(page.videoinfo) && page.videoinfo[0];
                        var license = video && video.extmetadata && video.extmetadata.LicenseShortName && String(video.extmetadata.LicenseShortName.value || '');
                        var duration = video && Number(video.duration), expected = media.runtime * 60;
                        if (!video || !/^(Public domain|CC0|CC BY(?:-SA)?(?:\s|$))/i.test(license || '') || !duration || Math.abs(duration - expected) > Math.max(120, expected * 0.08)) return;
                        var variants = Array.isArray(video.derivatives) ? video.derivatives.slice() : [];
                        variants.push({ src: video.url, type: video.mime, height: video.height });
                        variants.forEach(function (variant) {
                            var url = variant && variant.src, type = variant && String(variant.type || '');
                            if (!safeUrl(url) || !/^https:\/\/upload\.wikimedia\.org\//i.test(url) || !/^video\/webm(?:;|$)/i.test(type)) return;
                            var quality = String(variant.transcodekey || '').match(/^(\d{3,4})p/);
                            var item = normalize(media, { type: 'movie', ids: { tmdb: media.tmdb, imdb: media.imdb }, year: media.year, url: url, format: 'webm', resolution: quality ? Number(quality[1]) : Number(variant.height) || 0, license: license }, 'wikimedia');
                            if (item) items.push(item);
                        });
                    });
                    return rank(items, context.quality).slice(0, 4);
                });
            });
        });
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
    function defaultSources(urls, includeOpenFilms, includeReya) {
        var registry = new SourceRegistry();
        urls.slice(0, 2).forEach(function (url, index) {
            if (!safeUrl(url)) return;
            var id = 'catalog-' + (index + 1);
            registry.register({ id: id, search: function (media, context, signal) { return searchCatalog(url, id, media, signal); } });
        });
        if (includeOpenFilms) registry.register({ id: 'open-films', enabled: function (media) { return openFilms(media).length > 0; }, search: function (media) { return Promise.resolve(openFilms(media)); } });
        registry.register({ id: 'wikimedia', enabled: canSearchWikimedia, search: wikimediaSearch });
        if (includeReya !== false) registry.register({ id: 'reya', enabled: canSearchReya, search: reyaSearch });
        return registry;
    }
    function Engine(options) { this.options = options || {}; this.session = 0; this.controllers = []; this.timers = []; this.pending = []; }
    Engine.prototype.cancel = function () { this.session++; this.controllers.forEach(function (c) { c.abort(); }); this.controllers = []; this.pending.forEach(function (stop) { stop(); }); this.pending = []; this.timers.forEach(clearTimeout); this.timers = []; };
    Engine.prototype.search = function (media, urls, progress, onCandidate) {
        var self = this; self.cancel(); var id = self.session, results = [], errors = [], checked = 0;
        var timeout = Math.max(1000, Math.min(Number(self.options.timeout) || 30000, 30000));
        var sources = (self.options.registry || defaultSources(urls, self.options.openFilms, self.options.reya)).enabled(media);
        function task(source) {
            var ctrl = new AbortController(); self.controllers.push(ctrl);
            var timer, stop;
            var deadline = new Promise(function (_, reject) { stop = function () { reject(new Error('cancelled')); }; self.pending.push(stop); timer = setTimeout(function () { ctrl.abort(); reject(new Error('timeout')); }, timeout); self.timers.push(timer); });
            var request = Promise.resolve().then(function () { if (ctrl.signal.aborted) throw new Error('cancelled'); return source.search(media, { quality: self.options.quality }, ctrl.signal); });
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
        var bridge = this;
        if (!this.api.Settings || !this.api.Settings.create) return this.notify('Откройте настройки SmartBalancer.');
        try {
            this.api.Controller.toggle('settings');
            this.api.Settings.create('smartbalancer', { onBack: function () { bridge.api.Controller.toggle('settings'); bridge.back(); } });
        } catch (_) { this.back(); this.notify('Не удалось открыть настройки SmartBalancer.'); }
    };
    LampaBridge.prototype.play = function (item) { this.api.Player.play({ url: item.url, title: item.title }); };
    LampaBridge.prototype.follow = function (name, callback) { this.api.Listener.follow(name, callback); };
    LampaBridge.prototype.activeCard = function () { return this.api.Activity && this.api.Activity.active ? this.api.Activity.active() : null; };
    LampaBridge.prototype.getSeason = function (movie, number, callback) {
        if (!this.api.Api || typeof this.api.Api.seasons !== 'function') return false;
        try { this.api.Api.seasons(movie, [number], callback); return true; } catch (_) { return false; }
    };
    LampaBridge.prototype.hasOnlineMod = function (object) {
        try { return Boolean(object && object.activity && object.activity.render().find('.view--online_mod').length); } catch (_) { return false; }
    };
    LampaBridge.prototype.openOnlineMod = function (object) {
        try { var button = object.activity.render().find('.view--online_mod'); if (!button.length) return false; button.first().trigger('hover:enter'); return true; } catch (_) { return false; }
    };
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
        [1, 2].forEach(function (n) { api.addParam({ component: 'smartbalancer', param: { name: 'smartbalancer_catalog' + n, type: 'input', values: '', default: '' }, field: { name: 'HTTPS URL каталога ' + n, description: 'Публичный разрешённый JSON-каталог, без секретов' } }); });
        api.addParam({ component: 'smartbalancer', param: { name: 'smartbalancer_auto', type: 'trigger', default: true }, field: { name: 'Автоматический выбор доступного потока' } });
        api.addParam({ component: 'smartbalancer', param: { name: 'smartbalancer_open_films', type: 'trigger', default: true }, field: { name: 'Открытые фильмы Blender (2 фильма)' } });
        api.addParam({ component: 'smartbalancer', param: { name: 'smartbalancer_reya', type: 'trigger', default: true }, field: { name: 'Поиск через Reya', description: 'Экспериментальный внешний API; передаёт сервису TMDB ID, сезон и серию' } });
        api.addParam({ component: 'smartbalancer', param: { name: 'smartbalancer_quality', type: 'select', values: { '720': '720p', '1080': '1080p', '2160': '4K' }, default: '1080' }, field: { name: 'Желаемое качество' } });
        api.addParam({ component: 'smartbalancer', param: { name: 'smartbalancer_language', type: 'input', values: '', default: '' }, field: { name: 'Предпочитаемый язык (например ru)' } });
        api.addParam({ component: 'smartbalancer', param: { name: 'smartbalancer_voiceover', type: 'input', values: '', default: '' }, field: { name: 'Предпочитаемая озвучка (точное название)' } });
        api.addParam({ component: 'smartbalancer', param: { name: 'smartbalancer_timeout', type: 'select', values: { '4000': '4 с', '8000': '8 с', '15000': '15 с', '30000': '30 с' }, default: '30000' }, field: { name: 'Тайм-аут источника' } });
        api.addParam({ component: 'smartbalancer', param: { type: 'button' }, field: { name: 'Очистить историю попыток SmartBalancer' }, onChange: clearHistory });
    };
    var core = { safeUrl: safeUrl, mediaFrom: mediaFrom, seasonMetadata: seasonMetadata, exactEpisodes: exactEpisodes, match: match, normalize: normalize, rank: rank, Engine: Engine, validate: validate, readCatalog: readCatalog, openFilms: openFilms, wikimediaSearch: wikimediaSearch, canSearchWikimedia: canSearchWikimedia, reyaSearch: reyaSearch, canSearchReya: canSearchReya, History: History, SourceRegistry: SourceRegistry, defaultSources: defaultSources };
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
        var reasons = { unauthorized: 'источник требует авторизацию', not_found: 'источник или видео не найдены', http_error: 'ошибка сервера источника', timeout: 'превышено время ожидания', invalid_catalog: 'некорректный ответ источника', catalog_too_large: 'ответ источника превышает 1 МиБ', streaming_unsupported: 'WebView не поддерживает потоковое чтение', unavailable_or_cors: 'сеть, TLS или CORS не позволяют прочитать источник' };
        if (!items.length) { notify(result.errors.length ? 'Нет вариантов: ' + (reasons[result.errors[0]] || 'ошибка источника') + '.' : result.items.length ? 'Найденные варианты недоступны или требуют авторизацию.' : 'В доступных источниках нет полного видео для этой карточки.'); back(); return; }
        menu('Источники SmartBalancer', items.map(function (item) { return { title: (item.providerId === 'wikimedia' ? 'Wikimedia Commons' : item.providerId) + ' · ' + (item.resolution ? item.resolution + 'p' : 'качество неизвестно') + ' · ' + item.format + ' · ' + item.status + (item.license ? ' · ' + escapeText(item.license) : '') + (item.language ? ' · ' + escapeText(item.language) : '') + (item.voiceover ? ' · ' + escapeText(item.voiceover) : '') + (!item.autoEligible ? ' · нумерация не подтверждена' : ''), action: function () { if (current === card) { back(); play(item); } } }; }));
    }
    function sourceConfig(media) {
        var configured = [read('smartbalancer_catalog1', ''), read('smartbalancer_catalog2', '')];
        var urls = configured.map(function (url) { return safeUrl(url) ? url : null; });
        var open = read('smartbalancer_open_films', true);
        var reya = read('smartbalancer_reya', true);
        return { urls: urls, count: urls.filter(Boolean).length, invalid: configured.filter(function (url) { return url && !safeUrl(url); }).length, openFilms: open, hasOpenFilm: Boolean(open && openFilms(media).length), hasWikimedia: canSearchWikimedia(media), reya: reya, hasReya: Boolean(reya && canSearchReya(media)) };
    }
    function noSources(card, invalid) {
        var items = [{ title: invalid ? 'Адрес дополнительного источника недопустим' : 'Встроенный поиск пока не поддерживает эту карточку', noenter: true }];
        if (bridge.hasOnlineMod(card)) items.push({ title: 'Открыть установленный Online Mod вручную', action: function () { if (current === card) { back(); if (!bridge.openOnlineMod(card)) notify('Online Mod недоступен на этой карточке.'); } } });
        items.push({ title: 'Настройки источников SmartBalancer', action: function () { if (current === card) { back(); settings(); } } });
        items.push({ title: 'Закрыть', action: back });
        menu('Нет доступного источника', items);
    }
    function run(media, manual) {
        if (searching) { notify('Поиск уже выполняется.'); return; }
        var config = sourceConfig(media), urls = config.urls, card = current;
        engine.options.openFilms = config.openFilms;
        engine.options.reya = config.reya;
        if (!config.count && !config.hasOpenFilm && !config.hasWikimedia && !config.hasReya) return noSources(card, config.invalid);
        if (config.invalid) notify('Некорректный URL каталога пропущен; остальные источники будут проверены.');
        engine.options.timeout = Number(read('smartbalancer_timeout', '30000')); engine.options.quality = read('smartbalancer_quality', '1080');
        engine.options.language = String(read('smartbalancer_language', '')).trim(); engine.options.voiceover = String(read('smartbalancer_voiceover', '')).trim();
        searching = true;
        menu('Поиск SmartBalancer', [{ title: 'Отменить поиск', action: function () { engine.cancel(); searching = false; back(); } }], function () { if (!closing) { engine.cancel(); searching = false; back(); } });
        var count = config.count + (config.hasOpenFilm ? 1 : 0) + (config.hasWikimedia ? 1 : 0) + (config.hasReya ? 1 : 0);
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
        var seasons = media.seasons || [];
        function selectEpisodes(season, episodes, confirmed) {
            if (current !== card) return;
            if (!episodes.length) { notify('Список серий для этого сезона недоступен.'); back(); return; }
            var title = confirmed ? 'Выберите серию · сезон ' + season.number : 'Серии по числу в карточке · сезон ' + season.number;
            menu(title, episodes.map(function (episode) {
                return { title: String(episode.number) + (episode.title ? ' · ' + escapeText(episode.title) : ''), action: function () {
                    if (current === card) { media.season = season.number; media.episode = episode.number; media.episodeConfirmed = confirmed; cb(); }
                } };
            }));
        }
        function chooseSeason(season) {
            if (current !== card) return;
            if (season.episodes.length) return selectEpisodes(season, season.episodes, true);
            var active = true, timer;
            function cancel() { if (!active) return; active = false; clearTimeout(timer); back(); }
            function done(response) {
                if (!active || current !== card) return;
                active = false; clearTimeout(timer); bridge.closeMenu();
                var detail = response && (response[String(season.number)] || response);
                var episodes = exactEpisodes(detail, season.number), confirmed = episodes.length > 0;
                if (confirmed) season.episodes = episodes;
                else if (season.count) for (var n = 1; n <= season.count; n++) episodes.push({ number: n, title: '' });
                selectEpisodes(season, episodes, confirmed);
            }
            menu('Загрузка серий сезона ' + season.number, [{ title: 'Отменить', action: cancel }], cancel);
            timer = setTimeout(function () { done(null); }, 5000);
            if (!bridge.getSeason(card.card || {}, season.number, done)) done(null);
        }
        function selectSeason() {
            if (!seasons.length) { notify('Lampa не предоставила список сезонов этого сериала.'); back(); return; }
            if (seasons.length === 1) return chooseSeason(seasons[0]);
            menu('Выберите сезон', seasons.map(function (season) { return { title: 'Сезон ' + season.number + (season.number === 0 ? ' · специальные выпуски' : '') + (season.count ? ' · серий: ' + season.count : ''), action: function () { chooseSeason(season); } }; }));
        }
        var key = media.tmdb && /^\d+$/.test(media.tmdb) ? 'tmdb:' + media.tmdb : media.imdb && /^tt\d+$/.test(media.imdb) ? 'imdb:' + media.imdb : '';
        var last = history.load().reverse().find(function (entry) {
            var season = seasons.find(function (candidate) { return candidate.number === entry.season; });
            return entry.mediaKey === key && season && season.episodes.some(function (candidate) { return candidate.number === entry.episode; });
        });
        if (!last) return selectSeason();
        menu('Выбор серии', [
            { title: 'Последняя попытка: сезон ' + last.season + ', серия ' + last.episode, action: function () { if (current === card) { media.season = last.season; media.episode = last.episode; media.episodeConfirmed = true; cb(); } } },
            { title: 'Выбрать другую серию', action: function () { if (current === card) selectSeason(); } }
        ]);
    }
    function begin(media, manual) {
        var card = current;
        if (!card || searching) return;
        var config = sourceConfig(media);
        if (!config.count && !config.hasOpenFilm && !config.hasWikimedia && !config.hasReya) return noSources(card, config.invalid);
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
        current = e.object; currentMedia = mediaFrom(e.data.movie, e.object, e.data);
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
