// @lampa-desc: Комментарии HDrezka

(function () {
    'use strict';

    // Защита от повторной инициализации плагина
    if (window.plugin_hdrezka_comments_ready) return;
    window.plugin_hdrezka_comments_ready = true;

    var VERSION = '1.2.0';

    // ==========================================
    // НАСТРОЙКИ, ЗЕРКАЛА И ХРАНИЛИЩЕ
    // ==========================================

    function getMirror() {
        var custom = (Lampa.Storage.get('hdrezka_comments_mirror', '') || 
                      Lampa.Storage.get('rezka_comment_host', '') || '').trim();
        if (custom) return custom.replace(/\/$/, '');

        var rezkaModMirror = (Lampa.Storage.get('online_mod_rezka2_mirror', '') || '').trim();
        if (rezkaModMirror) return rezkaModMirror.replace(/\/$/, '');

        return 'https://rezka.ag';
    }

    function getCookie() {
        return (Lampa.Storage.get('rezka_comment_cookie', '') || 
                Lampa.Storage.get('hdrezka_comments_cookie', '') ||
                Lampa.Storage.get('online_mod_rezka2_cookie', '') || '').trim();
    }

    function saveCookie(cookieStr) {
        if (!cookieStr) return;
        Lampa.Storage.set('rezka_comment_cookie', cookieStr);
        Lampa.Storage.set('hdrezka_comments_cookie', cookieStr);
        Lampa.Storage.set('online_mod_rezka2_cookie', cookieStr);
    }

    function getProxyMode() {
        return Lampa.Storage.get('hdrezka_comments_proxy_mode', 'auto');
    }

    function getCustomProxy() {
        return (Lampa.Storage.get('hdrezka_comments_proxy', '') || 
                Lampa.Storage.get('rezka_comment_proxy', '') || 
                Lampa.Storage.get('online_mod_proxy_other_url', '') || '').trim();
    }

    // ==========================================
    // АВТОНОМНЫЙ SHA-256 И ANUBIS POW SOLVER
    // ==========================================

    function pureJsSha256(ascii) {
        function rightRotate(value, amount) {
            return (value >>> amount) | (value << (32 - amount));
        }
        var words = [];
        var asciiBitLength = ascii.length * 8;
        var hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        var k = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];
        for (var i = 0; i < ascii.length; i++) {
            words[i >> 2] |= ascii.charCodeAt(i) << (24 - (i % 4) * 8);
        }
        words[asciiBitLength >> 5] |= 0x80 << (24 - asciiBitLength % 32);
        words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;
        for (var j = 0; j < words.length; j += 16) {
            var w = words.slice(j, j + 16);
            while (w.length < 16) w.push(0);
            var oldHash = hash.slice();
            for (var m = 0; m < 64; m++) {
                var w15 = w[m - 15] || 0, w2 = w[m - 2] || 0;
                var a = hash[0], e = hash[4];
                var temp1 = (hash[7]
                    + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                    + ((e & hash[5]) ^ ((~e) & hash[6]))
                    + k[m]
                    + (w[m] = (m < 16) ? (w[m] || 0) : (
                        (w[m - 16] || 0)
                        + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                        + (w[m - 7] || 0)
                        + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                    ) | 0
                    )) | 0;
                var temp2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                    + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))) | 0;
                hash = [(temp1 + temp2) | 0].concat(hash);
                hash.length = 8;
                hash[4] = (hash[4] + temp1) | 0;
            }
            for (var n = 0; n < 8; n++) hash[n] = (hash[n] + oldHash[n]) | 0;
        }
        var res = '';
        for (var p = 0; p < 8; p++) {
            for (var q = 3; q >= 0; q--) {
                var b = (hash[p] >>> (q * 8)) & 255;
                res += (b < 16 ? '0' : '') + b.toString(16);
            }
        }
        return res;
    }

    function solveAnubis(challengeData) {
        var challenge = challengeData.challenge;
        var rules = challengeData.rules || { difficulty: 2 };
        var targetZeros = rules.difficulty || 2;
        var nonce = 0;
        var t0 = Date.now();
        var foundHash = '';
        var maxIters = 100000;

        while (nonce < maxIters) {
            var str = challenge.randomData + nonce;
            var h = pureJsSha256(str);
            var ok = true;
            for (var i = 0; i < targetZeros; i++) {
                if (h.charAt(i) !== '0') {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                foundHash = h;
                break;
            }
            nonce++;
        }

        return {
            hash: foundHash,
            nonce: nonce,
            elapsedTime: Date.now() - t0
        };
    }

    // ==========================================
    // СЕТЕВОЙ МОДУЛЬ И ОБРАБОТКА ПРОКСИ
    // ==========================================

    function buildProxiedUrl(targetUrl, extraCookie) {
        var mode = getProxyMode();
        var cookie = extraCookie || getCookie();
        var ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

        if (mode === 'none') {
            return targetUrl;
        }

        var custom = getCustomProxy();
        var proxyHost = custom;

        if (!proxyHost || mode === 'auto' || mode === 'worker') {
            proxyHost = 'https://cors.nb557.workers.dev/';
        }

        if (proxyHost.indexOf('workers.dev') !== -1) {
            // Cloudflare Worker с поддержкой enc2 и param/
            var proxy_enc = 'param/User-Agent=' + encodeURIComponent(ua) + '/';
            if (cookie) {
                proxy_enc += 'param/Cookie=' + encodeURIComponent(cookie) + '/';
            }
            var b64 = '';
            try {
                b64 = btoa(unescape(encodeURIComponent(proxy_enc + targetUrl)));
            } catch (e) {
                b64 = btoa(proxy_enc + targetUrl);
            }
            if (proxyHost.slice(-1) !== '/') proxyHost += '/';
            return proxyHost + 'enc2/' + encodeURIComponent(b64) + '/rezka?comments.plugin';
        }

        // Обычный CORS прокси (bdvburik / glitch / deploy.cx)
        if (proxyHost.slice(-1) !== '/') proxyHost += '/';
        var finalUrl = proxyHost;
        if (cookie) {
            finalUrl += 'param/Cookie=' + encodeURIComponent(cookie) + '/';
        }
        finalUrl += targetUrl;
        return finalUrl;
    }

    function makeRequest(url, options, success, error) {
        options = options || {};
        var cookie = options.cookie || getCookie();
        var targetUrl = buildProxiedUrl(url, cookie);
        var postdata = options.data || false;

        var network = new Lampa.Reguest();
        network.timeout(options.timeout || 12000);

        var reqHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': getMirror() + '/'
        };
        if (cookie) {
            reqHeaders['Cookie'] = cookie;
        }
        if (options.headers) {
            for (var k in options.headers) reqHeaders[k] = options.headers[k];
        }

        var reqOptions = {
            dataType: options.dataType || 'text',
            headers: reqHeaders,
            withCredentials: false
        };

        network.silent(targetUrl, function (response) {
            network.clear();
            var respText = typeof response === 'string' ? response : JSON.stringify(response);

            // ПРОВЕРКА НА ANUBIS BOT PROTECTION
            if (respText && (respText.indexOf('anubis_challenge') !== -1 || respText.indexOf('Проверяем, что вы не бот') !== -1)) {
                if (!options._anubisRetried) {
                    console.log('HDrezka Comments: Anubis challenge detected! Auto-solving PoW...');
                    handleAnubisChallenge(respText, url, options, success, error);
                    return;
                }
            }

            success(response);
        }, function (a, c) {
            network.clear();

            // Запасной fallback на прямое подключение или альтернативный прокси при сбое
            if (!options._isFallback) {
                var fallbackOptions = Object.assign({}, options, { _isFallback: true });
                var altProxy = 'https://cors.fx666.workers.dev/';
                if (getProxyMode() === 'none') {
                    altProxy = 'https://cors.nb557.workers.dev/';
                }
                var fbUrl = altProxy + (altProxy.slice(-1) === '/' ? '' : '/') + url;
                var fbNet = new Lampa.Reguest();
                fbNet.timeout(12000);
                fbNet.silent(fbUrl, function (fbRes) {
                    fbNet.clear();
                    success(fbRes);
                }, function (fa, fc) {
                    fbNet.clear();
                    if (error) error(a, c);
                }, postdata, reqOptions);
                return;
            }

            if (error) error(a, c);
        }, postdata, reqOptions);
    }

    // ==========================================
    // АВТОМАТИЧЕСКИЙ ОБХОД ЗАЩИТЫ ANUBIS
    // ==========================================

    function handleAnubisChallenge(html, originalUrl, originalOptions, successCallback, errorCallback) {
        var match = html.match(/id=["']anubis_challenge["'][^>]*>([\s\S]*?)<\/script>/i);
        if (!match) {
            console.error('HDrezka Comments: Challenge script tag not found');
            if (errorCallback) errorCallback(null, 'Защита от ботов HDrezka не смогла быть распознана');
            return;
        }

        var challengeData;
        try {
            challengeData = JSON.parse(match[1]);
        } catch (e) {
            console.error('HDrezka Comments: Failed to parse challenge JSON', e);
            if (errorCallback) errorCallback(e, 'Ошибка структуры проверки Anubis');
            return;
        }

        var host = getMirror();
        var solution = solveAnubis(challengeData);
        console.log('HDrezka Comments: Anubis PoW solved in ' + solution.elapsedTime + 'ms! Nonce: ' + solution.nonce);

        var passUrl = host + '/.within.website/x/cmd/anubis/api/pass-challenge?id=' + encodeURIComponent(challengeData.challenge.id) +
            '&response=' + encodeURIComponent(solution.hash) +
            '&nonce=' + encodeURIComponent(solution.nonce) +
            '&redir=' + encodeURIComponent('/') +
            '&elapsedTime=' + encodeURIComponent(solution.elapsedTime);

        var verificationCookie = 'techaro.lol-anubis-cookie-verification=' + challengeData.challenge.id;

        makeRequest(passUrl, {
            cookie: verificationCookie,
            _anubisRetried: true
        }, function (passResponse) {
            // В браузере или прокси cookie могут обновиться автоматически
            // Или генерируем подтвержденный токен
            var newCookie = verificationCookie;
            saveCookie(newCookie);

            // Повторяем исходный запрос с обновленной авторизацией
            var retryOptions = Object.assign({}, originalOptions, {
                _anubisRetried: true,
                cookie: newCookie
            });

            setTimeout(function () {
                makeRequest(originalUrl, retryOptions, successCallback, errorCallback);
            }, 300);
        }, function (err, code) {
            console.warn('HDrezka Comments: pass-challenge error, attempting direct retry with verification cookie', err, code);
            var retryOptions = Object.assign({}, originalOptions, {
                _anubisRetried: true,
                cookie: verificationCookie
            });
            makeRequest(originalUrl, retryOptions, successCallback, errorCallback);
        });
    }

    // ==========================================
    // ПОИСК ФИЛЬМА И ПОДБОР ВЕРСИИ
    // ==========================================

    function cleanTitle(title) {
        if (!title) return '';
        return title
            .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function parseSearchResults(html, host) {
        if (!html) return [];
        var items = [];

        // 1. Парсинг стандартной сетки результатов b-content__inline_item
        var itemRegex = /<div class=["']b-content__inline_item["'][^>]*data-id=["'](\d+)["'][\s\S]*?<div class=["']b-content__inline_item-link["']>\s*<a href=["']([^"']+)["']>([\s\S]*?)<\/a>\s*<div>([\s\S]*?)<\/div>/gi;
        var match;
        while ((match = itemRegex.exec(html)) !== null) {
            var id = match[1];
            var href = match[2];
            if (href.indexOf('http') !== 0) href = host + (href.charAt(0) === '/' ? '' : '/') + href;
            var title = match[3].replace(/<[^>]+>/g, '').trim();
            var info = match[4].replace(/<[^>]+>/g, '').trim();

            var year = 0;
            var ym = info.match(/\b(19\d\d|20\d\d)\b/);
            if (ym) year = parseInt(ym[1]);

            items.push({
                id: id,
                url: href,
                title: title,
                info: info,
                year: year
            });
        }

        // 2. Альтернативный парсинг при другой верстке темы
        if (!items.length) {
            var linkBlocks = html.match(/<div class=["']b-content__inline_item-link["']>[\s\S]*?<\/div>/gi) || [];
            linkBlocks.forEach(function (block) {
                var aM = block.match(/<a [^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
                if (!aM) return;
                var href = aM[1];
                if (href.indexOf('http') !== 0) href = host + (href.charAt(0) === '/' ? '' : '/') + href;
                var title = aM[2].replace(/<[^>]+>/g, '').trim();
                var infoM = block.match(/<div>([\s\S]*?)<\/div>/i);
                var info = infoM ? infoM[1].replace(/<[^>]+>/g, '').trim() : '';
                var year = 0;
                var ym = info.match(/\b(19\d\d|20\d\d)\b/);
                if (ym) year = parseInt(ym[1]);

                var idM = href.match(/\/(\d+)-[^/]+\.html/);
                var id = idM ? idM[1] : '';

                items.push({
                    id: id,
                    url: href,
                    title: title,
                    info: info,
                    year: year
                });
            });
        }

        return items;
    }

    function searchMovie(title, origTitle, targetYear, callback) {
        var host = getMirror();
        var queries = [];

        if (title) queries.push(cleanTitle(title));
        if (origTitle && cleanTitle(origTitle).toLowerCase() !== cleanTitle(title).toLowerCase()) {
            queries.push(cleanTitle(origTitle));
        }

        var queryIdx = 0;

        function doNextSearch() {
            if (queryIdx >= queries.length) {
                return callback(null, 'Ничего не найдено на HDrezka по запросам: ' + queries.join(', '));
            }

            var currentQuery = queries[queryIdx];
            queryIdx++;

            var searchUrl = host + '/search/?do=search&subaction=search&q=' + encodeURIComponent(currentQuery);

            makeRequest(searchUrl, {}, function (html) {
                var items = parseSearchResults(html, host);
                if (items && items.length > 0) {
                    return matchOrSelect(items, currentQuery, targetYear, callback);
                }

                // Пробуем быстрый ajax search
                var ajaxUrl = host + '/engine/ajax/search.php';
                makeRequest(ajaxUrl, {
                    data: 'q=' + encodeURIComponent(currentQuery),
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                }, function (ajaxResp) {
                    var ajaxItems = parseAjaxResults(ajaxResp, host);
                    if (ajaxItems && ajaxItems.length > 0) {
                        return matchOrSelect(ajaxItems, currentQuery, targetYear, callback);
                    }
                    doNextSearch();
                }, function () {
                    doNextSearch();
                });
            }, function (err) {
                console.warn('HDrezka Comments: Search error for query ' + currentQuery, err);
                doNextSearch();
            });
        }

        doNextSearch();
    }

    function parseAjaxResults(html, host) {
        if (!html) return [];
        var items = [];
        var links = html.match(/<a [^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi) || [];

        links.forEach(function (block) {
            var hrefMatch = block.match(/href=["']([^"']+)["']/i);
            if (!hrefMatch) return;
            var href = hrefMatch[1];
            if (href.indexOf('http') !== 0) href = host + (href.charAt(0) === '/' ? '' : '/') + href;

            var titleMatch = block.match(/<span class=["']enty["']>([\s\S]*?)<\/span>/i);
            var title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

            var cleanBlock = block.replace(/<span class=["']enty["']>[\s\S]*?<\/span>/i, '')
                                  .replace(/<span class=["']rating["']>[\s\S]*?<\/span>/i, '')
                                  .replace(/<[^>]+>/g, '')
                                  .trim();

            var year = 0;
            var ym = cleanBlock.match(/\b(19\d\d|20\d\d)\b/);
            if (ym) year = parseInt(ym[1]);

            var idM = href.match(/\/(\d+)-[^/]+\.html/);
            var id = idM ? idM[1] : '';

            items.push({
                id: id,
                url: href,
                title: title,
                info: cleanBlock,
                year: year
            });
        });

        return items;
    }

    function matchOrSelect(items, query, targetYear, callback) {
        if (!items || !items.length) return callback(null, 'Результаты не найдены');

        // 1. Если результат один - берем его сразу
        if (items.length === 1) return callback(items[0]);

        // 2. Поиск по точному году (например, Моана 2026 против Моана 2016)
        if (targetYear) {
            var targetNum = parseInt(targetYear);
            var exactYearMatch = items.filter(function (it) {
                return it.year === targetNum || (it.info && it.info.indexOf(targetNum.toString()) !== -1);
            });

            if (exactYearMatch.length === 1) {
                return callback(exactYearMatch[0]);
            }
            if (exactYearMatch.length > 1) {
                // Если несколько с этим годом (например, фильм и мультфильм)
                return callback({ isMultiple: true, items: exactYearMatch });
            }

            // Допуск +- 1 год
            var closeYearMatch = items.filter(function (it) {
                return it.year && Math.abs(it.year - targetNum) <= 1;
            });
            if (closeYearMatch.length === 1) {
                return callback(closeYearMatch[0]);
            }
        }

        // 3. Если найдено несколько версий (например, франшиза "Моана")
        // Возвращаем объект множественного выбора
        return callback({ isMultiple: true, items: items });
    }

    // ==========================================
    // ПАРСИНГ КОММЕНТАРИЕВ
    // ==========================================

    function parseCommentsHtml(html) {
        var comments = [];
        var totalCount = 0;

        // Поиск счетчика
        var countMatch = html.match(/id=["']comments-count["'][^>]*>(\d+)/i) ||
                         html.match(/class=["'][^"']*b-post__comments_counter[^"']*["'][^>]*>\s*\(?(\d+)\)?/i) ||
                         html.match(/Комментарии\s*\((\d+)\)/i);
        if (countMatch) totalCount = parseInt(countMatch[1]);

        // Находим все узлы комментариев
        var $div = $('<div>' + html + '</div>');
        var $items = $div.find('.comments-tree-item');

        if (!$items.length) {
            $items = $div.find('.b-comment');
        }

        $items.each(function () {
            var $item = $(this);
            var id = $item.attr('data-id') || $item.attr('id') || '';
            var indent = parseInt($item.attr('data-indent') || '0');

            // Автор
            var author = $item.find('.name, .b-comment__author_name, .author').first().text().trim() || 'Пользователь';

            // Аватар
            var avatar = $item.find('.ava img, .avatar img, .b-comment__avatar img').first().attr('src') || '';

            // Дата
            var date = $item.find('.date, .b-comment__date').first().text().trim();
            date = date.replace(/оставлен\s*/i, '').replace(/^,\s*/, '').trim();

            // Лайки
            var likes = $item.find('.b-comment__likes_count, .likes').first().text().trim();
            likes = likes.replace(/[()]/g, '').trim();

            // Текст комментария
            var $textEl = $item.find('.text, .b-comment__text, div[id^="comm-id-"]').first();
            var textHtml = '';

            if ($textEl.length) {
                var $clone = $textEl.clone();

                // Обработка спойлеров HDrezka
                $clone.find('.b-spoiler, .spoiler, div[id^="spoil-"]').each(function () {
                    var $sp = $(this);
                    var spTitle = $sp.find('.title_spoiler, .spoiler-title').text().trim() || 'Спойлер (нажмите для просмотра)';
                    var $spContent = $sp.find('.text_spoiler, .spoiler-content');
                    if (!$spContent.length) $spContent = $sp;

                    var spHtml = $spContent.html();
                    $sp.replaceWith(`
                        <div class="hdrezka-spoiler-block">
                            <div class="hdrezka-spoiler-title selector">⚠️ ${spTitle}</div>
                            <div class="hdrezka-spoiler-content" style="display: none;">${spHtml}</div>
                        </div>
                    `);
                });

                textHtml = $clone.html();
            }

            if (textHtml && textHtml.trim()) {
                comments.push({
                    id: id,
                    indent: indent,
                    author: author,
                    avatar: avatar,
                    date: date,
                    likes: likes,
                    textHtml: textHtml
                });
            }
        });

        if (!totalCount) totalCount = comments.length;

        // Проверка наличия следующей страницы
        var hasNextPage = html.indexOf('cstart=2') !== -1 ||
                          html.indexOf('nav-next') !== -1 ||
                          comments.length >= 20;

        return {
            comments: comments,
            totalCount: totalCount,
            hasNextPage: hasNextPage
        };
    }

    // ==========================================
    // СТИЛИ МОДАЛЬНОГО ОКНА И КОММЕНТАРИЕВ
    // ==========================================

    function injectStyles() {
        if ($('#hdrezka-comments-styles').length) return;
        var css = `
            .hdrezka-comments-wrapper {
                max-width: 860px;
                margin: 0 auto;
                padding: 10px 14px;
                color: #e0e0e0;
                font-family: system-ui, -apple-system, sans-serif;
            }
            .hdrezka-comments-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding-bottom: 12px;
                margin-bottom: 16px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
            .hdrezka-comments-source {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 1.1em;
                font-weight: bold;
                color: #ffffff;
            }
            .hdrezka-comments-source .badge {
                background: #e50914;
                color: #fff;
                font-size: 0.75em;
                padding: 2px 6px;
                border-radius: 4px;
            }
            .hdrezka-comments-count {
                font-size: 0.9em;
                color: rgba(255, 255, 255, 0.6);
            }
            .hdrezka-comment-card {
                background: rgba(255, 255, 255, 0.04);
                border-radius: 8px;
                padding: 12px 16px;
                margin-bottom: 12px;
                border-left: 3px solid rgba(255, 255, 255, 0.15);
                transition: transform 0.15s ease, background 0.15s ease;
            }
            .hdrezka-comment-card.focus {
                background: rgba(255, 255, 255, 0.12);
                border-left-color: #e50914;
                box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
            }
            .hdrezka-comment-card.is-reply-1 {
                margin-left: 24px;
                border-left-color: #3b82f6;
                background: rgba(59, 130, 246, 0.04);
            }
            .hdrezka-comment-card.is-reply-2 {
                margin-left: 48px;
                border-left-color: #8b5cf6;
                background: rgba(139, 92, 246, 0.04);
            }
            .hdrezka-comment-card.is-reply-3 {
                margin-left: 72px;
                border-left-color: #10b981;
            }
            .hdrezka-comment-top {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 8px;
            }
            .hdrezka-comment-avatar {
                width: 38px;
                height: 38px;
                border-radius: 50%;
                overflow: hidden;
                background: rgba(255, 255, 255, 0.1);
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .hdrezka-comment-avatar img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            .hdrezka-comment-avatar-fallback {
                font-weight: bold;
                font-size: 1.1em;
                color: rgba(255, 255, 255, 0.7);
            }
            .hdrezka-comment-meta {
                flex-grow: 1;
            }
            .hdrezka-comment-author {
                font-weight: 600;
                font-size: 0.95em;
                color: #f3f4f6;
            }
            .hdrezka-comment-date {
                font-size: 0.8em;
                color: rgba(255, 255, 255, 0.4);
            }
            .hdrezka-comment-likes {
                font-size: 0.85em;
                padding: 2px 8px;
                border-radius: 12px;
                background: rgba(255, 255, 255, 0.08);
                color: rgba(255, 255, 255, 0.7);
            }
            .hdrezka-comment-likes.positive {
                background: rgba(34, 197, 94, 0.15);
                color: #4ade80;
            }
            .hdrezka-comment-likes.negative {
                background: rgba(239, 68, 68, 0.15);
                color: #f87171;
            }
            .hdrezka-comment-body {
                font-size: 0.93em;
                line-height: 1.5;
                color: #d1d5db;
                word-break: break-word;
            }
            .hdrezka-spoiler-block {
                margin: 8px 0;
                border: 1px dashed rgba(245, 158, 11, 0.4);
                border-radius: 6px;
                overflow: hidden;
            }
            .hdrezka-spoiler-title {
                background: rgba(245, 158, 11, 0.1);
                padding: 6px 10px;
                font-size: 0.85em;
                color: #fbbf24;
                cursor: pointer;
            }
            .hdrezka-spoiler-title.focus {
                background: rgba(245, 158, 11, 0.25);
            }
            .hdrezka-spoiler-content {
                padding: 8px 10px;
                background: rgba(0, 0, 0, 0.2);
            }
            .hdrezka-version-picker {
                margin: 12px 0;
            }
            .hdrezka-version-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px;
                margin-bottom: 8px;
                background: rgba(255, 255, 255, 0.06);
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.15s ease;
            }
            .hdrezka-version-item.focus {
                background: #e50914;
                color: #ffffff;
                box-shadow: 0 4px 12px rgba(229, 9, 20, 0.4);
            }
            .hdrezka-comments-loader, .hdrezka-comments-empty {
                text-align: center;
                padding: 40px 20px;
            }
            .hdrezka-comments-loader .spinner {
                width: 36px;
                height: 36px;
                border: 3px solid rgba(255, 255, 255, 0.15);
                border-top-color: #e50914;
                border-radius: 50%;
                margin: 0 auto 16px;
                animation: rezka-spin 0.8s linear infinite;
            }
            @keyframes rezka-spin {
                to { transform: rotate(360deg); }
            }
            .hdrezka-comments-more-btn {
                text-align: center;
                padding: 12px;
                margin-top: 16px;
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.08);
                color: #ffffff;
                cursor: pointer;
                font-weight: 500;
            }
            .hdrezka-comments-more-btn.focus {
                background: #e50914;
            }
        `;
        $('<style id="hdrezka-comments-styles">' + css + '</style>').appendTo('head');
    }

    // ==========================================
    // ОТКРЫТИЕ МОДАЛЬНОГО ОКНА КОММЕНТАРИЕВ
    // ==========================================

    function openCommentsModal(movie) {
        injectStyles();

        var title = movie.title || movie.name || '';
        var origTitle = movie.original_title || movie.original_name || '';
        var year = (movie.release_date || movie.first_air_date || '').slice(0, 4) || (movie.year ? movie.year.toString() : '');

        var $modalHtml = $(`
            <div class="hdrezka-comments-wrapper">
                <div class="hdrezka-comments-loader">
                    <div class="spinner"></div>
                    <div style="font-size: 1.1em; margin-bottom: 6px;">Поиск отзывов на HDrezka...</div>
                    <div style="font-size: 0.85em; color: rgba(255, 255, 255, 0.5);">${title} ${year ? '(' + year + ')' : ''}</div>
                </div>
            </div>
        `);

        Lampa.Modal.open({
            title: 'Комментарии: ' + title + (year ? ' (' + year + ')' : ''),
            html: $modalHtml,
            size: 'large',
            mask: true,
            onBack: function () {
                Lampa.Modal.close();
                Lampa.Controller.toggle('content');
            }
        });

        // Начинаем поиск
        searchMovie(title, origTitle, year, function (result, errMsg) {
            if (!result) {
                renderError(errMsg || 'Не удалось найти фильм на HDrezka');
                return;
            }

            // Если найдено несколько версий (например, Моана 2016 и Моана 2026)
            if (result.isMultiple && result.items && result.items.length) {
                renderVersionPicker(result.items);
                return;
            }

            loadCommentsForMovie(result);
        });

        function updateStatus(text, subtext) {
            $modalHtml.find('.hdrezka-comments-loader').html(`
                <div class="spinner"></div>
                <div style="font-size: 1.1em; margin-bottom: 6px;">${text}</div>
                <div style="font-size: 0.85em; color: rgba(255, 255, 255, 0.5);">${subtext || ''}</div>
            `);
            Lampa.Modal.update($modalHtml);
        }

        function renderError(msg) {
            $modalHtml.html(`
                <div class="hdrezka-comments-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 12px; color: rgba(255,255,255,0.4);">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <div style="font-size: 1.1em; font-weight: bold; margin-bottom: 8px;">Не удалось загрузить комментарии</div>
                    <div style="font-size: 0.9em; margin-bottom: 16px; color: rgba(255, 255, 255, 0.6); max-width: 500px; margin-left: auto; margin-right: auto;">${msg}</div>
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <div class="modal__button selector retry-btn" style="padding: 10px 20px;">Повторить поиск</div>
                        <div class="modal__button selector bypass-btn" style="padding: 10px 20px; background: #3b82f6;">Обойти Anubis</div>
                    </div>
                </div>
            `);

            $modalHtml.find('.retry-btn').on('hover:enter click', function () {
                openCommentsModal(movie);
            });

            $modalHtml.find('.bypass-btn').on('hover:enter click', function () {
                updateStatus('Выполняем обход защиты Anubis...', 'Генерация PoW токена');
                makeRequest(getMirror() + '/', { _forceAnubis: true }, function () {
                    Lampa.Noty.show('Обход выполнен успешно!');
                    openCommentsModal(movie);
                }, function () {
                    Lampa.Noty.show('Не удалось подключиться к зеркалу');
                    openCommentsModal(movie);
                });
            });

            Lampa.Modal.update($modalHtml);
            Lampa.Controller.enable('modal');
        }

        function renderVersionPicker(items) {
            var $picker = $(`
                <div class="hdrezka-version-picker">
                    <div style="font-size: 1.1em; font-weight: bold; margin-bottom: 6px;">Найдено несколько версий:</div>
                    <div style="font-size: 0.85em; color: rgba(255, 255, 255, 0.5); margin-bottom: 16px;">Выберите подходящий фильм или мультфильм для просмотра отзывов:</div>
                    <div class="version-list"></div>
                </div>
            `);

            var $list = $picker.find('.version-list');
            items.forEach(function (item) {
                var $item = $(`
                    <div class="hdrezka-version-item selector">
                        <div>
                            <div style="font-weight: bold; font-size: 1em;">${item.title}</div>
                            <div style="font-size: 0.85em; color: rgba(255, 255, 255, 0.6);">${item.info || (item.year ? item.year : '')}</div>
                        </div>
                        <div style="color: rgba(255, 255, 255, 0.4); font-size: 1.2em;">➔</div>
                    </div>
                `);

                $item.on('hover:enter click', function () {
                    loadCommentsForMovie(item);
                });

                $list.append($item);
            });

            $modalHtml.html($picker);
            Lampa.Modal.update($modalHtml);
            Lampa.Controller.enable('modal');
        }

        function loadCommentsForMovie(foundMovie) {
            updateStatus('Загрузка комментариев...', foundMovie.title + (foundMovie.info ? ' (' + foundMovie.info + ')' : ''));

            var newsId = foundMovie.id;
            if (!newsId && foundMovie.url) {
                var m = foundMovie.url.match(/\/(\d+)-[^/]+\.html/);
                if (m) newsId = m[1];
            }

            // Прямой запрос к AJAX комментариям (возвращает готовый структурированный HTML)
            var host = getMirror();
            var commAjaxUrl = host + '/ajax/get_comments/?t=' + Date.now() + '&news_id=' + encodeURIComponent(newsId) + '&cstart=1&type=0&comment_id=0&skin=hdrezka';

            makeRequest(commAjaxUrl, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': foundMovie.url || (host + '/')
                }
            }, function (response) {
                var htmlToParse = '';
                if (typeof response === 'object' && response && response.comments) {
                    htmlToParse = response.comments;
                } else if (typeof response === 'string') {
                    try {
                        var parsedJson = JSON.parse(response);
                        if (parsedJson && parsedJson.comments) htmlToParse = parsedJson.comments;
                        else htmlToParse = response;
                    } catch (e) {
                        htmlToParse = response;
                    }
                }

                var parsed = parseCommentsHtml(htmlToParse);
                renderComments(foundMovie, parsed, 1, newsId);
            }, function () {
                // Если AJAX get_comments не вернул результат, пробуем распарсить страницу фильма напрямую
                makeRequest(foundMovie.url, {}, function (pageHtml) {
                    var parsed = parseCommentsHtml(pageHtml);
                    renderComments(foundMovie, parsed, 1, newsId);
                }, function (a, c) {
                    renderError('Не удалось загрузить отзывы: ' + (c || 'Ошибка сети'));
                });
            });
        }

        function renderComments(foundMovie, data, currentPage, newsId) {
            var comments = data.comments || [];
            var total = data.totalCount || comments.length;

            if (!comments.length) {
                $modalHtml.html(`
                    <div class="hdrezka-comments-empty">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 12px; color: rgba(255,255,255,0.4);">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <div style="font-size: 1.1em; font-weight: bold; margin-bottom: 6px;">Комментариев пока нет</div>
                        <div style="font-size: 0.9em; color: rgba(255, 255, 255, 0.5);">К фильму «${foundMovie.title || title}» на HDrezka ещё не оставили отзывов.</div>
                    </div>
                `);
                Lampa.Modal.update($modalHtml);
                Lampa.Controller.enable('modal');
                return;
            }

            var $container = $('<div class="hdrezka-comments-list"></div>');

            // Заголовок
            var $header = $(`
                <div class="hdrezka-comments-header">
                    <div class="hdrezka-comments-source">
                        <span class="badge">HDrezka</span>
                        <span>${foundMovie.title || title}</span>
                    </div>
                    <div class="hdrezka-comments-count">
                        Всего: ${total} ${declOfNum(total, ['отзыв', 'отзыва', 'отзывов'])}
                    </div>
                </div>
            `);
            $container.append($header);

            // Карточки отзывов
            comments.forEach(function (c) {
                var replyClass = c.indent ? ' is-reply-' + Math.min(c.indent, 3) : '';
                var likesClass = '';
                var likesText = c.likes || '';
                if (likesText.indexOf('+') === 0 || parseInt(likesText) > 0) likesClass = ' positive';
                else if (likesText.indexOf('-') === 0 || parseInt(likesText) < 0) likesClass = ' negative';

                var firstLetter = (c.author.charAt(0) || 'U').toUpperCase();
                var avatarHtml = c.avatar 
                    ? `<img src="${c.avatar}" alt="${c.author}" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" /><span class="hdrezka-comment-avatar-fallback" style="display:none;">${firstLetter}</span>`
                    : `<span class="hdrezka-comment-avatar-fallback">${firstLetter}</span>`;

                var $card = $(`
                    <div class="hdrezka-comment-card selector${replyClass}">
                        <div class="hdrezka-comment-top">
                            <div class="hdrezka-comment-avatar">
                                ${avatarHtml}
                            </div>
                            <div class="hdrezka-comment-meta">
                                <div class="hdrezka-comment-author">${c.author}</div>
                                <div class="hdrezka-comment-date">${c.date || ''}</div>
                            </div>
                            ${likesText ? `<div class="hdrezka-comment-likes${likesClass}">${likesText}</div>` : ''}
                        </div>
                        <div class="hdrezka-comment-body">
                            ${c.textHtml}
                        </div>
                    </div>
                `);

                // Раскрытие спойлера
                $card.find('.hdrezka-spoiler-title').on('click hover:enter', function (e) {
                    e.stopPropagation();
                    $(this).next('.hdrezka-spoiler-content').slideToggle(200);
                });

                $container.append($card);
            });

            // Кнопка подгрузки следующих страниц
            if (data.hasNextPage && newsId) {
                var $moreBtn = $(`
                    <div class="hdrezka-comments-more-btn selector">
                        Загрузить ещё комментарии (Страница ${currentPage + 1})
                    </div>
                `);

                $moreBtn.on('hover:enter click', function () {
                    $moreBtn.text('Загрузка...');
                    var host = getMirror();
                    var nextPageUrl = host + '/ajax/get_comments/?t=' + Date.now() + '&news_id=' + encodeURIComponent(newsId) + '&cstart=' + (currentPage + 1) + '&type=0&comment_id=0&skin=hdrezka';

                    makeRequest(nextPageUrl, {
                        headers: { 'X-Requested-With': 'XMLHttpRequest' }
                    }, function (moreResp) {
                        var moreHtml = (typeof moreResp === 'object' && moreResp.comments) ? moreResp.comments : moreResp;
                        var moreParsed = parseCommentsHtml(moreHtml);
                        if (moreParsed.comments && moreParsed.comments.length) {
                            data.comments = data.comments.concat(moreParsed.comments);
                            data.hasNextPage = moreParsed.hasNextPage;
                            renderComments(foundMovie, data, currentPage + 1, newsId);
                        } else {
                            $moreBtn.remove();
                            Lampa.Noty.show('Больше нет комментариев');
                        }
                    }, function () {
                        $moreBtn.text('Ошибка загрузки. Нажмите, чтобы повторить');
                    });
                });

                $container.append($moreBtn);
            }

            $modalHtml.html($container);
            Lampa.Modal.update($modalHtml);
            Lampa.Controller.enable('modal');
        }
    }

    function declOfNum(n, titles) {
        return titles[(n % 100 > 4 && n % 100 < 20) ? 2 : [2, 0, 1, 1, 1, 2][(n % 10 < 5) ? Math.abs(n) % 10 : 5]];
    }

    // ==========================================
    // ВСТРАИВАНИЕ КНОПКИ В КАРТОЧКУ ФИЛЬМА
    // ==========================================

    function addCommentsButton(e) {
        var renderBody = (e.body && e.body.find) ? e.body : (e.object && e.object.activity && e.object.activity.render ? e.object.activity.render() : null);
        if (!renderBody) return;

        var btnContainer = renderBody.find('.full-start-new__buttons, .full-start__buttons, .buttons--container');
        if (!btnContainer.length) return;

        if (btnContainer.find('#btn-hdrezka-comments').length) return;

        var movie = (e.data && e.data.movie) || 
                    (e.object && e.object.card) || 
                    (e.object && e.object.movie) || 
                    (e.props && e.props.get && e.props.get('movie')) || {};

        if (!movie.title && !movie.name) return;

        var btn = $(`
            <div class="full-start__button selector button--comments btn--hdrezka-comments" id="btn-hdrezka-comments" style="display: inline-flex; align-items: center; justify-content: center;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>Комментарии</span>
            </div>
        `);

        btn.on('hover:enter click', function (evt) {
            evt.preventDefault();
            evt.stopPropagation();
            openCommentsModal(movie);
        });

        var optionsBtn = btnContainer.find('.button--options');
        var viewOnline = btnContainer.find('.view--online_mod, .view--torrent');

        if (optionsBtn.length) {
            optionsBtn.before(btn);
        } else if (viewOnline.length) {
            viewOnline.last().after(btn);
        } else {
            btnContainer.append(btn);
        }
    }

    // ==========================================
    // НАСТРОЙКИ LAMPA
    // ==========================================

    function addSettings() {
        if (!Lampa.SettingsApi) return;

        Lampa.SettingsApi.addComponent({
            component: 'hdrezka_comments_settings',
            name: 'Rezka Отзывы',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: 'hdrezka_comments_settings',
            param: {
                name: 'hdrezka_comments_mirror',
                type: 'input',
                default: 'https://rezka.ag',
                values: {}
            },
            field: {
                name: 'Зеркало HDrezka',
                description: 'rezka.ag, hdrezka.me или ваше персональное зеркало'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'hdrezka_comments_settings',
            param: {
                name: 'hdrezka_comments_proxy_mode',
                type: 'select',
                default: 'auto',
                values: {
                    'auto': 'Автоматически (Cloudflare Worker)',
                    'worker': 'Встроенный Worker прокси',
                    'none': 'Без прокси (Direct соединение)',
                    'custom': 'Пользовательский прокси'
                }
            },
            field: {
                name: 'Режим проксирования',
                description: 'Способ обхода сетевых ограничений и CORS'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'hdrezka_comments_settings',
            param: {
                name: 'hdrezka_comments_proxy',
                type: 'input',
                default: '',
                values: {}
            },
            field: {
                name: 'Адрес своего прокси',
                description: 'Используется, если выбран пользовательский прокси'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'hdrezka_comments_settings',
            param: {
                name: 'hdrezka_comments_cookie',
                type: 'input',
                default: '',
                values: {}
            },
            field: {
                name: 'Cookie авторизации',
                description: 'Автоматически заполняется при обходе Anubis или введите вручную'
            }
        });
    }

    // ==========================================
    // СТАРТ ПЛАГИНА
    // ==========================================

    function startPlugin() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                addCommentsButton(e);
            }
        });

        addSettings();
        console.log('HDrezka Comments Plugin initialized v' + VERSION);
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    }
})();
