// @lampa-desc: HDRezka Clean for Lampa Uncensored (Android TV)
(function () {
    'use strict';

    const SOURCE = 'online_mod'; // ВАЖНО: именно online_mod для совместимости с Lampa Uncensored
    const TITLE = 'HDRezka';
    
    let network = null;
    let activeController = null;

    // --- 1. Переводы ---
    Lampa.Lang.add({
        online_mod_watch: { ru: 'Смотреть онлайн', en: 'Watch online', uk: 'Дивитися онлайн' },
        online_mod_nolink: { ru: 'Не удалось получить ссылку', en: 'Failed to fetch link', uk: 'Не вдалося отримати посилання' },
        online_mod_blockedlink: { ru: 'Видео недоступно в вашем регионе', en: 'Video not available in your region', uk: 'Відео недоступне у вашому регіоні' },
        hdrezka_mirror: { ru: 'Зеркало HDRezka', en: 'HDRezka Mirror', uk: 'Дзеркало HDRezka' },
        hdrezka_cookie: { ru: 'Cookie HDRezka', en: 'HDRezka Cookie', uk: 'Cookie HDRezka' },
        hdrezka_fill_cookie: { ru: 'Заполнить Cookie', en: 'Fill Cookie', uk: 'Заповнити Cookie' },
        hdrezka_notfound: { ru: 'Не найдено на HDRezka', en: 'Not found on HDRezka', uk: 'Не знайдено на HDRezka' }
    });

    // --- 2. Утилиты ---
    function getMirror() {
        return (Lampa.Storage.get('hdrezka_mirror', 'https://rezka.ag') || 'https://rezka.ag').replace(/\/$/, '');
    }

    function getCookie() {
        return Lampa.Storage.get('hdrezka_cookie', '') || '';
    }

    function setCookie(value) {
        Lampa.Storage.set('hdrezka_cookie', value);
    }

    function baseUserAgent() {
        return 'Mozilla/5.0 (Linux; Android 10; K; client) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.178 Mobile Safari/537.36';
    }

    // --- 3. Расшифровка потоков Rezka ---
    function decryptRezka(h) {
        if (!h) return {};
        try {
            let decoded = atob(h);
            return JSON.parse(decoded);
        } catch (e) {
            try { 
                return JSON.parse(h); 
            } catch (err) { 
                return {}; 
            }
        }
    }

    // --- 4. Автоматическое заполнение Cookie ---
    function fillCookie(callback) {
        const mirror = getMirror();
        const loginUrl = `${mirror}/ajax/login/`;
        
        // Создаём фиктивные данные для получения cookie
        const formData = new URLSearchParams();
        formData.append('login_name', 'guest_' + Math.random().toString(36).substr(2, 9));
        formData.append('login_password', 'guest_' + Math.random().toString(36).substr(2, 9));
        formData.append('login_not_save', '0');

        fetch(loginUrl, {
            method: 'POST',
            body: formData,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
        .then(res => {
            const cookies = res.headers.get('set-cookie');
            if (cookies) {
                setCookie(cookies);
                if (callback) callback(true);
            } else {
                if (callback) callback(false);
            }
        })
        .catch(() => {
            if (callback) callback(false);
        });
    }

    // --- 5. Компонент ---
    function component(object) {
        this.object = object;
        this.activity = null;
        this.scroll = null;
        network = new Lampa.Reguest();
        
        this.create = function () {
            this.activity = new Lampa.Activity({
                layer: 'online_mod',
                title: TITLE,
                movie: object.movie
            });
            
            this.scroll = new Lampa.Scroll({
                height: 500,
                over: true,
                step: 150
            });
            
            this.activity.render().find('.explorer__files').append(this.scroll.render());
            this.start();
        };

        this.start = async function () {
            activeController = new AbortController();
            const signal = activeController.signal;
            const mirror = getMirror();
            const title = object.movie.title || object.movie.original_title;
            const cookie = getCookie();
            
            this.activity.loader(true);

            try {
                // 1. Поиск
                const searchUrl = `${mirror}/search/?do=search&subaction=search&q=${encodeURIComponent(title)}`;
                const headers = {
                    'User-Agent': baseUserAgent()
                };
                if (cookie) headers['Cookie'] = cookie;

                const searchRes = await fetch(searchUrl, { 
                    method: 'GET',
                    headers: headers,
                    signal 
                });
                
                if (!searchRes.ok) {
                    throw new Error(`HTTP ${searchRes.status}`);
                }

                const searchHtml = await searchRes.text();
                
                // Проверка на блокировку
                if (searchHtml.includes('Проверяем, что вы не бот') || searchHtml.includes('Anubis')) {
                    this.activity.loader(false);
                    Lampa.Noty.show('Требуется авторизация (Cookie)');
                    return;
                }

                const parser = new DOMParser();
                const doc = parser.parseFromString(searchHtml, 'text/html');
                const items = doc.querySelectorAll('.b-content__inline_item');
                
                let movieUrl = null;
                for (let item of items) {
                    const link = item.querySelector('.b-content__inline_item-link');
                    if (link) {
                        movieUrl = link.getAttribute('href');
                        break;
                    }
                }

                if (!movieUrl) {
                    this.activity.loader(false);
                    Lampa.Noty.show(Lampa.Lang.translate('hdrezka_notfound'));
                    return;
                }

                // 2. Получение страницы фильма
                const pageRes = await fetch(movieUrl, { 
                    method: 'GET',
                    headers: headers,
                    signal 
                });
                const pageHtml = await pageRes.text();
                const pageDoc = parser.parseFromString(pageHtml, 'text/html');
                
                // 3. Извлечение ID и Hash
                let playerId = null, playerHash = null;
                const scripts = pageDoc.querySelectorAll('script');
                for (let s of scripts) {
                    const text = s.textContent;
                    if (text.includes('sof.tv') || text.includes('initPlayer')) {
                        const idMatch = text.match(/id:\s*(\d+)/);
                        const hashMatch = text.match(/hash:\s*["']([a-f0-9]+)["']/);
                        if (idMatch) playerId = idMatch[1];
                        if (hashMatch) playerHash = hashMatch[1];
                    }
                }

                if (!playerId || !playerHash) {
                    this.activity.loader(false);
                    Lampa.Noty.show('Плеер не найден');
                    return;
                }

                // 4. AJAX запрос к CDN
                const formData = new URLSearchParams();
                formData.append('id', playerId);
                formData.append('hash', playerHash);
                
                const ajaxHeaders = {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': baseUserAgent(),
                    'Referer': movieUrl
                };
                if (cookie) ajaxHeaders['Cookie'] = cookie;

                const ajaxRes = await fetch(`${mirror}/ajax/get_cdn_series/`, {
                    method: 'POST',
                    body: formData,
                    headers: ajaxHeaders,
                    signal
                });
                
                if (!ajaxRes.ok) {
                    throw new Error(`CDN HTTP ${ajaxRes.status}`);
                }

                const ajaxData = await ajaxRes.json();
                
                if (!ajaxData.success) {
                    this.activity.loader(false);
                    Lampa.Noty.show('Ошибка CDN');
                    return;
                }

                // 5. Построение плейлиста
                this.buildPlaylist(ajaxData, movieUrl);

            } catch (e) {
                if (e.name !== 'AbortError') {
                    this.activity.loader(false);
                    Lampa.Noty.show('Ошибка: ' + e.message);
                }
            }
        };

        this.buildPlaylist = function (data, movieUrl) {
            const decrypted = decryptRezka(data.url || data);
            
            if (!decrypted || (!decrypted.mp4 && !decrypted.hls)) {
                this.activity.loader(false);
                Lampa.Noty.show('Не удалось расшифровать потоки');
                return;
            }

            const playlist = [];
            const qualities = decrypted.mp4 || decrypted.hls || {};
            
            for (const [quality, url] of Object.entries(qualities)) {
                playlist.push({
                    title: `${quality}p`,
                    file: url,
                    quality: parseInt(quality) || 0
                });
            }

            playlist.sort((a, b) => b.quality - a.quality);

            if (playlist.length === 0) {
                this.activity.loader(false);
                Lampa.Noty.show('Потоки не найдены');
                return;
            }

            this.activity.loader(false);

            const first = {
                title: object.movie.title,
                url: playlist[0].file,
                quality: playlist[0].quality
            };

            Lampa.Player.play(first);
            if (playlist.length > 1) {
                Lampa.Player.playlist(playlist);
            }
        };

        this.reset = function () {
            if (activeController) {
                activeController.abort();
                activeController = null;
            }
            if (network) {
                network.clear();
            }
        };

        this.destroy = function () {
            this.reset();
            network = null;
        };
    }

    // --- 6. Настройки ---
    function addSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'hdrezka_clean',
            name: 'HDRezka Clean',
            icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: 'hdrezka_clean',
            param: {
                name: 'hdrezka_mirror',
                type: 'input',
                default: 'https://rezka.ag'
            },
            field: {
                name: '#{hdrezka_mirror}',
                description: 'Например: rezka.ag или hdrezka.me'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'hdrezka_clean',
            param: {
                name: 'hdrezka_cookie',
                type: 'input',
                default: ''
            },
            field: {
                name: '#{hdrezka_cookie}',
                description: 'Автоматически заполняется кнопкой ниже'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'hdrezka_clean',
            param: {
                name: 'hdrezka_fill_cookie',
                type: 'button',
                default: ''
            },
            field: {
                name: '#{hdrezka_fill_cookie}',
                description: 'Нажмите для автоматического получения Cookie'
            },
            onRender: function (item) {
                item.on('hover:enter', function () {
                    const status = item.find('.settings-param__status');
                    status.removeClass('active error wait').addClass('wait');
                    
                    fillCookie(function (success) {
                        if (success) {
                            status.removeClass('active error wait').addClass('active');
                            Lampa.Noty.show('Cookie успешно получены!');
                        } else {
                            status.removeClass('active error wait').addClass('error');
                            Lampa.Noty.show('Не удалось получить Cookie');
                        }
                    });
                });
            }
        });
    }

    // --- 7. Регистрация ---
    Lampa.Component.add(SOURCE, component);
    
    Lampa.Manifest.plugins.push({
        type: 'video',
        version: '1.0',
        name: TITLE,
        description: Lampa.Lang.translate('online_mod_watch'),
        component: SOURCE,
        onContextMenu: function (object) {
            return {
                name: Lampa.Lang.translate('online_mod_watch'),
                description: ''
            };
        },
        onContextLauch: function (object) {
            Lampa.Activity.push({
                url: '',
                title: Lampa.Lang.translate('online_mod_watch'),
                component: SOURCE,
                movie: object,
                page: 1
            });
        }
    });

    addSettings();
    
    console.log('[HDRezka Clean] Plugin loaded for Lampa Uncensored');

})();
