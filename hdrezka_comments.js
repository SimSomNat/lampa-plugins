// @lampa-desc: Комментарии HDrezka

(function () {
    'use strict';

    // Защита от повторной инициализации плагина
    if (window.plugin_hdrezka_comments_ready) return;
    window.plugin_hdrezka_comments_ready = true;

    var VERSION = '1.0.0';

    // ==========================================
    // НАСТРОЙКИ И УТИЛИТЫ СЕТИ / ЗЕРКАЛ
    // ==========================================

    function getMirror() {
        var custom = (Lampa.Storage.get('hdrezka_comments_mirror', '') || '').trim();
        if (custom) return custom.replace(/\/$/, '');
        var rezkaModMirror = (Lampa.Storage.get('online_mod_rezka2_mirror', '') || '').trim();
        if (rezkaModMirror) return rezkaModMirror.replace(/\/$/, '');
        return 'https://rezka.ag';
    }

    function getProxy() {
        var customProxy = (Lampa.Storage.get('hdrezka_comments_proxy', '') || '').trim();
        if (customProxy) return customProxy;
        var useRezkaModProxy = Lampa.Storage.field('online_mod_proxy_rezka2') === true;
        var rezkaModProxyUrl = (Lampa.Storage.get('online_mod_proxy_other_url', '') || '').trim();
        if (useRezkaModProxy && rezkaModProxyUrl) return rezkaModProxyUrl;
        if (useRezkaModProxy) return 'https://worker-jacred.glitch.me/';
        return '';
    }

    function buildUrl(url) {
        var proxy = getProxy();
        if (!proxy) return url;
        if (proxy.slice(-1) !== '/') proxy += '/';
        return proxy + url;
    }

    function cleanTitle(title) {
        if (!title) return '';
        return title
            .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function makeRequest(url, options, success, error) {
        options = options || {};
        var network = new Lampa.Reguest();
        network.timeout(options.timeout || 10000);

        var targetUrl = buildUrl(url);
        var postdata = options.data || false;
        var reqHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': getMirror() + '/'
        };

        if (options.headers) {
            for (var key in options.headers) {
                reqHeaders[key] = options.headers[key];
            }
        }

        var reqOptions = {
            dataType: options.dataType || 'text',
            headers: reqHeaders,
            withCredentials: false
        };

        network.silent(targetUrl, function (response) {
            network.clear();
            success(response);
        }, function (a, c) {
            network.clear();
            // Попытка fallback через запасной публичный CORS-прокси при ошибках сети в браузере
            if (!options._isFallback && window.location.protocol.indexOf('http') === 0 && !getProxy()) {
                var fallbackUrl = 'https://worker-jacred.glitch.me/' + url;
                var fallbackOptions = Object.assign({}, options, { _isFallback: true });
                var fbNet = new Lampa.Reguest();
                fbNet.timeout(10000);
                fbNet.silent(fallbackUrl, function (res) {
                    fbNet.clear();
                    success(res);
                }, function (fa, fc) {
                    fbNet.clear();
                    if (error) error(fa, fc);
                }, postdata, reqOptions);
                return;
            }
            if (error) error(a, c);
        }, postdata, reqOptions);
    }

    // ==========================================
    // ПОИСК ФИЛЬМА НА HDREZKA
    // ==========================================

    function searchMovie(title, origTitle, year, callback) {
        var host = getMirror();
        var searchQueries = [];

        if (title) searchQueries.push(cleanTitle(title));
        if (origTitle && cleanTitle(origTitle) !== cleanTitle(title)) {
            searchQueries.push(cleanTitle(origTitle));
        }

        var attemptIndex = 0;

        function tryNextQuery() {
            if (attemptIndex >= searchQueries.length) {
                return callback(null, 'Ничего не найдено на HDrezka по запросам: ' + searchQueries.join(', '));
            }

            var query = searchQueries[attemptIndex];
            attemptIndex++;

            // 1. Пробуем быстрый AJAX Live Search
            var ajaxUrl = host + '/engine/ajax/search.php';
            var postdata = 'q=' + encodeURIComponent(query);

            makeRequest(ajaxUrl, {
                data: postdata,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            }, function (response) {
                var items = parseAjaxSearchResults(response, host);
                if (items && items.length) {
                    var match = findBestMatch(items, query, origTitle, year);
                    if (match) return callback(match);
                }

                // 2. Если в ajax пусто, пробуем стандартную страницу поиска /search/
                fallbackSearchPage(query, origTitle, year, function (match2) {
                    if (match2) return callback(match2);
                    tryNextQuery();
                });
            }, function () {
                fallbackSearchPage(query, origTitle, year, function (match2) {
                    if (match2) return callback(match2);
                    tryNextQuery();
                });
            });
        }

        function fallbackSearchPage(query, origTitle, targetYear, done) {
            var searchPageUrl = host + '/search/?do=search&subaction=search&q=' + encodeURIComponent(query);
            makeRequest(searchPageUrl, {}, function (html) {
                var items = parsePageSearchResults(html, host);
                if (items && items.length) {
                    var match = findBestMatch(items, query, origTitle, targetYear);
                    done(match);
                } else {
                    done(null);
                }
            }, function () {
                done(null);
            });
        }

        tryNextQuery();
    }

    function parseAjaxSearchResults(html, host) {
        if (!html) return [];
        var items = [];
        var links = html.match(/<li>[\s\S]*?<a [^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/gi) || [];

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
            var orig = '';
            var yearMatch = cleanBlock.match(/\b(19\d\d|20\d\d)\b/);
            if (yearMatch) year = parseInt(yearMatch[1]);

            var origMatch = cleanBlock.match(/\(([^,)]+)/);
            if (origMatch) orig = origMatch[1].trim();

            items.push({
                url: href,
                title: title,
                origTitle: orig,
                year: year
            });
        });

        return items;
    }

    function parsePageSearchResults(html, host) {
        if (!html) return [];
        var items = [];
        var linkBlocks = html.match(/<div class=["']b-content__inline_item-link["']>[\s\S]*?<\/div>/gi) || [];

        linkBlocks.forEach(function (block) {
            var hrefMatch = block.match(/<a [^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
            if (!hrefMatch) return;
            var href = hrefMatch[1];
            if (href.indexOf('http') !== 0) href = host + (href.charAt(0) === '/' ? '' : '/') + href;
            var title = hrefMatch[2].replace(/<[^>]+>/g, '').trim();

            var infoMatch = block.match(/<div>([\s\S]*?)<\/div>/i);
            var info = infoMatch ? infoMatch[1].replace(/<[^>]+>/g, '').trim() : '';

            var year = 0;
            var ym = info.match(/\b(19\d\d|20\d\d)\b/);
            if (ym) year = parseInt(ym[1]);

            items.push({
                url: href,
                title: title,
                info: info,
                year: year
            });
        });

        return items;
    }

    function findBestMatch(items, searchTitle, searchOrig, targetYear) {
        if (!items || !items.length) return null;
        if (items.length === 1) return items[0];

        // 1. Поиск по году + совпадению названия
        if (targetYear) {
            var yearMatches = items.filter(function (it) {
                return it.year && Math.abs(it.year - targetYear) <= 1;
            });
            if (yearMatches.length === 1) return yearMatches[0];
            if (yearMatches.length > 1) items = yearMatches;
        }

        // 2. Поиск по точному названию
        var normSearch = (searchTitle || '').toLowerCase();
        var normOrig = (searchOrig || '').toLowerCase();

        for (var i = 0; i < items.length; i++) {
            var itNorm = (items[i].title || '').toLowerCase();
            var itOrigNorm = (items[i].origTitle || '').toLowerCase();
            if (normSearch && (itNorm === normSearch || itOrigNorm === normSearch)) {
                return items[i];
            }
            if (normOrig && (itNorm === normOrig || itOrigNorm === normOrig)) {
                return items[i];
            }
        }

        return items[0];
    }

    // ==========================================
    // ПАРСИНГ КОММЕНТАРИЕВ СО СТРАНИЦЫ ФИЛЬМА
    // ==========================================

    function parseCommentsFromHtml(html, pageUrl) {
        var comments = [];
        var totalCount = 0;

        // Поиск общего количества комментариев
        var countMatch = html.match(/class=["'][^"']*b-post__comments_counter[^"']*["'][^>]*>\s*\(?(\d+)\)?/i) ||
                         html.match(/id=["']comments-count["'][^>]*>(\d+)/i) ||
                         html.match(/Комментарии\s*\((\d+)\)/i);
        if (countMatch) {
            totalCount = parseInt(countMatch[1]);
        }

        // Поиск ID новости (фильма) для возможной подгрузки страниц (ajax/get_comments/)
        var newsId = '';
        var newsMatch = html.match(/name=["']news_id["']\s+value=["'](\d+)["']/i) ||
                        html.match(/data-news_id=["'](\d+)["']/i) ||
                        html.match(/\.initCDNSeriesEvents\(\s*(\d+)/i) ||
                        html.match(/\.initCDNMoviesEvents\(\s*(\d+)/i);
        if (newsMatch) {
            newsId = newsMatch[1];
        } else if (pageUrl) {
            var urlIdMatch = pageUrl.match(/\/(\d+)-[^/]+\.html/i);
            if (urlIdMatch) newsId = urlIdMatch[1];
        }

        // Вырезаем блок комментариев
        var listIndex = html.indexOf('comments-tree-list');
        var commentsHtml = html;
        if (listIndex !== -1) {
            commentsHtml = html.slice(listIndex - 50);
            var endComments = commentsHtml.indexOf('class="b-post__navigation"');
            if (endComments !== -1) commentsHtml = commentsHtml.slice(0, endComments);
        }

        // Находим все узлы комментариев
        var $div = $('<div>' + commentsHtml + '</div>');
        var $items = $div.find('.comments-tree-item, .b-comment');

        if ($items.length === 0) {
            $items = $div.find('li[id^="comments-tree-item"], div[id^="comment-id-"]');
        }

        $items.each(function () {
            var $item = $(this);

            // Исключаем вложенные комментарии при прямом парсинге корневых селекторов
            var author = $item.find('.b-comment__user, .author, .b-comment__header a').first().text().trim() || 'Пользователь';
            var avatar = $item.find('.b-comment__user_avatar img, .avatar img, .b-comment__avatar img').first().attr('src') || '';
            var date = $item.find('.b-comment__date, .date, span.b-comment__date').first().text().trim();
            var likes = $item.find('.b-comment__likes_count, .likes, .b-comment__rating').first().text().trim();
            var textEl = $item.find('.b-comment__text, .b-comment__body, .text').first();

            // Обработка цитат и спойлеров в тексте
            textEl.find('script, style').remove();
            
            // Стилизуем спойлеры
            textEl.find('.title_spoiler').addClass('hdrezka-spoiler-title');
            textEl.find('.text_spoiler').addClass('hdrezka-spoiler-content');

            var contentHtml = textEl.html() || '';
            contentHtml = contentHtml.trim();

            if (!contentHtml) return;

            // Вычисляем уровень вложенности ответа
            var indentLevel = 0;
            var parents = $item.parents('.comments-tree-list, ul');
            if (parents.length > 1) {
                indentLevel = Math.min(parents.length - 1, 3);
            }

            comments.push({
                author: author,
                avatar: avatar,
                date: date,
                likes: likes,
                textHtml: contentHtml,
                indent: indentLevel
            });
        });

        if (!totalCount) totalCount = comments.length;

        var hasNextPage = html.indexOf('b-navigation__next') !== -1 || (totalCount > comments.length && comments.length > 0);

        return {
            newsId: newsId,
            totalCount: totalCount,
            comments: comments,
            hasNextPage: hasNextPage
        };
    }

    // ==========================================
    // UI ИНТЕРФЕЙС И МОДАЛЬНОЕ ОКНО LAMPA
    // ==========================================

    function injectStyles() {
        if ($('#hdrezka-comments-styles').length) return;
        var style = document.createElement('style');
        style.id = 'hdrezka-comments-styles';
        style.innerHTML = `
            .btn--hdrezka-comments {
                margin-left: 0.5em;
            }
            .hdrezka-comments-modal {
                padding: 10px 15px;
                color: #fff;
                font-family: inherit;
            }
            .hdrezka-comments-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 16px;
                padding-bottom: 12px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
            .hdrezka-comments-source {
                font-size: 0.9em;
                color: #f2b705;
                font-weight: bold;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .hdrezka-comments-count {
                font-size: 0.9em;
                color: rgba(255, 255, 255, 0.6);
            }
            .hdrezka-comment-card {
                background: rgba(255, 255, 255, 0.04);
                border-radius: 10px;
                padding: 14px 16px;
                margin-bottom: 12px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                transition: transform 0.2s, background-color 0.2s, border-color 0.2s;
            }
            .hdrezka-comment-card.selector.focus {
                background: rgba(255, 255, 255, 0.12);
                border-color: #f2b705;
                box-shadow: 0 0 15px rgba(242, 183, 5, 0.3);
            }
            .hdrezka-comment-card.is-reply-1 {
                margin-left: 24px;
                border-left: 3px solid #4b89dc;
                background: rgba(75, 137, 220, 0.05);
            }
            .hdrezka-comment-card.is-reply-2 {
                margin-left: 44px;
                border-left: 3px solid #a060e8;
                background: rgba(160, 96, 232, 0.05);
            }
            .hdrezka-comment-card.is-reply-3 {
                margin-left: 64px;
                border-left: 3px solid #48cfad;
                background: rgba(72, 207, 173, 0.05);
            }
            .hdrezka-comment-top {
                display: flex;
                align-items: center;
                margin-bottom: 10px;
            }
            .hdrezka-comment-avatar {
                width: 38px;
                height: 38px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.15);
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                margin-right: 12px;
                flex-shrink: 0;
            }
            .hdrezka-comment-avatar img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            .hdrezka-comment-avatar-fallback {
                font-weight: bold;
                font-size: 16px;
                color: #fff;
            }
            .hdrezka-comment-meta {
                flex-grow: 1;
            }
            .hdrezka-comment-author {
                font-weight: 600;
                font-size: 1.05em;
                color: #f2b705;
            }
            .hdrezka-comment-date {
                font-size: 0.8em;
                color: rgba(255, 255, 255, 0.5);
                margin-top: 2px;
            }
            .hdrezka-comment-likes {
                font-size: 0.85em;
                font-weight: bold;
                padding: 3px 8px;
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.08);
                color: rgba(255, 255, 255, 0.8);
            }
            .hdrezka-comment-likes.positive {
                color: #48cfad;
                background: rgba(72, 207, 173, 0.15);
            }
            .hdrezka-comment-likes.negative {
                color: #ed5565;
                background: rgba(237, 85, 101, 0.15);
            }
            .hdrezka-comment-body {
                font-size: 0.95em;
                line-height: 1.5;
                color: rgba(255, 255, 255, 0.9);
                word-break: break-word;
            }
            .hdrezka-comment-body .quote {
                border-left: 3px solid rgba(255, 255, 255, 0.3);
                padding: 6px 12px;
                margin: 6px 0;
                background: rgba(255, 255, 255, 0.04);
                font-style: italic;
                color: rgba(255, 255, 255, 0.7);
                border-radius: 0 6px 6px 0;
            }
            .hdrezka-spoiler-title {
                color: #f2b705;
                font-weight: bold;
                cursor: pointer;
                padding: 4px 8px;
                background: rgba(242, 183, 5, 0.15);
                border-radius: 4px;
                display: inline-block;
                margin: 4px 0;
            }
            .hdrezka-spoiler-content {
                background: rgba(0, 0, 0, 0.4);
                padding: 8px 12px;
                border-radius: 6px;
                margin: 4px 0;
                border: 1px dashed rgba(255, 255, 255, 0.2);
            }
            .hdrezka-comments-loader {
                text-align: center;
                padding: 40px 20px;
            }
            .hdrezka-comments-loader .spinner {
                width: 44px;
                height: 44px;
                margin: 0 auto 16px auto;
                border: 4px solid rgba(255, 255, 255, 0.1);
                border-left-color: #f2b705;
                border-radius: 50%;
                animation: hr-spin 1s linear infinite;
            }
            @keyframes hr-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .hdrezka-comments-empty {
                text-align: center;
                padding: 40px 20px;
                color: rgba(255, 255, 255, 0.6);
            }
            .hdrezka-comments-empty svg {
                margin-bottom: 12px;
                opacity: 0.5;
            }
            .hdrezka-comments-more-btn {
                text-align: center;
                padding: 12px 20px;
                margin: 16px auto 8px auto;
                background: rgba(242, 183, 5, 0.15);
                color: #f2b705;
                font-weight: bold;
                border-radius: 8px;
                border: 1px solid rgba(242, 183, 5, 0.3);
            }
            .hdrezka-comments-more-btn.selector.focus {
                background: #f2b705;
                color: #000;
                box-shadow: 0 0 15px rgba(242, 183, 5, 0.5);
            }
        `;
        document.head.appendChild(style);
    }

    function openCommentsModal(movie) {
        injectStyles();

        var title = movie.title || movie.name || 'Фильм';
        var origTitle = movie.original_title || movie.original_name || '';
        var year = parseInt(((movie.release_date || movie.first_air_date || '') + '').slice(0, 4)) || 0;

        var modalTitle = 'Комментарии: ' + title + (year ? ' (' + year + ')' : '');

        var $modalHtml = $(`
            <div class="hdrezka-comments-modal">
                <div class="hdrezka-comments-loader">
                    <div class="spinner"></div>
                    <div style="font-size: 1.1em; margin-bottom: 6px;">Поиск на HDrezka...</div>
                    <div style="font-size: 0.85em; color: rgba(255, 255, 255, 0.5);">${title} ${origTitle ? ' / ' + origTitle : ''}</div>
                </div>
            </div>
        `);

        Lampa.Modal.open({
            title: modalTitle,
            html: $modalHtml,
            size: 'large',
            scroll_to_center: true,
            onBack: function () {
                Lampa.Modal.close();
                Lampa.Controller.toggle('content');
            }
        });

        // Начинаем поиск фильма на HDrezka
        searchMovie(title, origTitle, year, function (foundMovie, errorMsg) {
            if (!foundMovie) {
                renderError(errorMsg || 'Фильм не найден на HDrezka');
                return;
            }

            updateModalStatus('Загрузка комментариев с HDrezka...', foundMovie.title || title);

            // Загружаем страницу фильма
            makeRequest(foundMovie.url, {}, function (html) {
                var parsed = parseCommentsFromHtml(html, foundMovie.url);
                renderComments(foundMovie, parsed, 1);
            }, function (a, c) {
                renderError('Не удалось загрузить страницу фильма: ' + (c || 'Ошибка сети'));
            });
        });

        function updateModalStatus(text, subtext) {
            $modalHtml.html(`
                <div class="hdrezka-comments-loader">
                    <div class="spinner"></div>
                    <div style="font-size: 1.1em; margin-bottom: 6px;">${text}</div>
                    <div style="font-size: 0.85em; color: rgba(255, 255, 255, 0.5);">${subtext || ''}</div>
                </div>
            `);
            Lampa.Modal.update($modalHtml);
        }

        function renderError(msg) {
            $modalHtml.html(`
                <div class="hdrezka-comments-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <div style="font-size: 1.1em; font-weight: bold; margin-bottom: 8px;">Не удалось найти комментарии</div>
                    <div style="font-size: 0.9em; margin-bottom: 16px; color: rgba(255, 255, 255, 0.6);">${msg}</div>
                    <div class="modal__button selector retry-btn" style="display: inline-block; padding: 10px 20px;">Повторить поиск</div>
                </div>
            `);
            $modalHtml.find('.retry-btn').on('hover:enter click', function () {
                openCommentsModal(movie);
            });
            Lampa.Modal.update($modalHtml);
        }

        function renderComments(foundMovie, data, currentPage) {
            var comments = data.comments || [];
            var total = data.totalCount || comments.length;

            if (!comments.length) {
                $modalHtml.html(`
                    <div class="hdrezka-comments-empty">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <div style="font-size: 1.1em; font-weight: bold; margin-bottom: 6px;">Комментариев пока нет</div>
                        <div style="font-size: 0.9em; color: rgba(255, 255, 255, 0.5);">К фильму «${foundMovie.title || title}» на HDrezka ещё не оставили отзывов.</div>
                    </div>
                `);
                Lampa.Modal.update($modalHtml);
                return;
            }

            var $container = $('<div class="hdrezka-comments-list"></div>');

            // Верхняя плашка информации
            var $header = $(`
                <div class="hdrezka-comments-header">
                    <div class="hdrezka-comments-source">
                        <span>HDrezka</span>
                        <span style="color: rgba(255, 255, 255, 0.4);">•</span>
                        <span style="color: rgba(255, 255, 255, 0.8);">${foundMovie.title || title}</span>
                    </div>
                    <div class="hdrezka-comments-count">
                        Всего: ${total} ${declOfNum(total, ['комментарий', 'комментария', 'комментариев'])}
                    </div>
                </div>
            `);
            $container.append($header);

            // Рендер каждого комментария
            comments.forEach(function (c) {
                var replyClass = c.indent ? ' is-reply-' + c.indent : '';
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

                // Интерактивное раскрытие спойлеров по клику / пульту
                $card.find('.hdrezka-spoiler-title').on('click hover:enter', function (e) {
                    e.stopPropagation();
                    $(this).next('.hdrezka-spoiler-content').slideToggle(200);
                });

                $container.append($card);
            });

            // Кнопка "Загрузить ещё", если есть след. страницы
            if (data.hasNextPage && data.newsId) {
                var $moreBtn = $(`
                    <div class="hdrezka-comments-more-btn selector">
                        Загрузить ещё комментарии (Страница ${currentPage + 1})
                    </div>
                `);

                $moreBtn.on('hover:enter click', function () {
                    $moreBtn.text('Загрузка комментариев...');
                    loadMoreComments(foundMovie, data.newsId, currentPage + 1, function (moreComments, hasNext) {
                        if (moreComments && moreComments.length) {
                            data.comments = data.comments.concat(moreComments);
                            data.hasNextPage = hasNext;
                            renderComments(foundMovie, data, currentPage + 1);
                        } else {
                            $moreBtn.remove();
                            Lampa.Noty.show('Больше нет комментариев');
                        }
                    });
                });

                $container.append($moreBtn);
            }

            $modalHtml.html($container);
            Lampa.Modal.update($modalHtml);
        }

        function loadMoreComments(foundMovie, newsId, nextPage, onLoaded) {
            var host = getMirror();
            var ajaxUrl = host + '/ajax/get_comments/';
            var postdata = 'news_id=' + encodeURIComponent(newsId) + '&cstart=' + encodeURIComponent(nextPage);

            makeRequest(ajaxUrl, {
                data: postdata,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            }, function (responseHtml) {
                var parsed = parseCommentsFromHtml(responseHtml, '');
                onLoaded(parsed.comments, parsed.hasNextPage);
            }, function () {
                onLoaded([], false);
            });
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

        // Ищем контейнер с кнопками действия (Смотреть, Закладки, Реакции и т.д.)
        var btnContainer = renderBody.find('.full-start-new__buttons, .full-start__buttons, .buttons--container');
        if (!btnContainer.length) return;

        // Предотвращаем дублирование кнопки
        if (btnContainer.find('#btn-hdrezka-comments').length) return;

        // Извлекаем актуальные данные фильма
        var movie = (e.data && e.data.movie) || 
                    (e.object && e.object.card) || 
                    (e.object && e.object.movie) || 
                    (e.props && e.props.get && e.props.get('movie')) || {};

        if (!movie.title && !movie.name) return;

        // Создаем кнопку с иконкой сообщений
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

        // Вставляем перед кнопкой настроек (троеточие), после онлайн/торрент кнопок, либо в конец
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
    // РЕГИСТРАЦИЯ В LAMPA
    // ==========================================

    function startPlugin() {
        // Подписка на загрузку полной карточки
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                addCommentsButton(e);
            }
        });

        // Настройки плагина в Lampa
        if (Lampa.Settings && Lampa.Settings.listener) {
            Lampa.Params.select('hdrezka_comments_mirror', '', '');
            Lampa.Params.select('hdrezka_comments_proxy', '', '');

            Lampa.Settings.listener.follow('open', function (e) {
                if (e.name === 'main') {
                    // Раздел настроек можно добавить при необходимости
                }
            });
        }

        console.log('HDrezka Comments Plugin for Lampa initialized successfully. v' + VERSION);
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    }
})();
