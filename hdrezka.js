// @lampa-desc: HDRezka Clean for Lampa Uncensored (Android TV)
(function () {
    'use strict';

    // --- 1. Переводы ---
    Lampa.Lang.add({
        'online_mod_rezka2_mirror': { ru: 'Зеркало HDRezka', en: 'HDRezka Mirror', uk: 'Дзеркало HDRezka' },
        'online_mod_rezka2_cookie': { ru: 'Cookie HDRezka', en: 'HDRezka Cookie', uk: 'Cookie HDRezka' },
        'online_mod_rezka2_fill_cookie': { ru: 'Заполнить Cookie', en: 'Fill Cookie', uk: 'Заповнити Cookie' },
        'online_mod_title_full': { ru: 'Онлайн (HDRezka)', en: 'Online (HDRezka)', uk: 'Онлайн (HDRezka)' },
        'online_mod_nolink': { ru: 'Не удалось получить ссылку', en: 'Failed to fetch link', uk: 'Не вдалося отримати посилання' }
    });

    // --- 2. Утилиты ---
    function getMirror() {
        return (Lampa.Storage.get('online_mod_rezka2_mirror', 'https://rezka.ag') || 'https://rezka.ag').replace(/\/$/, '');
    }
    
    function getCookie() {
        return Lampa.Storage.get('online_mod_rezka2_cookie', '') || '';
    }

    function baseUserAgent() {
        return 'Mozilla/5.0 (Linux; Android 10; K; client) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.178 Mobile Safari/537.36';
    }

    // Базовая расшифровка (работает для многих зеркал). 
    // Для rezka.ag с их сложным eval-шифрованием может потребоваться оригинальный decrypt из SimSomNat.
    function decryptRezka(h) {
        if (!h) return {};
        try { return JSON.parse(atob(h)); } catch (e) {}
        try { return JSON.parse(h); } catch (e) {}
        return { mp4: { '1080': h } }; // Fallback: считаем, что это прямая ссылка
    }

    // --- 3. Компонент "Онлайн" (Заменяет встроенный в Lampa Uncensored) ---
    function online(object) {
        this.object = object;
        this.network = new Lampa.Reguest();
        
        this.create = function () {
            this.activity = new Lampa.Activity({
                layer: 'online',
                title: 'HDRezka',
                movie: object.movie
            });
            this.scroll = new Lampa.Scroll({ mask: true, over: true });
            this.activity.render().find('.explorer__files').append(this.scroll.render());
            this.start();
        };

        this.start = async function () {
            this.activity.loader(true);
            const mirror = getMirror();
            const title = object.movie.title || object.movie.original_title;
            const cookie = getCookie();
            
            try {
                // 1. Поиск
                const searchUrl = `${mirror}/search/?do=search&subaction=search&q=${encodeURIComponent(title)}`;
                const headers = { 'User-Agent': baseUserAgent() };
                if (cookie) headers['Cookie'] = cookie;

                const searchRes = await fetch(searchUrl, { headers });
                const searchHtml = await searchRes.text();
                
                if (searchHtml.includes('Anubis') || searchHtml.includes('105')) {
                    this.activity.loader(false);
                    return Lampa.Noty.show('Rezka блокирует: требуется Cookie');
                }

                const parser = new DOMParser();
                const doc = parser.parseFromString(searchHtml, 'text/html');
                const link = doc.querySelector('.b-content__inline_item-link');
                if (!link) {
                    this.activity.loader(false);
                    return Lampa.Noty.show('Фильм не найден на HDRezka');
                }
                const movieUrl = link.getAttribute('href');

                // 2. Страница фильма
                const pageRes = await fetch(movieUrl, { headers });
                const pageHtml = await pageRes.text();
                const pageDoc = parser.parseFromString(pageHtml, 'text/html');
                
                // 3. Извлечение ID и Hash
                let playerId = null, playerHash = null;
                const scripts = pageDoc.querySelectorAll('script');
                for (let s of scripts) {
                    const text = s.textContent;
                    const idMatch = text.match(/id:\s*(\d+)/);
                    const hashMatch = text.match(/hash:\s*["']([a-f0-9]+)["']/);
                    if (idMatch) playerId = idMatch[1];
                    if (hashMatch) playerHash = hashMatch[1];
                }

                if (!playerId || !playerHash) {
                    this.activity.loader(false);
                    return Lampa.Noty.show('Плеер не найден');
                }

                // 4. AJAX к CDN
                const formData = new URLSearchParams();
                formData.append('id', playerId);
                formData.append('hash', playerHash);
                
                const ajaxRes = await fetch(`${mirror}/ajax/get_cdn_series/`, {
                    method: 'POST',
                    body: formData,
                    headers: { ...headers, 'X-Requested-With': 'XMLHttpRequest', 'Referer': movieUrl }
                });
                
                const data = await ajaxRes.json();
                if (!data.success) {
                    this.activity.loader(false);
                    return Lampa.Noty.show('Ошибка CDN');
                }

                this.buildPlaylist(data);

            } catch (e) {
                this.activity.loader(false);
                Lampa.Noty.show('Ошибка сети: ' + e.message);
            }
        };

        this.buildPlaylist = function (data) {
            const decrypted = decryptRezka(data.url || data);
            const qualities = decrypted.mp4 || decrypted.hls || {};
            
            this.scroll.reset();
            for (const [quality, url] of Object.entries(qualities)) {
                const item = $(`
                    <div class="online__item selector">
                        <div class="online__quality">${quality}p</div>
                    </div>
                `);
                item.on('hover:enter', () => {
                    Lampa.Player.play({
                        title: object.movie.title,
                        url: url,
                        quality: parseInt(quality) || 1080
                    });
                });
                this.scroll.append(item);
            }
            this.activity.loader(false);
        };

        this.destroy = function () {
            this.network.clear();
        };
    }

    // --- 4. Регистрация компонента (КРИТИЧЕСКИ ВАЖНО для Uncensored) ---
    Lampa.Component.add('online', online); 

    Lampa.Manifest.plugins.push({
        type: 'video',
        version: '1.0',
        name: 'HDRezka',
        description: 'Просмотр через HDRezka',
        component: 'online',
        onContextMenu: () => ({ name: 'HDRezka', description: '' }),
        onContextLauch: (object) => {
            Lampa.Activity.push({
                url: '',
                title: 'HDRezka',
                component: 'online',
                movie: object.movie,
                page: 1
            });
        }
    });

    // --- 5. Настройки (Правильный инжект для Lampa Uncensored) ---
    Lampa.Settings.listener.follow('open', function (e) {
        if (e.name == 'more' || e.name == 'main') {
            // Проверяем, не добавили ли мы уже наши настройки
            if (e.body.find('[data-name="online_mod_rezka2_mirror"]').length) return;

            const template = `
                <div class="settings-folder">
                    <div class="settings-folder__name">HDRezka Clean</div>
                </div>
                <div class="settings-param selector" data-name="online_mod_rezka2_mirror" data-type="input" placeholder="https://rezka.ag">
                    <div class="settings-param__name">#{online_mod_rezka2_mirror}</div>
                    <div class="settings-param__value"></div>
                </div>
                <div class="settings-param selector" data-name="online_mod_rezka2_cookie" data-type="input" data-string="true">
                    <div class="settings-param__name">#{online_mod_rezka2_cookie}</div>
                    <div class="settings-param__value"></div>
                </div>
            `;
            
            e.body.find('.settings-folder').last().after(template);
            
            // Обновление значений (именно так работает в Uncensored, без крашей)
            Lampa.Params.update(e.body.find('[data-name="online_mod_rezka2_mirror"]'), [], e.body);
            Lampa.Params.update(e.body.find('[data-name="online_mod_rezka2_cookie"]'), [], e.body);
            
            // Обработчики клика
            e.body.find('[data-name="online_mod_rezka2_mirror"]').on('hover:enter', function () {
                Lampa.Input.edit({
                    title: '#{online_mod_rezka2_mirror}',
                    value: Lampa.Storage.get('online_mod_rezka2_mirror', 'https://rezka.ag'),
                    nosoft: true,
                    free: true
                }, function (new_value) {
                    Lampa.Storage.set('online_mod_rezka2_mirror', new_value);
                    Lampa.Params.update(e.body.find('[data-name="online_mod_rezka2_mirror"]'), [], e.body);
                });
            });

            e.body.find('[data-name="online_mod_rezka2_cookie"]').on('hover:enter', function () {
                Lampa.Input.edit({
                    title: '#{online_mod_rezka2_cookie}',
                    value: Lampa.Storage.get('online_mod_rezka2_cookie', ''),
                    nosoft: true,
                    free: true
                }, function (new_value) {
                    Lampa.Storage.set('online_mod_rezka2_cookie', new_value);
                    Lampa.Params.update(e.body.find('[data-name="online_mod_rezka2_cookie"]'), [], e.body);
                });
            });
        }
    });

    console.log('[HDRezka Clean] Loaded for Lampa Uncensored');
})();
