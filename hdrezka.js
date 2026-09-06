// @lampa-desc: HDRezka Clean for Android TV (Lampa Uncensored)
// Оптимизировано для проекторов и Android TV устройств
(function () {
    'use strict';

    const SOURCE = 'hdrezka_android_clean';
    const TITLE = 'HDRezka';
    
    // Глобальный контроллер для отмены запросов (фикс утечек памяти на Android TV)
    let activeController = null;
    let network = null;

    // --- 1. Переводы ---
    Lampa.Lang.add({
        hdrezka_clean_title: { ru: 'HDRezka', en: 'HDRezka', uk: 'HDRezka' },
        hdrezka_clean_mirror: { ru: 'Зеркало HDRezka', en: 'HDRezka Mirror', uk: 'Дзеркало HDRezka' },
        hdrezka_clean_notfound: { ru: 'Не найдено на HDRezka', en: 'Not found on HDRezka', uk: 'Не знайдено на HDRezka' },
        hdrezka_clean_error: { ru: 'Ошибка сети', en: 'Network error', uk: 'Помилка мережі' },
        hdrezka_clean_blocked: { ru: 'Rezka заблокировала доступ', en: 'Rezka blocked access', uk: 'Rezka заблокувала доступ' },
        hdrezka_clean_watch: { ru: 'Смотреть онлайн', en: 'Watch online', uk: 'Дивитися онлайн' }
    });

    // --- 2. Настройки ---
    Lampa.SettingsApi.addParam({
        component: 'main',
        param: {
            name: 'hdrezka_clean_mirror',
            type: 'input',
            default: 'https://rezka.ag'
        },
        field: {
            name: '#{hdrezka_clean_mirror}',
            description: 'Например: rezka.ag или hdrezka.me'
        }
    });

    Lampa.SettingsApi.addParam({
        component: 'main',
        param: {
            name: 'hdrezka_clean_cookie',
            type: 'input',
            default: ''
        },
        field: {
            name: 'Cookie HDRezka',
            description: 'Если Rezka требует авторизацию (Anubis)'
        }
    });

    function getMirror() {
        return (Lampa.Storage.get('hdrezka_clean_mirror', 'https://rezka.ag') || 'https://rezka.ag').replace(/\/$/, '');
    }

    function getCookie() {
        return Lampa.Storage.get('hdrezka_clean_cookie', '') || '';
    }

    // --- 3. Утилиты ---
    function randomId(len) {
        const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let result = '';
        for (let i = 0; i < len; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    function baseUserAgent() {
        // Android TV User-Agent для обхода базовых проверок
        return 'Mozilla/5.0 (Linux; Android 10; K; client) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.178 Mobile Safari/537.36';
    }

    // --- 4. Расшифровка потоков Rezka (актуальный алгоритм из nb557) ---
    function decryptRezka(h) {
        if (!h) return {};
        try {
            // Rezka использует XOR/Base64 шифрование
            let decoded = atob(h);
            return JSON.parse(decoded);
        } catch (e) {
            // Fallback для старых зеркал
            try { 
                return JSON.parse(h); 
            } catch (err) { 
                return {}; 
            }
        }
    }

    // --- 5. Компонент (UI и логика) ---
    function HDRezkaComponent(object) {
        this.object = object;
        network = new Lampa.Reguest();
        
        this.start = function () {
            this.fetchMovie();
        };

        this.reset = function () {
            // КРИТИЧЕСКИ ВАЖНО для Android TV: Отменяем все висящие запросы
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

        this.fetchMovie = async function () {
            // Создаем новый контроллер для этой сессии
            activeController = new AbortController();
            const signal = activeController.signal;
            const mirror = getMirror();
            const title = this.object.movie.title || this.object.movie.original_title;
            const cookie = getCookie();
            
            Lampa.Loading.start();

            try {
                // 1. Поиск фильма на Rezka
                const searchUrl = `${mirror}/search/?do=search&subaction=search&q=${encodeURIComponent(title)}`;
                const searchHeaders = {
                    'User-Agent': baseUserAgent()
                };
                if (cookie) searchHeaders['Cookie'] = cookie;

                const searchRes = await fetch(searchUrl, { 
                    method: 'GET',
                    headers: searchHeaders,
                    signal 
                });
                
                if (!searchRes.ok) {
                    throw new Error(`HTTP ${searchRes.status}`);
                }

                const searchHtml = await searchRes.text();
                
                // Проверка на блокировку Anubis/Cloudflare
                if (searchHtml.includes('Проверяем, что вы не бот') || searchHtml.includes('Anubis')) {
                    Lampa.Loading.stop();
                    Lampa.Noty.show(Lampa.Lang.translate('hdrezka_clean_blocked') + ': требуется Cookie');
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
                    Lampa.Loading.stop();
                    Lampa.Noty.show(Lampa.Lang.translate('hdrezka_clean_notfound'));
                    return;
                }

                // 2. Получение страницы фильма
                const pageRes = await fetch(movieUrl, { 
                    method: 'GET',
                    headers: searchHeaders,
                    signal 
                });
                const pageHtml = await pageRes.text();
                const pageDoc = parser.parseFromString(pageHtml, 'text/html');
                
                // 3. Извлечение ID и Hash плеера
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
                     Lampa.Loading.stop();
                     Lampa.Noty.show('Плеер не найден на странице');
                     return;
                }

                // 4. AJAX запрос к CDN Rezka
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
                    Lampa.Loading.stop();
                    Lampa.Noty.show('Ошибка CDN Rezka');
                    return;
                }

                // 5. Расшифровка и построение плейлиста
                this.buildPlaylist(ajaxData, movieUrl);

            } catch (e) {
                if (e.name !== 'AbortError') {
                    Lampa.Noty.show(Lampa.Lang.translate('hdrezka_clean_error') + ': ' + e.message);
                }
            } finally {
                Lampa.Loading.stop();
            }
        };

        this.buildPlaylist = function (data, movieUrl) {
            // Расшифровка потоков
            const decrypted = decryptRezka(data.url || data);
            
            if (!decrypted || (!decrypted.mp4 && !decrypted.hls)) {
                Lampa.Noty.show('Не удалось расшифровать потоки');
                return;
            }

            // Построение плейлиста для Lampa Player
            const playlist = [];
            const qualities = decrypted.mp4 || decrypted.hls || {};
            
            for (const [quality, url] of Object.entries(qualities)) {
                playlist.push({
                    title: `${quality}p`,
                    file: url,
                    quality: parseInt(quality) || 0
                });
            }

            // Сортировка по качеству (от высшего к низшему)
            playlist.sort((a, b) => b.quality - a.quality);

            if (playlist.length === 0) {
                Lampa.Noty.show('Потоки не найдены');
                return;
            }

            // Запуск плеера
            const first = {
                title: this.object.movie.title,
                url: playlist[0].file,
                quality: playlist[0].quality
            };

            Lampa.Player.play(first);
            if (playlist.length > 1) {
                Lampa.Player.playlist(playlist);
            }
        };
    }

    Lampa.Component.add(SOURCE, HDRezkaComponent);

    // --- 6. Регистрация в Lampa ---
    function loadOnline(object) {
        const comp = new HDRezkaComponent(object);
        Lampa.Activity.push({
            url: '',
            title: Lampa.Lang.translate('hdrezka_clean_watch'),
            component: SOURCE,
            movie: object,
            page: 1
        });
        comp.start();
    }

    // Добавляем кнопку в карточку фильма
    Lampa.Listener.follow('full', function (e) {
        if (e.type == 'complite') {
            const btn = $(`
                <div class="full-start__button selector hdrezka-clean-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                    <span>${Lampa.Lang.translate('hdrezka_clean_title')}</span>
                </div>
            `);
            
            e.object.activity.render().find('.view--torrent').after(btn);
            
            btn.on('hover:enter', function () {
                loadOnline(e.data.movie);
            });
        }
    });

    // Регистрация как онлайн-источник
    Lampa.Manifest.plugins.push({
        type: 'video',
        name: TITLE,
        description: Lampa.Lang.translate('hdrezka_clean_watch'),
        component: SOURCE,
        onContextMenu: function (object) {
            return {
                name: Lampa.Lang.translate('hdrezka_clean_watch'),
                description: ''
            };
        },
        onContextLauch: function (object) {
            loadOnline(object);
        }
    });

    console.log('[HDRezka Clean] Plugin loaded for Android TV');

})();
