// @lampa-desc: rezkacomments — Комментарии от HDrezka
(function () {
  ("use strict");

  let year;
  let namemovie;

  function getSettings() {
    let host = (Lampa.Storage.get('rezka_comment_host', 'https://rezka.ag') || 'https://rezka.ag').trim().replace(/\/+$/, '');
    let cookie = (Lampa.Storage.get('rezka_comment_cookie', '') || '').trim();
    let proxy = (Lampa.Storage.get('rezka_comment_proxy', '') || '').trim();
    return { host, cookie, proxy };
  }

  // Отдельный тип ошибки, чтобы отличать содержательный ответ воркера
  // (blocked / not ok с готовым текстом) от обычного JS/сетевого исключения.
  function RezkaProxyError(message, details) {
    this.name = 'RezkaProxyError';
    this.message = message;
    this.details = details || null;
  }
  RezkaProxyError.prototype = Object.create(Error.prototype);

  // fetch() требует, чтобы значения заголовков были в ISO-8859-1 (Latin-1).
  // Ссылки на Rezka нередко содержат кириллицу прямо в slug
  // (например, /series/comedy/12345-футурама-1999.html), поэтому Referer
  // с такой ссылкой валит fetch с "String contains non ISO-8859-1 code point".
  // Процентно кодируем только не-ASCII символы, оставляя остальную часть
  // URL читаемой (сервер Rezka корректно принимает такой Referer).
  function toHeaderSafe(str) {
    if (!str) return str;
    return str.replace(/[^\x00-\xFF]/g, (ch) => encodeURIComponent(ch));
  }

  /**
   * Единая точка сетевых запросов к Rezka.
   *
   * path    — относительный путь ("/search/?..." или "/ajax/get_comments/?...")
   * referer — что подставить в Referer (обычно url страницы фильма на Rezka)
   *
   * Возвращает СЫРОЙ текст тела ответа (HTML либо JSON-строку из /ajax/),
   * как и раньше — чтобы DOMParser/JSON.parse выше по стеку не переписывать.
   *
   * Если Rezka вернула блокировку (Anubis/Cloudflare/403/404/5xx) —
   * бросает RezkaProxyError с готовым для показа пользователю текстом.
   */
  async function rezkaFetch(path, referer) {
    let { host, cookie, proxy } = getSettings();
    let target = host + path;

    // --- Основной режим: через Cloudflare Worker ---
    if (proxy) {
      let p = proxy.endsWith('/') ? proxy : proxy + '/';
      // ВАЖНО: target передаётся как значение query-параметра, а не
      // приклеивается к пути воркера — это исключает схлопывание "//"
      // в "/" на спецсимволах и слэшах внутри поискового запроса.
      let requestUrl = p + '?url=' + encodeURIComponent(target);

      let headers = {};
      if (cookie) headers['x-cookie'] = toHeaderSafe(cookie);
      headers['x-referer'] = toHeaderSafe(referer || (host + '/'));

      let response = await fetch(requestUrl, { method: 'GET', headers: headers });

      if (!response.ok) {
        // Ошибка самого воркера (плохой url, хост не разрешён, сеть) —
        // такие случаи воркер отдаёт настоящим HTTP-кодом 400/502.
        let details = null;
        try { details = await response.json(); } catch (e) {}
        throw new RezkaProxyError(
          (details && details.message) || ('Прокси вернул ошибку HTTP ' + response.status),
          details
        );
      }

      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new RezkaProxyError('Прокси вернул не-JSON ответ. Проверьте адрес воркера в настройках.', null);
      }

      if (data.blocked || !data.ok) {
        throw new RezkaProxyError(
          data.message || ('Rezka вернула HTTP ' + data.status),
          data
        );
      }

      return data.body;
    }

    // --- Fallback без прокси: сработает только если окружение не блокирует CORS ---
    let headers = {};
    if (cookie) headers['x-cookie'] = toHeaderSafe(cookie);
    if (referer) headers['x-referer'] = toHeaderSafe(referer);

    let response = await fetch(target, { method: 'GET', headers: headers });
    let fc = await response.text();

    if (response.status === 403 || fc.includes('Проверяем, что вы не бот') || fc.includes('Anubis')) {
      throw new RezkaProxyError('Rezka требует защиты Anubis. Обновите Cookie в настройках.', { status: response.status });
    }
    if (!response.ok) {
      throw new RezkaProxyError('HTTP статус ' + response.status, { status: response.status });
    }

    return fc;
  }

  async function searchRezka(name, ye) {
    try {
      let path = "/search/?do=search&subaction=search&q=" + encodeURIComponent(name) + (ye ? "+" + ye : "");
      let fc = await rezkaFetch(path);

      let dom = new DOMParser().parseFromString(fc, "text/html");
      const item = dom.querySelector(".b-content__inline_item");

      if (!item) {
        Lampa.Noty.show('Фильм/сериал не найден на Rezka');
        Lampa.Loading.stop();
        return;
      }

      namemovie = item.querySelector(".b-content__inline_item-link")?.innerText || name;
      let itemUrl = item.querySelector(".b-content__inline_item-link")?.getAttribute("href") || "";
      await comment_rezka(item.dataset.id, itemUrl);
    } catch (e) {
      console.error('[RezkaComment] searchRezka error:', e, e.details);
      Lampa.Noty.show('Ошибка поиска: ' + e.message);
      Lampa.Loading.stop();
    }
  }

  async function resolveAndSearch(movie, method) {
    let queryTitle = movie.original_title || movie.original_name || movie.title || movie.name;

    try {
      let type = method === 'movie' ? 'movie' : 'tv';
      let cacheKey = type + '_' + movie.id;

      window.__tmdbTranslationsCache = window.__tmdbTranslationsCache || {};
      let tr = window.__tmdbTranslationsCache[cacheKey];

      if (!tr) {
        const data = await new Promise((res, rej) =>
          Lampa.Api.sources.tmdb.get(`${type}/${movie.id}?append_to_response=translations`, {}, res, rej)
        );
        tr = data.translations?.translations || [];
        window.__tmdbTranslationsCache[cacheKey] = tr;
      }

      const enTranslation = tr.find((t) => t.iso_3166_1 === 'US' || t.iso_639_1 === 'en');
      const enTitle = enTranslation?.data?.title || enTranslation?.data?.name;

      if (enTitle) queryTitle = enTitle;
    } catch (e) {
      console.warn('[RezkaComment] TMDB fetch error, using fallback title:', queryTitle);
    }

    if (queryTitle) {
      await searchRezka(normalizeTitle(queryTitle), year);
    } else {
      Lampa.Noty.show('Название фильма не определено');
      Lampa.Loading.stop();
    }
  }

  function cleanTitle(str) {
    return str.replace(/[\s.,:;’'`!?]+/g, " ").trim();
  }

  function normalizeTitle(str) {
    return cleanTitle(
      str.toLowerCase()
        .replace(/[\-\u2010-\u2015\u2E3A\u2E3B\uFE58\uFE63\uFF0D]+/g, "-")
        .replace(/ё/g, "е")
    );
  }

  function buildCommentNode(item) {
    const q = (s) => item.querySelector(s);
    const avatar = q(".ava img")?.dataset.src || q(".ava img")?.src || "";
    const user = q(".name, .b-comment__user")?.innerText || "Без имени";
    const date = q(".date, .b-comment__time")?.innerText || "";
    const text = q(".message .text, .text")?.innerHTML || "";

    const wrapper = document.createElement("div");
    wrapper.className = "message";
    wrapper.innerHTML = `
      <div class="comment-wrap">
        <div class="avatar-column">
          ${avatar ? `<img src="${avatar}" class="avatar-img" alt="${user}">` : ''}
        </div>
        <div class="comment-card">
          <div class="comment-header">
            <span class="name">${user}</span>
            <span class="date">${date}</span>
          </div>
          <div class="comment-text">
            <div class="text">${text}</div>
          </div>
        </div>
      </div>
    `;
    return wrapper;
  }

  function buildTree(root) {
    const fragment = document.createDocumentFragment();
    for (let li of root.children) {
      const indent = parseInt(li.dataset.indent || 0, 10);
      const wrapper = document.createElement("li");
      wrapper.className = "comments-tree-item";
      wrapper.style.marginLeft = indent > 0 ? "20px" : "0";
      wrapper.appendChild(buildCommentNode(li));

      const childrenList = li.querySelector("ol.comments-tree-list");
      if (childrenList) wrapper.appendChild(buildTree(childrenList));

      fragment.appendChild(wrapper);
    }
    return fragment;
  }

  async function comment_rezka(id, pageUrl) {
    try {
      let t = Date.now();
      let path = "/ajax/get_comments/?t=" + t + "&news_id=" + (id || "1") + "&cstart=1&type=0&comment_id=0&skin=hdrezka";
      let fc = await rezkaFetch(path, pageUrl);

      let json = JSON.parse(fc);
      if (!json || !json.comments) throw new Error('Пустой ответ от сервера');

      let dom = new DOMParser().parseFromString(json.comments, "text/html");
      dom.querySelectorAll(".actions, i, .share-link").forEach((elem) => elem.remove());

      let rootList = dom.querySelector(".comments-tree-list");
      if (!rootList) {
        Lampa.Noty.show('Комментарии отсутствуют');
        Lampa.Loading.stop();
        return;
      }

      openModal(buildTree(rootList));
    } catch (e) {
      console.error('[RezkaComment] comment_rezka error:', e, e.details);
      Lampa.Noty.show('Ошибка получения комментариев: ' + e.message);
      Lampa.Loading.stop();
    }

    function openModal(treeContent) {
      Lampa.Loading.stop();
      let modal = $(`<div><div class="broadcast__text" style="text-align:left;"><div class="comment"></div></div></div>`);
      modal.find(".comment").append(treeContent);

      if (!document.getElementById("rezka-comment-style")) {
        const styleEl = document.createElement("style");
        styleEl.id = "rezka-comment-style";
        styleEl.textContent = `
          .comments-tree-list{list-style:none;margin:0;padding:0;}
          .comments-tree-item{list-style:none;margin:0;padding:0;}
          .comment-wrap{display:flex;margin-bottom:5px;}
          .avatar-column{margin-right:10px;}
          .avatar-img{width:48px;height:48px;border-radius:4px;}
          .comment-card{background:#1b1b1b;padding:5px 12px;border-radius:6px;border:1px solid #2a2a2a;width:100%;}
          .comment-header{display:flex;justify-content:space-between;margin-bottom:6px;}
          .comment-header .name{font-weight:600;color:#fff;}
          .comment-header .date{opacity:.7;font-size:11px;}
          .comment-text .text{color:#ddd;line-height:1.45;}
          .rc-children{margin-left:30px;border-left:1px solid #333;padding-left:14px;}
          .title_spoiler{display:inline-flex;align-items:center;background:#2a2a2a;border-radius:6px;padding:1px 4px;margin:0 2px;font-size:13px;color:#e0e0e0;cursor:pointer;}
          .title_spoiler a{color:#e0e0e0!important;text-decoration:none!important;}
        `;
        document.head.appendChild(styleEl);
      }

      if (!window.rezkaSpoilerInit) {
        window.rezkaSpoilerInit = true;
        const Script = document.createElement("script");
        Script.textContent = "function ShowOrHide(id){var t=$('#'+id);t.prev('.title_spoiler').remove();t.css('display','inline');}";
        document.head.appendChild(Script);
      }

      Lampa.Modal.open({
        title: namemovie || 'Комментарии',
        html: modal,
        size: "large",
        mask: true,
        onBack: function () {
          Lampa.Modal.close();
          Lampa.Controller.toggle("content");
        }
      });
    }
  }

  function startPlugin() {
    window.comment_plugin = true;

    try {
      Lampa.SettingsApi.addComponent({
        component: 'rezka_comment',
        name: 'Rezka Comments',
        icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
      });

      Lampa.SettingsApi.addParam({
        component: 'rezka_comment',
        param: {
          name: 'rezka_comment_host',
          type: 'input',
          placeholder: 'https://rezka.ag',
          values: Lampa.Storage.get('rezka_comment_host', 'https://rezka.ag'),
          default: 'https://rezka.ag'
        },
        field: {
          name: 'Зеркало hdrezka',
          description: 'Адрес зеркала (например, https://hdrezka.me)'
        },
        onChange: function(value) {
          Lampa.Storage.set('rezka_comment_host', value);
        }
      });

      Lampa.SettingsApi.addParam({
        component: 'rezka_comment',
        param: {
          name: 'rezka_comment_cookie',
          type: 'input',
          placeholder: 'Вставьте полные куки',
          values: Lampa.Storage.get('rezka_comment_cookie', ''),
          default: ''
        },
        field: {
          name: 'Cookie авторизации',
          description: 'Полная строка document.cookie из браузера'
        },
        onChange: function(value) {
          Lampa.Storage.set('rezka_comment_cookie', value);
        }
      });

      Lampa.SettingsApi.addParam({
        component: 'rezka_comment',
        param: {
          name: 'rezka_comment_proxy',
          type: 'input',
          placeholder: 'https://worker-domain.workers.dev/',
          values: Lampa.Storage.get('rezka_comment_proxy', ''),
          default: ''
        },
        field: {
          name: 'CORS Прокси',
          description: 'Ваш Cloudflare Worker (обязательно с / на конце). В WebView практически всегда нужен — прямой запрос почти наверняка упадёт на CORS.'
        },
        onChange: function(value) {
          Lampa.Storage.set('rezka_comment_proxy', value);
        }
      });
    } catch (e) {
      console.error('[RezkaComment] Settings init error:', e);
    }

    Lampa.Listener.follow("full", function (e) {
      if (e.type == "complite") {
        $(".button--comment").remove();
        $(".full-start-new__buttons").append(
          `<div class="full-start__button selector button--comment"><svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 356.484 356.484"><g><path d="M293.984 7.23H62.5C28.037 7.23 0 35.268 0 69.731v142.78c0 34.463 28.037 62.5 62.5 62.5l147.443.001 70.581 70.58a12.492 12.492 0 0 0 13.622 2.709 12.496 12.496 0 0 0 7.717-11.547v-62.237c30.759-3.885 54.621-30.211 54.621-62.006V69.731c0-34.463-28.037-62.501-62.5-62.501zm37.5 205.282c0 20.678-16.822 37.5-37.5 37.5h-4.621c-6.903 0-12.5 5.598-12.5 12.5v44.064l-52.903-52.903a12.493 12.493 0 0 0-8.839-3.661H62.5c-20.678 0-37.5-16.822-37.5-37.5V69.732c0-20.678 16.822-37.5 37.5-37.5h231.484c20.678 0 37.5 16.822 37.5 37.5v142.78z" fill="currentcolor"/></g></svg><span>${Lampa.Lang.translate("title_comments")}</span></div>`
        );

        $(".button--comment").on("hover:enter", function () {
          year = 0;
          if (e.data.movie.release_date) {
            year = e.data.movie.release_date.slice(0, 4);
          } else if (e.data.movie.first_air_date) {
            year = e.data.movie.first_air_date.slice(0, 4);
          }
          Lampa.Loading.start();
          resolveAndSearch(e.data.movie, e.object.method);
        });
      }
    });
  }

  if (!window.comment_plugin) startPlugin();
})();
