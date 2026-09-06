// @lampa-desc: Онлайн-каталог HDRezka (просмотр фильмов и сериалов)
(function() {
    'use strict';

    if (typeof Lampa !== 'undefined' && Lampa.Platform && Lampa.Platform.tv) {
        Lampa.Platform.tv();
    }

    var pluginVersion = '02.07.2026-rezka';
    var isAndroid = typeof Lampa !== 'undefined' && Lampa.Platform && Lampa.Platform.is('android');
    var currentIp = '';
    var requestInstance = new Lampa.Reguest();
    var isStarting = false;

    // Auto-configuration from script URL parameters (?mirror=...&cookie=...&proxy=...)
    try {
        var scriptSrc = '';
        if (typeof document !== 'undefined') {
            if (document.currentScript && document.currentScript.src) {
                scriptSrc = document.currentScript.src;
            } else {
                var scripts = document.getElementsByTagName('script');
                for (var si = 0; si < scripts.length; si++) {
                    if (scripts[si].src && scripts[si].src.indexOf('hdrezka.js') !== -1) {
                        scriptSrc = scripts[si].src;
                        break;
                    }
                }
            }
        }
        if (scriptSrc && scriptSrc.indexOf('?') !== -1 && typeof Lampa !== 'undefined' && Lampa.Storage) {
            var qStr = scriptSrc.substring(scriptSrc.indexOf('?') + 1);
            var qPairs = qStr.split('&');
            for (var qi = 0; qi < qPairs.length; qi++) {
                var qp = qPairs[qi].split('=');
                var qk = decodeURIComponent(qp[0] || '');
                var qv = decodeURIComponent(qp[1] || '');
                if (qk === 'mirror' && qv) {
                    Lampa.Storage.set('online_mod_rezka2_mirror', qv.trim());
                }
                if (qk === 'cookie' && qv) {
                    Lampa.Storage.set('online_mod_rezka2_cookie', qv.trim());
                    Lampa.Storage.set('online_mod_rezka2_status', 'true');
                }
                if (qk === 'proxy') {
                    Lampa.Storage.set('online_mod_proxy_rezka2', qv === '1' || qv === 'true');
                }
            }
        }
    } catch (e) {}

    // Helper: string start check
    function startsWith(str, prefix) {
        return str && str.indexOf(prefix) === 0;
    }

    // Helper: string end check
    function endsWith(str, suffix) {
        if (!str || !suffix) return false;
        var diff = str.length - suffix.length;
        if (diff < 0) return false;
        return str.lastIndexOf(suffix, diff) === diff;
    }

    // User Agent
    function baseUserAgent() {
        return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
    }

    // Random string generation
    function randomHex(len) {
        var chars = '0123456789abcdef';
        var res = '';
        for (var i = 0; i < len; i++) {
            res += chars[Math.floor(Math.random() * chars.length)];
        }
        return res;
    }

    // Check Android app version
    function checkAndroidVersion(minVersion) {
        if (typeof AndroidJS !== 'undefined') {
            try {
                var parts = AndroidJS.appVersion().split('-');
                var code = parts.pop();
                if (parseInt(code, 10) >= minVersion) return true;
            } catch (e) {}
        }
        return false;
    }

    // Check if custom mirror is set
    function hasCustomRezkaMirror() {
        if (typeof Lampa === 'undefined' || !Lampa.Storage) return false;
        var m = (Lampa.Storage.get('online_mod_rezka2_mirror', '') + '').trim();
        return !!m && m !== 'https://rezka.ag';
    }

    // Get active HDrezka mirror
    function getRezkaMirror() {
        var mirror = (Lampa.Storage.get('online_mod_rezka2_mirror', '') + '').trim();
        if (!mirror) return 'https://rezka.ag';
        if (mirror.indexOf('://') === -1) mirror = 'https://' + mirror;
        if (mirror.charAt(mirror.length - 1) === '/') mirror = mirror.substring(0, mirror.length - 1);
        return mirror;
    }

    // IP helpers
    function setMyIp(ip) {
        currentIp = ip;
    }
    function getMyIp() {
        return currentIp;
    }
    function checkMyIp(req, callback) {
        if (currentIp) {
            callback();
            return;
        }
        req.clear();
        req.timeout(10000);
        req.silent('https://api.ipify.org/?format=json', function(data) {
            if (data && data.ip) setMyIp(data.ip);
            callback();
        }, function() {
            req.clear();
            req.timeout(10000);
            req.silent(getProxy('ip') + 'jsonip', function(data) {
                if (data && data.ip) setMyIp(data.ip);
                callback();
            }, function() {
                callback();
            });
        });
    }

    // Proxy calculation
    function getProxy(type) {
        var myIp = getMyIp() || '';
        var ipParam = Lampa.Storage.field('online_mod_proxy_find_ip') === true ? 'ip' + myIp + '/' : '';
        var workerProxy = (new Date().getHours() % 2) ? 'https://cors.fx666.workers.dev/' : 'https://cors557.deno.dev/';
        var defaultWorker = 'https://cors.nb557.workers.dev/';
        var ipWorker = defaultWorker + (ipParam ? '' : 'ip/');
        
        var customProxyActive = Lampa.Storage.field('online_mod_proxy_other') === true;
        var customProxyUrl = customProxyActive ? (Lampa.Storage.field('online_mod_proxy_other_url') || '') : '';
        
        var standardProxy = (customProxyUrl || ipWorker) + ipParam;
        var cookieProxy = (customProxyUrl || workerProxy) + ipParam;

        if (type === 'rezka2') {
            if (Lampa.Storage.field('online_mod_proxy_rezka2') === true) return standardProxy;
            return '';
        }
        if (type === 'cookie') {
            return cookieProxy;
        }
        if (type === 'ip') {
            return defaultWorker;
        }
        return '';
    }

    // URL resolution helper
    function parseURL(url) {
        var res = { href: url, protocol: '', host: '', origin: '', pathname: '', search: '', hash: '' };
        var idx = url.indexOf('#');
        if (idx !== -1) {
            res.hash = url.substring(idx);
            url = url.substring(0, idx);
        }
        idx = url.indexOf('?');
        if (idx !== -1) {
            res.search = url.substring(idx);
            url = url.substring(0, idx);
        }
        idx = url.indexOf(':');
        var slashIdx = url.indexOf('/');
        if (idx !== -1 && (slashIdx === -1 || slashIdx > idx)) {
            res.protocol = url.substring(0, idx + 1);
            url = url.substring(idx + 1);
        }
        if (startsWith(url, '//')) {
            idx = url.indexOf('/', 2);
            if (idx !== -1) {
                res.host = url.substring(2, idx);
                url = url.substring(idx);
            } else {
                res.host = url.substring(2);
                url = '/';
            }
            res.origin = res.protocol + '//' + res.host;
        }
        res.pathname = url;
        return res;
    }

    function fixLink(url, base) {
        if (!url) return url;
        if (!base || url.indexOf('://') !== -1) return url;
        var parsed = parseURL(base);
        if (startsWith(url, '//')) return parsed.protocol + url;
        if (startsWith(url, '/')) return parsed.origin + url;
        if (startsWith(url, '?')) return parsed.origin + parsed.pathname + url;
        if (startsWith(url, '#')) return parsed.origin + parsed.pathname + parsed.search + url;
        var path = parsed.origin + parsed.pathname;
        path = path.substring(0, path.lastIndexOf('/') + 1);
        return path + url;
    }

    function fixLinkProtocol(url, preferHttp, defaultProto) {
        if (!url) return url;
        if (startsWith(url, '//')) {
            return (preferHttp ? 'http:' : 'https:') + url;
        } else {
            if (preferHttp && defaultProto) {
                return url.replace('https://', 'http://');
            } else if (!preferHttp && defaultProto === 'full') {
                return url.replace('http://', 'https://');
            }
        }
        return url;
    }

    function proxyLink(url, proxyHost, extraPrefix, encMode) {
        if (url && proxyHost) {
            if (extraPrefix == null) extraPrefix = '';
            if (encMode == null) encMode = 'enc';

            if (encMode === 'enc') {
                var slashIdx = url.indexOf('/');
                if (slashIdx !== -1 && url.charAt(slashIdx + 1) === '/') slashIdx++;
                var proto = slashIdx !== -1 ? url.substring(0, slashIdx + 1) : '';
                var rest = slashIdx !== -1 ? url.substring(slashIdx + 1) : url;
                return proxyHost + 'enc/' + encodeURIComponent(btoa(extraPrefix + proto)) + '/' + rest;
            }
            if (encMode === 'enc1') {
                var lastSlash = url.lastIndexOf('/');
                var p1 = lastSlash !== -1 ? url.substring(0, lastSlash + 1) : '';
                var p2 = lastSlash !== -1 ? url.substring(lastSlash + 1) : url;
                return proxyHost + 'enc1/' + encodeURIComponent(btoa(extraPrefix + p1)) + '/' + p2;
            }
            if (encMode === 'enc2' || encMode === 'enc2t') {
                var qIdx = url.lastIndexOf('?');
                var slashSlashIdx = url.lastIndexOf('://');
                if (qIdx === -1 || qIdx <= slashSlashIdx) qIdx = url.length;
                if (slashSlashIdx === -1) slashSlashIdx = -3;
                var middle = url.substring(slashSlashIdx + 3, qIdx);
                slashSlashIdx = middle.lastIndexOf('/');
                middle = slashSlashIdx !== -1 ? middle.substring(slashSlashIdx + 1) : '';
                return proxyHost + 'enc2/' + encodeURIComponent(btoa(extraPrefix + url)) + '/' + middle + (encMode === 'enc2t' ? '?jacred.test' : '');
            }
            return proxyHost + extraPrefix + url;
        }
        return url;
    }

    function proxyStream(url, type) {
        var useStreamProxy = Lampa.Storage.field('online_mod_use_stream_proxy') === true;
        var rezkaServer = Lampa.Storage.field('online_mod_rezka2_prx_ukr') || 'prx.ukrtelcdn.net';
        var rezkaBase = '//' + rezkaServer + '/';
        var fixStream = Lampa.Storage.field('online_mod_rezka2_fix_stream') === true;
        var preferHttp = Lampa.Storage.field('online_mod_prefer_http') === true;

        if (url && useStreamProxy) {
            if (type === 'rezka2') {
                return url.replace(/\/\/(stream\.voidboost\.(cc|top|link|club)|[^\/]*.ukrtelcdn.net|vdbmate.org|sambray.org|rumbegg.org|laptostack.org|frntroy.org|femeretes.org)\//, rezkaBase);
            }
            return (preferHttp ? 'http://apn.cfhttp.top/' : 'https://apn.watch/') + url;
        }
        if (url && fixStream && type === 'rezka2') {
            return url.replace(/\/\/(stream\.voidboost\.(cc|top|link|club)|[^\/]*.ukrtelcdn.net)\//, '//femeretes.org/');
        }
        return url;
    }

    // Title matching helpers
    function cleanTitle(str) {
        return (str || '').replace(/[\s.,:;’'`!?]+/g, ' ').trim();
    }

    function normalizeTitle(str) {
        return cleanTitle((str || '').toLowerCase().replace(/[\-\u2010-\u2015\u2E3A\u2E3B\uFE58\uFE63\uFF0D]+/g, '-').replace(/ё/g, 'е'));
    }

    function equalTitle(t1, t2) {
        return typeof t1 === 'string' && typeof t2 === 'string' && normalizeTitle(t1) === normalizeTitle(t2);
    }

    function containsTitle(t1, t2) {
        return typeof t1 === 'string' && typeof t2 === 'string' && normalizeTitle(t1).indexOf(normalizeTitle(t2)) !== -1;
    }

    function equalAnyTitle(arr1, arr2) {
        if (!arr1 || !arr2) return false;
        return arr2.some(function(item2) {
            return item2 && arr1.some(function(item1) {
                return item1 && equalTitle(item1, item2);
            });
        });
    }

    function containsAnyTitle(arr1, arr2) {
        if (!arr1 || !arr2) return false;
        return arr2.some(function(item2) {
            return item2 && arr1.some(function(item1) {
                return item1 && containsTitle(item1, item2);
            });
        });
    }

    // HDrezka stream trash decoder
    function decodeRezkaTrash(data) {
        if (!data || data.indexOf('#') !== 0) return data;
        function b64encode(str) {
            return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
                return String.fromCharCode('0x' + p1);
            }));
        }
        function b64decode(str) {
            return decodeURIComponent(atob(str).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
        }
        var trashList = ['$$#!!@#!@##', '@@@@@!##!^^^', '####^!!##!@@', '^^^!@##!!##', '$$!!@$$@^!@#$$@'];
        var clean = data.substring(2);
        trashList.forEach(function(trash) {
            clean = clean.split('//_//' + b64encode(trash)).join('');
        });
        try {
            clean = b64decode(clean);
        } catch (e) {
            clean = '';
        }
        return clean;
    }

    // Playlist parser for [1080p]http:... or http:...
    function parsePlaylist(data) {
        var result = [];
        try {
            if (data && data.indexOf('[') === 0) {
                data.substring(1).split(/, *\[/).forEach(function(item) {
                    item = item.trim();
                    if (endsWith(item, ',')) item = item.substring(0, item.length - 1).trim();
                    var closeBracket = item.indexOf(']');
                    if (closeBracket >= 0) {
                        var label = item.substring(0, closeBracket).trim();
                        if (item.charAt(closeBracket + 1) === '{') {
                            item.substring(closeBracket + 2).split(/; *\{/).forEach(function(sub) {
                                sub = sub.trim();
                                if (endsWith(sub, ';')) sub = sub.substring(0, sub.length - 1).trim();
                                var closeBrace = sub.indexOf('}');
                                if (closeBrace >= 0) {
                                    var voice = sub.substring(0, closeBrace).trim();
                                    result.push({
                                        label: label,
                                        voice: voice,
                                        links: sub.substring(closeBrace + 1).split(' or ').map(function(s) { return s.trim(); }).filter(Boolean)
                                    });
                                }
                            });
                        } else {
                            result.push({
                                label: label,
                                links: item.substring(closeBracket + 1).split(' or ').map(function(s) { return s.trim(); }).filter(Boolean)
                            });
                        }
                    }
                });
                result = result.filter(function(i) { return i.links && i.links.length; });
            }
        } catch (e) {}
        return result;
    }

    function processSubs(url) {
        return url;
    }

    function parseSubtitles(subStr, preferHttp) {
        if (!subStr) return false;
        var list = parsePlaylist(subStr).map(function(item) {
            var link = item.links[0] || '';
            link = fixLinkProtocol(link, preferHttp, 'full');
            return {
                label: item.label,
                url: processSubs(link)
            };
        });
        return list.length ? list : false;
    }

    function formatRezkaError(req, err, errText) {
        if (!err || err.status === 0) {
            return 'HDrezka: нет связи (ошибка сети/CORS). Укажите рабочее зеркало из Telegram-бота @hdrezka_bot или включите «Проксировать HDrezka»';
        }
        if (err.status === 403) {
            return 'HDrezka [403]: Доступ ограничен. Обновите персональное зеркало в Telegram-боте @hdrezka_bot';
        }
        if (err.status === 404) {
            return 'HDrezka [404]: Прокси-сервер недоступен или устарело зеркало. Отключите «Проксировать HDrezka» и укажите актуальное зеркало из @hdrezka_bot';
        }
        return req ? req.errorDecode(err, errText) : 'Ошибка сети HDrezka';
    }

    // Cookie Autofill for HDrezka
    function rezkaFillCookie(onSuccess, onError) {
        var loginName = (Lampa.Storage.get('online_mod_rezka2_name', '') + '').trim();
        var loginPassword = (Lampa.Storage.get('online_mod_rezka2_password', '') + '').trim();
        if (!loginName || !loginPassword) {
            Lampa.Noty.show('Сначала введите Логин и Пароль HDrezka в настройках (или вставьте куки вручную)!');
            if (onError) onError();
            return;
        }

        var proxy = getProxy('rezka2');
        var extra = '';
        var isPlatformAndroid = isAndroid;
        var proxyMirror = Lampa.Storage.field('online_mod_proxy_rezka2_mirror') === true;
        var host = hasCustomRezkaMirror() ? getRezkaMirror() : ((proxy && !proxyMirror) ? 'https://rezka.ag' : getRezkaMirror());

        if (!proxy && !isPlatformAndroid && !hasCustomRezkaMirror()) proxy = getProxy('cookie');
        if (!proxy && !isPlatformAndroid && !hasCustomRezkaMirror()) {
            Lampa.Noty.show('Укажите рабочее зеркало из @hdrezka_bot или включите прокси');
            if (onError) onError();
            return;
        }

        var uAgent = baseUserAgent();
        var headers = isPlatformAndroid ? { 'User-Agent': uAgent } : {};
        if (proxy) {
            extra += 'param/User-Agent=' + encodeURIComponent(uAgent) + '/';
            extra += 'cookie_plus/param/Cookie=/';
            isPlatformAndroid = false;
        }

        var loginUrl = host + '/ajax/login/';
        var postData = 'login_name=' + encodeURIComponent(loginName);
        postData += '&login_password=' + encodeURIComponent(loginPassword);
        postData += '&login_not_save=0';

        var req = new Lampa.Reguest();
        req.clear();
        req.timeout(8000);
        req.native(proxyLink(loginUrl, proxy, extra, 'enc2t'), function(response) {
            var cookiesMap = {};
            var phpsessid = '';
            var cookieStr = '';
            var body = (response && response.body) || {};
            body = typeof body === 'string' ? Lampa.Arrays.decodeJson(body, {}) : body;

            if (!body.success) {
                if (body.message) Lampa.Noty.show(body.message);
                else Lampa.Noty.show('Неверный логин или пароль HDrezka');
                if (onError) onError();
                return;
            }

            var setCookie = (response && response.headers && response.headers['set-cookie']) || null;
            if (setCookie && setCookie.forEach) {
                setCookie.forEach(function(c) {
                    var parts = c.split(';')[0].split('=');
                    if (parts[0]) {
                        if (parts[1] === 'deleted') delete cookiesMap[parts[0]];
                        else cookiesMap[parts[0]] = parts[1] || '';
                    }
                });
                phpsessid = cookiesMap['PHPSESSID'];
                delete cookiesMap['PHPSESSID'];
                var arr = [];
                for (var k in cookiesMap) {
                    arr.push(k + '=' + cookiesMap[k]);
                }
                cookieStr = arr.join('; ');
            }

            if (cookieStr) {
                Lampa.Storage.set('online_mod_rezka2_cookie', cookieStr);
                Lampa.Storage.set('online_mod_rezka2_status', 'true');
                if (cookieStr.indexOf('PHPSESSID=') === -1) {
                    cookieStr = 'PHPSESSID=' + (phpsessid || randomHex(0x1a)) + (cookieStr ? '; ' + cookieStr : '');
                }
                var extra2 = extra;
                if (proxy) {
                    extra2 += 'param/Cookie=' + encodeURIComponent(cookieStr) + '/';
                } else {
                    headers['Cookie'] = cookieStr;
                }

                var req2 = new Lampa.Reguest();
                req2.clear();
                req2.timeout(8000);
                req2.native(proxyLink(host + '/', proxy, extra2, 'enc2t'), function(resp2) {
                    var body2 = typeof resp2 === 'string' ? Lampa.Arrays.decodeJson(resp2, {}) : resp2;
                    var html = ((body2 && body2.body) || '').replace(/\n/g, '');

                    var errMatch = html.match(/(<div class="error-code">[^<]*<div>[^<]*<\/div>[^<]*<\/div>)\s*(<div class="error-title">[^<]*<\/div>)/);
                    if (errMatch) {
                        Lampa.Noty.show(errMatch[0]);
                        if (onError) onError();
                        return;
                    }

                    var setCookie2 = (body2 && body2.headers && body2.headers['set-cookie']) || null;
                    if (setCookie2 && setCookie2.forEach) {
                        setCookie2.forEach(function(c) {
                            var parts = c.split(';')[0].split('=');
                            if (parts[0]) {
                                if (parts[1] === 'deleted') delete cookiesMap[parts[0]];
                                else cookiesMap[parts[0]] = parts[1] || '';
                            }
                        });
                        phpsessid = cookiesMap['PHPSESSID'] || phpsessid;
                        delete cookiesMap['PHPSESSID'];
                        var arr2 = [];
                        for (var k2 in cookiesMap) {
                            arr2.push(k2 + '=' + cookiesMap[k2]);
                        }
                        cookieStr = arr2.join('; ');
                        if (cookieStr) Lampa.Storage.set('online_mod_rezka2_cookie', cookieStr);
                    }

                    var mirrorMatch = html.match(/<span>MIRROR<\/span>.*<button type="submit" onclick="\$\.cookie(\([^)]*\))/);
                    if (mirrorMatch) {
                        var cookieArg;
                        try {
                            cookieArg = (0, eval)('("use strict"; (function(name, value){ return {name: name, value: value}; })' + mirrorMatch[1] + ';');
                        } catch (e) {}
                        if (cookieArg) {
                            cookiesMap[cookieArg.name] = cookieArg.value;
                            var arr3 = [];
                            for (var k3 in cookiesMap) {
                                arr3.push(k3 + '=' + cookiesMap[k3]);
                            }
                            cookieStr = arr3.join('; ');
                            if (cookieStr) Lampa.Storage.set('online_mod_rezka2_cookie', cookieStr);
                            if (cookieStr.indexOf('PHPSESSID=') === -1) {
                                cookieStr = 'PHPSESSID=' + (phpsessid || randomHex(0x1a)) + (cookieStr ? '; ' + cookieStr : '');
                            }
                            var extra3 = extra;
                            if (proxy) extra3 += 'param/Cookie=' + encodeURIComponent(cookieStr) + '/';
                            else headers['Cookie'] = cookieStr;

                            var req3 = new Lampa.Reguest();
                            req3.clear();
                            req3.timeout(8000);
                            req3.native(proxyLink(host + '/', proxy, extra3, 'enc2t'), function(resp3) {
                                var body3 = typeof resp3 === 'string' ? Lampa.Arrays.decodeJson(resp3, {}) : resp3;
                                var setCookie3 = (body3 && body3.headers && body3.headers['set-cookie']) || null;
                                if (setCookie3 && setCookie3.forEach) {
                                    setCookie3.forEach(function(c) {
                                        var parts = c.split(';')[0].split('=');
                                        if (parts[0]) {
                                            if (parts[1] === 'deleted') delete cookiesMap[parts[0]];
                                            else cookiesMap[parts[0]] = parts[1] || '';
                                        }
                                    });
                                    delete cookiesMap['PHPSESSID'];
                                    var arr4 = [];
                                    for (var k4 in cookiesMap) {
                                        arr4.push(k4 + '=' + cookiesMap[k4]);
                                    }
                                    cookieStr = arr4.join('; ');
                                    if (cookieStr) Lampa.Storage.set('online_mod_rezka2_cookie', cookieStr);
                                }
                                Lampa.Storage.set('online_mod_rezka2_status', 'true');
                                Lampa.Noty.show('Куки для HDrezka успешно сохранены! Авторизация активна.');
                                if (onSuccess) onSuccess();
                            }, function(err, errText) {
                                Lampa.Storage.set('online_mod_rezka2_status', 'true');
                                Lampa.Noty.show('Куки получены! Проверьте запуск видео.');
                                if (onSuccess) onSuccess();
                            }, null, { dataType: 'text', headers: headers, returnHeaders: isPlatformAndroid });
                            return;
                        }
                    }
                    Lampa.Storage.set('online_mod_rezka2_status', 'true');
                    Lampa.Noty.show('Куки для HDrezka успешно сохранены! Авторизация активна.');
                    if (onSuccess) onSuccess();
                }, function(err, errText) {
                    Lampa.Storage.set('online_mod_rezka2_status', 'true');
                    Lampa.Noty.show('Куки получены! Проверьте запуск видео.');
                    if (onSuccess) onSuccess();
                }, null, { dataType: 'text', headers: headers, returnHeaders: isPlatformAndroid });
            } else {
                Lampa.Noty.show('Не удалось извлечь куки сессии');
                if (onError) onError();
            }
        }, function(err, errText) {
            Lampa.Noty.show(formatRezkaError(req, err, errText));
            if (onError) onError();
        }, postData, { headers: headers, returnHeaders: isPlatformAndroid });
    }

    // Login for HDrezka
    function rezkaLogin(onSuccess, onError) {
        var savedCookies = (Lampa.Storage.get('online_mod_rezka2_cookie', '') + '').trim();
        // If user already entered cookies, we do NOT need to run login/pass request!
        if (savedCookies) {
            Lampa.Storage.set('online_mod_rezka2_status', 'true');
            Lampa.Noty.show('Куки уже сохранены! Авторизация действует, повторный вход не требуется.');
            if (onSuccess) onSuccess();
            return;
        }

        var loginName = (Lampa.Storage.get('online_mod_rezka2_name', '') + '').trim();
        var loginPassword = (Lampa.Storage.get('online_mod_rezka2_password', '') + '').trim();
        if (!loginName || !loginPassword) {
            Lampa.Noty.show('Введите Логин и Пароль, либо вставьте строку Cookie в настройках!');
            if (onError) onError();
            return;
        }

        var mirror = getRezkaMirror();
        var proxy = getProxy('rezka2');
        var proxyMirror = Lampa.Storage.field('online_mod_proxy_rezka2_mirror') === true;
        var host = hasCustomRezkaMirror() ? mirror : ((proxy && !proxyMirror) ? 'https://rezka.ag' : mirror);
        var url = host + '/ajax/login/';
        var postData = 'login_name=' + encodeURIComponent(loginName);
        postData += '&login_password=' + encodeURIComponent(loginPassword);
        postData += '&login_not_save=0';

        var req = new Lampa.Reguest();
        req.clear();
        req.timeout(8000);

        if (proxy) {
            var extra = 'param/User-Agent=' + encodeURIComponent(baseUserAgent()) + '/';
            req.native(proxyLink(url, proxy, extra, 'enc2t'), function(response) {
                var body = (response && response.body) || {};
                body = typeof body === 'string' ? Lampa.Arrays.decodeJson(body, {}) : body;
                if (body && (body.success || body.message === 'Уже авторизован на сайте. Необходимо обновить страницу!')) {
                    Lampa.Storage.set('online_mod_rezka2_status', 'true');
                    Lampa.Noty.show('Вход в HDrezka выполнен успешно!');
                    if (onSuccess) onSuccess();
                } else {
                    Lampa.Storage.set('online_mod_rezka2_status', 'false');
                    Lampa.Noty.show(body.message || 'Ошибка авторизации. Рекомендуется использовать кнопку «Заполнить куки (Авто)» или вставить куки вручную');
                    if (onError) onError();
                }
            }, function(err, errText) {
                Lampa.Storage.set('online_mod_rezka2_status', 'false');
                Lampa.Noty.show(formatRezkaError(req, err, errText));
                if (onError) onError();
            }, postData, { dataType: 'text' });
        } else {
            req.silent(url, function(resp) {
                if (resp && (resp.success || resp.message === 'Уже авторизован на сайте. Необходимо обновить страницу!')) {
                    Lampa.Storage.set('online_mod_rezka2_status', 'true');
                    Lampa.Noty.show('Вход в HDrezka выполнен успешно!');
                    if (onSuccess) onSuccess();
                } else {
                    Lampa.Storage.set('online_mod_rezka2_status', 'false');
                    if (resp && resp.message) Lampa.Noty.show(resp.message);
                    else Lampa.Noty.show('Ошибка входа. Попробуйте нажать «Заполнить куки (Авто)» или вставить куки вручную');
                    if (onError) onError();
                }
            }, function(err, errText) {
                Lampa.Storage.set('online_mod_rezka2_status', 'false');
                Lampa.Noty.show(formatRezkaError(req, err, errText));
                if (onError) onError();
            }, postData, { withCredentials: true });
        }
    }

    // Logout for HDrezka
    function rezkaLogout(onSuccess, onError) {
        var url = getRezkaMirror() + '/logout/';
        var req = new Lampa.Reguest();
        req.clear();
        req.timeout(8000);
        req.silent(url, function() {
            Lampa.Storage.set('online_mod_rezka2_status', 'false');
            if (onSuccess) onSuccess();
        }, function(err, errText) {
            Lampa.Storage.set('online_mod_rezka2_status', 'false');
            Lampa.Noty.show(req.errorDecode(err, errText));
            if (onError) onError();
        }, null, { dataType: 'text', withCredentials: true });
    }

    // ==========================================
    // HDREZKA SOURCE COMPONENT
    // ==========================================
    function HDrezkaSource(component, movieData) {
        var request = new Lampa.Reguest();
        var rezkaData = {};
        var currentMovie = movieData;
        var searchTitle = '';
        var preferHttp = Lampa.Storage.field('online_mod_prefer_http') === true;
        var preferMp4 = Lampa.Storage.field('online_mod_prefer_mp4') === true;
        var proxyMirror = Lampa.Storage.field('online_mod_proxy_rezka2_mirror') === true;
        var proxyHost = component.proxy('rezka2');
        var mirror = hasCustomRezkaMirror() ? getRezkaMirror() : ((proxyHost && !proxyMirror) ? 'https://rezka.ag' : getRezkaMirror());
        var mirrorSlash = mirror + '/';
        var withCreds = !(proxyHost || isAndroid);
        var uAgent = baseUserAgent();
        var defaultHeaders = isAndroid ? { 'Origin': mirror, 'Referer': mirrorSlash, 'User-Agent': uAgent } : {};
        var proxyExtra = '';

        if (proxyHost) {
            proxyExtra += 'param/Origin=' + encodeURIComponent(mirror) + '/';
            proxyExtra += 'param/Referer=' + encodeURIComponent(mirrorSlash) + '/';
            proxyExtra += 'param/User-Agent=' + encodeURIComponent(uAgent) + '/';
        }

        var storedCookie = Lampa.Storage.get('online_mod_rezka2_cookie', '') + '';
        if (storedCookie.indexOf('PHPSESSID=') === -1) {
            storedCookie = 'PHPSESSID=' + randomHex(0x1a) + (storedCookie ? '; ' + storedCookie : '');
        }
        if (storedCookie) {
            if (isAndroid) defaultHeaders['Cookie'] = storedCookie;
            if (proxyHost) proxyExtra += 'param/Cookie=' + encodeURIComponent(storedCookie) + '/';
        }

        var filterData = {};
        var choiceState = { season: 0, voice: 0, voice_name: '', season_id: '' };
        var serverErrorMessage = '';

        function checkPageErrors(html) {
            var checkForm = html.match(/<form id="check-form" class="check-form" method="post" action="\/ajax\/login\/">/);
            if (checkForm) {
                serverErrorMessage = Lampa.Lang.translate('online_mod_captcha_address') + ' HDrezka (требуется пройти капчу на сайте)';
                return;
            }
            var errCode = html.match(/(<div class="error-code">[^<]*<div>[^<]*<\/div>[^<]*<\/div>)\s*(<div class="error-title">[^<]*<\/div>)/);
            if (errCode) {
                var c1 = ($(errCode[1]).text().trim() || '');
                var c2 = ($(errCode[2]).text().trim() || '');
                if (c1.indexOf('105') !== -1 || c2.indexOf('подозрительная') !== -1) {
                    serverErrorMessage = 'HDrezka [105]: IP адрес заблокирован сайтом. Отключите «Проксировать HDrezka» и укажите личное зеркало из бота @hdrezka_bot';
                } else if (c1.indexOf('404') !== -1) {
                    serverErrorMessage = 'HDrezka [404]: Страница не найдена. Отключите «Проксировать HDrezka» и укажите рабочее зеркало из бота @hdrezka_bot';
                } else {
                    serverErrorMessage = c1 + ':\n' + c2;
                }
                return;
            }
            var mirrorForm = html.match(/<span>MIRROR<\/span>.*<button type="submit" onclick="\$\.cookie(\([^)]*\))/);
            if (mirrorForm) {
                serverErrorMessage = 'HDrezka: зеркало требует обновления. Получите персональное зеркало в Telegram-боте @hdrezka_bot';
                return;
            }
            if (startsWith(html, 'Fatal error:')) {
                serverErrorMessage = html;
            }
        }

        this.search = function(activity, kinopoiskId, itemResults) {
            var self = this;
            currentMovie = activity;
            searchTitle = currentMovie.search || currentMovie.movie.title;

            if (this.wait_similars && itemResults && itemResults[0] && itemResults[0].is_similars) {
                return extractPage(itemResults[0].link);
            }

            serverErrorMessage = '';
            var releaseYear = currentMovie.search_date || (!currentMovie.clarification && (currentMovie.movie.release_date || currentMovie.movie.first_air_date || currentMovie.movie.last_air_date)) || '0000';
            var parsedYear = parseInt((releaseYear + '').slice(0, 4));
            var altTitles = [];

            if (currentMovie.movie.alternative_titles && currentMovie.movie.alternative_titles.results) {
                altTitles = currentMovie.movie.alternative_titles.results.map(function(t) { return t.title; });
            }
            if (currentMovie.movie.original_title) altTitles.push(currentMovie.movie.original_title);
            if (currentMovie.movie.original_name) altTitles.push(currentMovie.movie.original_name);

            var liveSearchUrl = mirrorSlash + 'engine/ajax/search.php';
            var standardSearchUrl = mirrorSlash + 'search/?do=search&subaction=search';

            function searchByLive(q, resultsList, onComplete) {
                var post = 'q=' + encodeURIComponent(q);
                request.clear();
                request.timeout(10000);
                request.native(component.proxyLink(liveSearchUrl, proxyHost, proxyExtra, 'enc2t'), function(html) {
                    html = (html || '').replace(/\n/g, '');
                    checkPageErrors(html);
                    var items = html.match(/<li><a href=.*?<\/li>/g);
                    var hasMore = html.indexOf('<a class="b-search__live_all"') !== -1;
                    if (items && items.length) resultsList = resultsList.concat(items);
                    if (onComplete) onComplete(resultsList, hasMore, q);
                }, function(err, errText) {
                    if (serverErrorMessage) component.empty(serverErrorMessage);
                    else component.empty(formatRezkaError(request, err, errText));
                }, post, { dataType: 'text', withCredentials: withCreds, headers: defaultHeaders });
            }

            function processLiveResults(items, hasMore, queryText) {
                if (items && items.length) {
                    var isExact = false;
                    var parsedItems = items.map(function(itemHtml) {
                        var elem = $(itemHtml);
                        var a = $('a', elem);
                        var enty = $('.enty', a);
                        var rating = $('.rating', a);
                        var title = enty.text().trim() || '';
                        enty.remove();
                        rating.remove();
                        var text = a.text().trim() || '';
                        var orig = '';
                        var year = null;
                        var yearMatch = text.match(/\((.*,\s*)?\b(\d{4})(\s*-\s*[\d.]*)\)$/);
                        if (yearMatch) {
                            if (yearMatch[1]) {
                                var oMatch = yearMatch[1].match(/^([^а-яА-ЯёЁ]+),/);
                                if (oMatch) orig = oMatch[1].trim();
                            }
                            year = parseInt(yearMatch[2]);
                        }
                        return { year: year, title: title, orig_title: orig, link: a.attr('href') || '' };
                    });

                    var filtered = parsedItems;
                    if (filtered.length) {
                        if (altTitles.length) {
                            var byAlt = filtered.filter(function(i) {
                                return component.containsAnyTitle([i.orig_title, i.title], altTitles);
                            });
                            if (byAlt.length) { filtered = byAlt; isExact = true; }
                        }
                        if (searchTitle) {
                            var byTitle = filtered.filter(function(i) {
                                return component.containsAnyTitle([i.title, i.orig_title], [searchTitle]);
                            });
                            if (byTitle.length) { filtered = byTitle; isExact = true; }
                        }
                        if (filtered.length > 1 && parsedYear) {
                            var byYear = filtered.filter(function(i) { return i.year == parsedYear; });
                            if (!byYear.length) {
                                byYear = filtered.filter(function(i) {
                                    return i.year && i.year > parsedYear - 2 && i.year < parsedYear + 2;
                                });
                            }
                            if (byYear.length) filtered = byYear;
                        }
                    }

                    if (filtered.length === 1 && isExact) {
                        if (parsedYear && filtered[0].year) {
                            isExact = filtered[0].year > parsedYear - 2 && filtered[0].year < parsedYear + 2;
                        }
                        if (isExact) {
                            isExact = false;
                            if (altTitles.length) isExact = isExact || component.equalAnyTitle([filtered[0].orig_title, filtered[0].title], altTitles);
                            if (searchTitle) isExact = isExact || component.equalAnyTitle([filtered[0].title, filtered[0].orig_title], [searchTitle]);
                        }
                    }

                    if (filtered.length === 1 && isExact) {
                        extractPage(filtered[0].link);
                    } else if (parsedItems.length) {
                        self.wait_similars = true;
                        parsedItems.forEach(function(i) { i.is_similars = true; });
                        component.similars(parsedItems);
                        component.loading(false);
                    } else {
                        component.emptyForQuery(searchTitle);
                    }
                } else {
                    if (serverErrorMessage) component.empty(serverErrorMessage);
                    else component.emptyForQuery(searchTitle);
                }
            }

            searchByLive(component.cleanTitle(searchTitle), [], function(results, hasMore, q) {
                processLiveResults(results, hasMore, q);
            });
        };

        this.extendChoice = function(choice) {
            Lampa.Arrays.extend(choiceState, choice, true);
        };

        this.reset = function() {
            component.reset();
            choiceState = { season: 0, voice: 0, voice_name: '', season_id: '' };
            component.loading(true);
            applyFilterAndShow(onFilterApplied);
            component.saveChoice(choiceState);
        };

        this.filter = function(type, obj, item) {
            choiceState[obj.stype] = item.index;
            if (obj.stype === 'voice') choiceState.voice_name = filterData.voice[item.index];
            if (obj.stype === 'season') choiceState.season_id = filterData.season_id[item.index];
            component.reset();
            component.loading(true);
            applyFilterAndShow(onFilterApplied);
            component.saveChoice(choiceState);
            setTimeout(component.closeFilter, 10);
        };

        this.destroy = function() {
            request.clear();
            rezkaData = null;
        };

        function extractPage(link) {
            var fullUrl = component.fixLink(link, mirrorSlash);
            request.clear();
            request.timeout(10000);
            request.native(component.proxyLink(fullUrl, proxyHost, proxyExtra, 'enc2t'), function(html) {
                parseMovieHtml(html);
                if (rezkaData.film_id) {
                    applyFilterAndShow(onFilterApplied);
                } else {
                    if (serverErrorMessage) component.empty(serverErrorMessage);
                    else component.emptyForQuery(searchTitle);
                }
            }, function(err, errText) {
                component.empty(formatRezkaError(request, err, errText));
            }, null, { dataType: 'text', withCredentials: withCreds, headers: defaultHeaders });
        }

        function onFilterApplied() {
            component.loading(false);
            buildFilterUI();
            renderPlaylist(buildEpisodesList());
        }

        function parseMovieHtml(html) {
            rezkaData.voice = [];
            rezkaData.season = [];
            rezkaData.episode = [];
            rezkaData.seasons_cache = {};
            rezkaData.is_series = false;
            rezkaData.film_id = '';
            rezkaData.favs = '';
            html = (html || '').replace(/\n/g, '');
            checkPageErrors(html);

            var trMatch = html.match(/<h2>В переводе<\/h2>:<\/td>\s*(<td>.*?<\/td>)/);
            var seriesEvents = html.match(/\.initCDNSeriesEvents\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,/);
            var movieEvents = html.match(/\.initCDNMoviesEvents\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,/);

            var defaultVoice = '';
            if (trMatch) defaultVoice = $(trMatch[1]).text().trim();
            if (!defaultVoice) defaultVoice = 'Оригинал';

            var voiceObj, seasonObj, epObj;
            if (seriesEvents) {
                rezkaData.is_series = true;
                rezkaData.film_id = seriesEvents[1];
                voiceObj = { name: defaultVoice, id: seriesEvents[2] };
                seasonObj = { name: Lampa.Lang.translate('torrent_serial_season') + ' ' + seriesEvents[3], id: seriesEvents[3] };
                epObj = { name: Lampa.Lang.translate('torrent_serial_episode') + ' ' + seriesEvents[4], season_id: seriesEvents[3], episode_id: seriesEvents[4] };
            } else if (movieEvents) {
                rezkaData.film_id = movieEvents[1];
                voiceObj = { name: defaultVoice, id: movieEvents[2], is_camrip: movieEvents[3], is_ads: movieEvents[4], is_director: movieEvents[5] };
            }

            var trList = html.match(/(<ul id="translators-list".*?<\/ul>)/);
            if (trList) {
                var ul = $(trList[1]);
                $('.b-translator__item', ul).each(function() {
                    var title = ($(this).attr('title') || $(this).text() || '').trim();
                    $('img', this).each(function() {
                        var alt = ($(this).attr('title') || $(this).attr('alt') || '').trim();
                        if (alt && title.indexOf(alt) === -1) title += ' (' + alt + ')';
                    });
                    rezkaData.voice.push({
                        name: title,
                        id: $(this).attr('data-translator_id'),
                        is_camrip: $(this).attr('data-camrip'),
                        is_ads: $(this).attr('data-ads'),
                        is_director: $(this).attr('data-director')
                    });
                });
            }
            if (!rezkaData.voice.length && voiceObj) rezkaData.voice.push(voiceObj);

            if (rezkaData.is_series) {
                var sTabs = html.match(/(<ul id="simple-seasons-tabs".*?<\/ul>)/);
                if (sTabs) {
                    $('.b-simple_season__item', $(sTabs[1])).each(function() {
                        rezkaData.season.push({ name: $(this).text(), id: $(this).attr('data-tab_id') });
                    });
                }
                if (!rezkaData.season.length && seasonObj) rezkaData.season.push(seasonObj);

                var eTabs = html.match(/(<div id="simple-episodes-tabs".*?<\/div>)/);
                if (eTabs) {
                    $('.b-simple_episode__item', $(eTabs[1])).each(function() {
                        rezkaData.episode.push({
                            name: $(this).text(),
                            season_id: $(this).attr('data-season_id'),
                            episode_id: $(this).attr('data-episode_id')
                        });
                    });
                }
                if (!rezkaData.episode.length && epObj) rezkaData.episode.push(epObj);
            }

            var favsMatch = html.match(/<input type="hidden" id="ctrl_favs" value="([^"]*)"/);
            if (favsMatch) rezkaData.favs = favsMatch[1];
            var blockMatch = html.match(/class="b-player__restricted__block_message"/);
            if (blockMatch) rezkaData.blocked = true;
        }

        function applyFilterAndShow(callback) {
            if (rezkaData.is_series) {
                syncVoiceIndex();
                if (rezkaData.voice[choiceState.voice]) {
                    var trId = rezkaData.voice[choiceState.voice].id;
                    var cached = rezkaData.seasons_cache[trId];
                    if (cached) {
                        rezkaData.season = cached.season;
                        rezkaData.episode = cached.episode;
                    } else {
                        var epUrl = mirrorSlash + 'ajax/get_cdn_series/?t=' + Date.now();
                        var post = 'id=' + encodeURIComponent(rezkaData.film_id);
                        post += '&translator_id=' + encodeURIComponent(trId);
                        post += '&favs=' + encodeURIComponent(rezkaData.favs);
                        post += '&action=get_episodes';

                        request.clear();
                        request.timeout(10000);
                        request.native(component.proxyLink(epUrl, proxyHost, proxyExtra, 'enc2t'), function(json) {
                            parseEpisodesJson(json, trId);
                            callback();
                        }, function(err, errText) {
                            component.empty(formatRezkaError(request, err, errText));
                        }, post, { withCredentials: withCreds, headers: defaultHeaders });
                        return;
                    }
                }
            }
            callback();
        }

        function parseEpisodesJson(json, translatorId) {
            var data = { season: [], episode: [] };
            if (json && json.seasons) {
                var sUl = $('<ul>' + json.seasons + '</ul>');
                $('.b-simple_season__item', sUl).each(function() {
                    data.season.push({ name: $(this).text(), id: $(this).attr('data-tab_id') });
                });
            }
            if (json && json.episodes) {
                var eDiv = $('<div>' + json.episodes + '</div>');
                $('.b-simple_episode__item', eDiv).each(function() {
                    data.episode.push({
                        name: $(this).text(),
                        translator_id: translatorId,
                        season_id: $(this).attr('data-season_id'),
                        episode_id: $(this).attr('data-episode_id')
                    });
                });
            }
            rezkaData.seasons_cache[translatorId] = data;
            rezkaData.season = data.season;
            rezkaData.episode = data.episode;
        }

        function syncVoiceIndex() {
            var voiceNames = rezkaData.is_series ? rezkaData.voice.map(function(v) { return v.name; }) : [];
            if (!voiceNames[choiceState.voice]) choiceState.voice = 0;
            if (choiceState.voice_name) {
                var idx = voiceNames.indexOf(choiceState.voice_name);
                if (idx === -1) choiceState.voice = 0;
                else if (idx !== choiceState.voice) choiceState.voice = idx;
            }
        }

        function buildFilterUI() {
            filterData = {
                season: rezkaData.season.map(function(s) { return s.name; }),
                season_id: rezkaData.season.map(function(s) { return s.id; }),
                voice: rezkaData.is_series ? rezkaData.voice.map(function(v) { return v.name; }) : []
            };

            if (!filterData.season[choiceState.season]) choiceState.season = 0;
            if (!filterData.voice[choiceState.voice]) choiceState.voice = 0;
            if (choiceState.voice_name) {
                var idxV = filterData.voice.indexOf(choiceState.voice_name);
                if (idxV === -1) choiceState.voice = 0;
                else if (idxV !== choiceState.voice) choiceState.voice = idxV;
            }
            if (choiceState.season_id) {
                var idxS = filterData.season_id.indexOf(choiceState.season_id);
                if (idxS === -1) choiceState.season = 0;
                else if (idxS !== choiceState.season) choiceState.season = idxS;
            }
            component.filter(filterData, choiceState);
        }

        function buildEpisodesList() {
            var list = [];
            if (rezkaData.is_series) {
                var currentSeasonName = filterData.season[choiceState.season];
                var seasonId;
                rezkaData.season.forEach(function(s) {
                    if (s.name === currentSeasonName) seasonId = s.id;
                });
                var voiceName = filterData.voice[choiceState.voice];
                rezkaData.episode.forEach(function(ep) {
                    if (ep.season_id == seasonId) {
                        list.push({
                            title: component.formatEpisodeTitle(ep.season_id, null, ep.name),
                            quality: '360p ~ 1080p',
                            info: ' / ' + voiceName,
                            season: parseInt(ep.season_id),
                            episode: parseInt(ep.episode_id),
                            media: ep
                        });
                    }
                });
            } else {
                rezkaData.voice.forEach(function(v) {
                    list.push({
                        title: v.name || searchTitle,
                        quality: '360p ~ 1080p',
                        info: '',
                        media: v
                    });
                });
            }
            return list;
        }

        function extractStream(target, onSuccess, onError) {
            if (target.stream) return onSuccess(target);

            var streamUrl = mirrorSlash + 'ajax/get_cdn_series/?t=' + Date.now();
            var post = 'id=' + encodeURIComponent(rezkaData.film_id);

            if (rezkaData.is_series) {
                post += '&translator_id=' + encodeURIComponent(target.media.translator_id);
                post += '&season=' + encodeURIComponent(target.media.season_id);
                post += '&episode=' + encodeURIComponent(target.media.episode_id);
                post += '&favs=' + encodeURIComponent(rezkaData.favs);
                post += '&action=get_stream';
            } else {
                post += '&translator_id=' + encodeURIComponent(target.media.id);
                post += '&is_camrip=' + encodeURIComponent(target.media.is_camrip);
                post += '&is_ads=' + encodeURIComponent(target.media.is_ads);
                post += '&is_director=' + encodeURIComponent(target.media.is_director);
                post += '&favs=' + encodeURIComponent(rezkaData.favs);
                post += '&action=get_movie';
            }

            request.clear();
            request.timeout(10000);
            request.native(component.proxyLink(streamUrl, proxyHost, proxyExtra, 'enc2t'), function(json) {
                if (json && json.url) {
                    var decoded = decodeRezkaTrash(json.url);
                    var streamFile = '';
                    var qualitiesMap = {};
                    var parsedQualities = parseStreamQualities(decoded);

                    if (parsedQualities && parsedQualities.length) {
                        streamFile = parsedQualities[0].file;
                        var isPremiumOnly = json.premium_content || false;
                        var lastFile = '';
                        qualitiesMap = {};
                        parsedQualities.forEach(function(q) {
                            if (q.label !== '1080p Ultra') {
                                if (lastFile !== '' && lastFile !== q.file) isPremiumOnly = false;
                                lastFile = q.file;
                            }
                            qualitiesMap[q.label] = q.file;
                        });
                        if (isPremiumOnly) {
                            onError('Перевод доступен только с HDrezka Premium');
                            return;
                        }
                    }

                    if (streamFile) {
                        target.stream = streamFile;
                        target.qualitys = qualitiesMap;
                        target.subtitles = parseSubtitles(json.subtitle, preferHttp);
                        onSuccess(target);
                    } else {
                        onError();
                    }
                } else {
                    onError();
                }
            }, function() {
                onError();
            }, post, { withCredentials: withCreds, headers: defaultHeaders });
        }

        function parseStreamQualities(rawString) {
            if (!rawString) return [];
            try {
                var parsed = parsePlaylist(rawString).map(function(item) {
                    var qNum = NaN;
                    var matchQ = item.label.match(/(\d\d\d+)/);
                    if (matchQ) qNum = parseInt(matchQ[1]);
                    else {
                        var matchK = item.label.match(/(\d+)K/);
                        if (matchK) qNum = parseInt(matchK[1]) * 1000;
                    }
                    var linksList;
                    if (preferMp4) {
                        linksList = item.links.filter(function(l) { return /\.mp4$/i.test(l); });
                    } else {
                        linksList = item.links.filter(function(l) { return /\.m3u8$/i.test(l); });
                    }
                    if (!linksList.length) linksList = item.links;
                    var link = linksList[0] || '';
                    link = fixLinkProtocol(link, preferHttp, 'full');

                    return {
                        label: item.label,
                        quality: qNum,
                        file: proxyStream(link, 'rezka2')
                    };
                });

                return parsed.sort(function(a, b) {
                    if (b.quality > a.quality) return 1;
                    if (b.quality < a.quality) return -1;
                    if (b.label > a.label) return 1;
                    if (b.label < a.label) return -1;
                    return 0;
                });
            } catch (e) {}
            return [];
        }

        function renderPlaylist(itemsList) {
            component.reset();
            var viewedList = Lampa.Storage.cache('online_view', 5000, []);
            var lastEpNum = component.getLastEpisode(itemsList);

            itemsList.forEach(function(item) {
                if (item.season) {
                    item.translate_episode_end = lastEpNum;
                    item.translate_voice = filterData.voice[choiceState.voice];
                }

                var timelineKey = Lampa.Utils.hash(item.season ? [item.season, item.season > 10 ? ':' : '', item.episode, currentMovie.movie.original_title].join('') : currentMovie.movie.original_title);
                var viewTimeline = Lampa.Timeline.view(timelineKey);
                var element = Lampa.Template.get('online_mod', item);
                var viewedHash = Lampa.Utils.hash(item.season ? [item.season, item.season > 10 ? ':' : '', item.episode, currentMovie.movie.original_title, filterData.voice[choiceState.voice]].join('') : currentMovie.movie.original_title + item.title);

                item.timeline = viewTimeline;
                element.append(Lampa.Timeline.render(viewTimeline));
                if (Lampa.Timeline.details) {
                    element.find('.online__quality').append(Lampa.Timeline.details(viewTimeline, ' / '));
                }

                if (viewedList.indexOf(viewedHash) !== -1) {
                    element.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_star', {}, true) + '</div>');
                }

                element.on('hover:enter', function() {
                    if (item.loading) return;
                    if (currentMovie.movie.id) Lampa.Favorite.add('history', currentMovie.movie, 64);
                    item.loading = true;

                    extractStream(item, function(readyItem) {
                        readyItem.loading = false;
                        var playData = {
                            url: component.getDefaultQuality(readyItem.qualitys, readyItem.stream),
                            quality: component.renameQualityMap(readyItem.qualitys),
                            subtitles: readyItem.subtitles,
                            timeline: readyItem.timeline,
                            title: readyItem.season ? readyItem.title : searchTitle + (readyItem.title == searchTitle ? '' : ' / ' + readyItem.title)
                        };

                        Lampa.Player.play(playData);
                        if (readyItem.season && Lampa.Platform.version) {
                            var playlist = [];
                            itemsList.forEach(function(other) {
                                if (other == readyItem) playlist.push(playData);
                                else {
                                    var itemLazy = {
                                        url: function(onUrl) {
                                            extractStream(other, function(res) {
                                                itemLazy.url = component.getDefaultQuality(res.qualitys, res.stream);
                                                itemLazy.quality = component.renameQualityMap(res.qualitys);
                                                itemLazy.subtitles = res.subtitles;
                                                onUrl();
                                            }, function() {
                                                itemLazy.url = '';
                                                onUrl();
                                            });
                                        },
                                        timeline: other.timeline,
                                        title: other.title
                                    };
                                    playlist.push(itemLazy);
                                }
                            });
                            Lampa.Player.playlist(playlist);
                        } else {
                            Lampa.Player.playlist([playData]);
                        }

                        if (viewedList.indexOf(viewedHash) === -1) {
                            viewedList.push(viewedHash);
                            element.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_star', {}, true) + '</div>');
                            Lampa.Storage.set('online_view', viewedList);
                        }
                    }, function(errMsg) {
                        item.loading = false;
                        Lampa.Noty.show(errMsg || Lampa.Lang.translate(rezkaData.blocked ? 'online_mod_blockedlink' : 'online_mod_nolink'));
                    });
                });

                component.append(element);
                component.contextmenu({
                    item: element,
                    view: viewTimeline,
                    viewed: viewedList,
                    hash_file: viewedHash,
                    element: item,
                    file: function(cb) {
                        extractStream(item, function(res) {
                            cb({ file: res.stream, quality: res.qualitys });
                        }, function(err) {
                            Lampa.Noty.show(err || Lampa.Lang.translate(rezkaData.blocked ? 'online_mod_blockedlink' : 'online_mod_nolink'));
                        });
                    }
                });
            });

            component.start(true);
        }
    }

    // Main online_mod container (ONLY HDREZKA)
    function OnlineModComponent(activity) {
        var req = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var explorer = new Lampa.Explorer(activity);
        var filter = new Lampa.Filter(activity);
        var activeBalancer = 'rezka2';
        var lastBalancers = Lampa.Storage.field('online_mod_save_last_balanser') === true ? Lampa.Storage.cache('online_mod_last_balanser', 200, {}) : {};
        var defaultQualityLabel = '';
        var qualityFilterItem = {
            title: Lampa.Lang.translate('settings_player_quality'),
            subtitle: '',
            items: [],
            stype: 'quality'
        };
        var contextItems = [];

        this.proxy = function(type) { return getProxy(type); };
        this.fixLink = function(url, base) { return fixLink(url, base); };
        this.fixLinkProtocol = function(url, preferHttp, defaultProto) { return fixLinkProtocol(url, preferHttp, defaultProto); };
        this.proxyLink = function(url, proxyHost, extraPrefix, encMode) { return proxyLink(url, proxyHost, extraPrefix, encMode); };
        this.proxyStream = function(url, type) { return proxyStream(url, type); };
        this.processSubs = function(url) { return url; };
        this.checkMyIp = function(callback) { checkMyIp(req, callback); };

        var lastFocusedElement;
        var labels = {
            season: Lampa.Lang.translate('torrent_serial_season'),
            voice: Lampa.Lang.translate('torrent_parser_voice'),
            source: Lampa.Lang.translate('online_mod_balanser')
        };

        // Source registration: ONLY HDrezka!
        var sources = [
            {
                name: 'rezka2',
                title: 'HDrezka',
                source: new HDrezkaSource(this, activity),
                search: true,
                kp: false,
                imdb: false
            }
        ];
        var availableSources = sources.map(function(s) { return s.name; });
        var sourceMap = { 'rezka2': sources[0].source };

        scroll.body().addClass('torrent-list');
        scroll.append(explorer.render().find('.explorer__files-head'));

        this.create = function() {
            var self = this;
            this.activity.loader(true);

            filter.onSearch = function(query) {
                Lampa.Activity.replace({
                    search: query,
                    search_date: '',
                    clarification: true
                });
            };
            filter.onBack = function() {
                self.start();
            };
            filter.onSelect = function(type, obj, item) {
                if (type === 'filter') {
                    if (obj.reset) {
                        sourceMap[activeBalancer].reset();
                    } else if (obj.stype === 'quality') {
                        defaultQualityLabel = item.title;
                        self.updateQualityFilter();
                    } else {
                        sourceMap[activeBalancer].filter(type, obj, item);
                    }
                }
            };

            filter.render().find('.filter--sort span').text(Lampa.Lang.translate('online_mod_balanser'));
            explorer.appendHead(filter.render());
            explorer.appendFiles(scroll.render());
            this.search();
            return this.render();
        };

        this.updateQualityFilter = function() {
            var currentQuality = defaultQualityLabel;
            if (!currentQuality) {
                currentQuality = (Lampa.Storage.get('video_quality_default', '1080') + 'p');
                if (currentQuality === '1080p') currentQuality = '1080p Ultra';
            }
            var list = ['2160p', '1440p', '1080p Ultra', '1080p', '720p', '480p'].map(function(val, idx) {
                return {
                    title: val,
                    selected: val === currentQuality,
                    index: idx
                };
            });
            qualityFilterItem.subtitle = currentQuality;
            qualityFilterItem.items = list;
            setTimeout(this.closeFilter, 10);
        };

        this.search = function() {
            this.activity.loader(true);
            this.filter({ source: ['HDrezka'] }, { source: 0 });
            this.reset();
            this.find();
        };

        this.cleanTitle = function(str) { return cleanTitle(str); };
        this.containsAnyTitle = function(a, b) { return containsAnyTitle(a, b); };
        this.equalAnyTitle = function(a, b) { return equalAnyTitle(a, b); };

        this.find = function() {
            this.extendChoice();
            sourceMap['rezka2'].search(activity);
        };

        this.extendChoice = function() {
            var cache = Lampa.Storage.cache('online_mod_choice_rezka2', 500, {});
            var saved = cache[activity.movie.id] || {};
            sourceMap['rezka2'].extendChoice(saved);
        };

        this.saveChoice = function(choice) {
            var cache = Lampa.Storage.cache('online_mod_choice_rezka2', 500, {});
            cache[activity.movie.id] = choice;
            Lampa.Storage.set('online_mod_choice_rezka2', cache);
        };

        this.similars = function(itemsList) {
            var self = this;
            itemsList.forEach(function(item) {
                var title = item.title || item.ru_title || item.nameRu || item.en_title || item.nameEn || item.orig_title || item.nameOriginal;
                var origTitle = item.orig_title || item.nameOriginal || item.en_title || item.nameEn;
                var year = item.start_date || item.year || '';
                var infoArr = [];
                if (origTitle && origTitle !== title) infoArr.push(origTitle);
                if (item.seasons_count) infoArr.push(Lampa.Lang.translate('online_mod_seasons_count') + ': ' + item.seasons_count);
                if (item.episodes_count) infoArr.push(Lampa.Lang.translate('online_mod_episodes_count') + ': ' + item.episodes_count);

                item.title = title;
                item.quality = year ? (year + '').slice(0, 4) : '----';
                item.info = infoArr.length ? ' / ' + infoArr.join(' / ') : '';

                var card = Lampa.Template.get('online_mod_folder', item);
                card.on('hover:enter', function() {
                    self.activity.loader(true);
                    self.reset();
                    activity.search = item.title;
                    activity.search_date = year;
                    self.extendChoice();
                    sourceMap['rezka2'].search(activity, null, [item]);
                });
                self.append(card);
            });
        };

        this.reset = function() {
            contextItems = [];
            lastFocusedElement = filter.render().find('.selector').eq(0)[0];
            scroll.render().find('.empty').remove();
            scroll.clear();
            scroll.reset();
        };

        this.inActivity = function() {
            var body = $('body');
            return !(body.hasClass('settings--open') || body.hasClass('menu--open') || body.hasClass('search--open') || body.hasClass('selectbox--open') || body.hasClass('keyboard-input--visible') || body.hasClass('ambience--enable') || $('div.modal').length);
        };

        this.loading = function(isLoading) {
            if (isLoading) {
                this.activity.loader(true);
            } else {
                this.activity.loader(false);
                if (Lampa.Activity.active().activity === this.activity && this.inActivity()) {
                    this.activity.toggle();
                }
            }
        };

        this.getDefaultQuality = function(qualities, defaultUrl) {
            if (qualities) {
                var currentQuality = defaultQualityLabel;
                if (!currentQuality) {
                    currentQuality = (Lampa.Storage.get('video_quality_default', '1080') + 'p');
                    if (currentQuality === '1080p') currentQuality = '1080p Ultra';
                }
                var order = ['2160p', '2160', '4K', '1440p', '1440', '2K', '1080p Ultra', '1080p', '1080', '720p', '720', '480p', '480', '360p', '360', '240p', '240'];
                var idx = order.indexOf(currentQuality);
                if (idx !== -1) {
                    for (var i = idx; i < order.length; i++) {
                        if (qualities[order[i]]) return qualities[order[i]];
                    }
                    for (var j = idx - 1; j >= 0; j--) {
                        if (qualities[order[j]]) return qualities[order[j]];
                    }
                }
            }
            return defaultUrl;
        };

        this.renameQualityMap = function(qualities) {
            if (!qualities) return qualities;
            var res = {};
            for (var k in qualities) {
                res['\u200B' + k] = qualities[k];
            }
            return res;
        };

        this.formatEpisodeTitle = function(season, episode, name) {
            var fullFormat = Lampa.Storage.field('online_mod_full_episode_title') === true;
            var res = '';
            if (season != null && season !== '') {
                res = (fullFormat ? Lampa.Lang.translate('torrent_serial_season') + ' ' : 'S') + season + ' / ';
            }
            if (name == null || name === '') {
                name = Lampa.Lang.translate('torrent_serial_episode') + ' ' + episode;
            } else if (episode != null && episode !== '') {
                name = Lampa.Lang.translate('torrent_serial_episode') + ' ' + episode + ' - ' + name;
            }
            return res + name;
        };

        this.filter = function(filterObj, choiceObj) {
            var items = [];
            var self = this;

            items.push({
                title: Lampa.Lang.translate('torrent_parser_reset'),
                reset: true
            });

            function addFilterSection(key, titleText) {
                var stored = Lampa.Storage.get('online_mod_filter', '{}');
                var opts = filterObj[key];
                var subItems = [];
                var activeIdx = stored[key];

                opts.forEach(function(val, i) {
                    subItems.push({
                        title: val,
                        selected: activeIdx == i,
                        index: i
                    });
                });

                items.push({
                    title: titleText,
                    subtitle: opts[activeIdx],
                    items: subItems,
                    stype: key
                });
            }

            if (filterObj.voice && filterObj.voice.length) {
                addFilterSection('voice', Lampa.Lang.translate('torrent_parser_voice'));
            }
            if (filterObj.season && filterObj.season.length) {
                addFilterSection('season', Lampa.Lang.translate('torrent_serial_season'));
            }

            this.updateQualityFilter();
            items.push(qualityFilterItem);

            filter.set('filter', items);
            filter.set('sort', [{
                source: 'rezka2',
                title: 'HDrezka',
                selected: true
            }]);

            var subtitlesList = [];
            var currentStored = Lampa.Storage.get('online_mod_filter', '{}');
            for (var k in currentStored) {
                if (k !== 'source' && labels[k] && filterObj[k] && filterObj[k].length > 1) {
                    subtitlesList.push(labels[k] + ': ' + filterObj[k][currentStored[k]]);
                }
            }
            filter.chosen('filter', subtitlesList);
            filter.chosen('sort', ['HDrezka']);
        };

        this.closeFilter = function() {
            if ($('body').hasClass('selectbox--open')) Lampa.Select.close();
        };

        this.append = function(elem) {
            var self = this;
            elem.on('hover:focus', function(e) {
                lastFocusedElement = e.target;
                scroll.update($(e.target), true);
            });
            scroll.append(elem);
        };

        this.contextmenu = function(obj) {
            var self = this;
            contextItems.push(obj);

            obj.item.on('hover:long', function() {
                var menuItems = [
                    { title: Lampa.Lang.translate('torrent_parser_label_title'), mark: true },
                    { title: Lampa.Lang.translate('torrent_parser_label_cancel_title'), clearmark: true },
                    { title: Lampa.Lang.translate('online_mod_clearmark_all'), clearmark_all: true },
                    { title: Lampa.Lang.translate('time_reset'), timeclear: true },
                    { title: Lampa.Lang.translate('online_mod_timeclear_all'), timeclear_all: true }
                ];

                if (Lampa.Platform.is('webos')) {
                    menuItems.push({ title: Lampa.Lang.translate('player_lauch') + ' - Webos', player: 'webos' });
                }
                if (Lampa.Platform.is('android')) {
                    menuItems.push({ title: Lampa.Lang.translate('player_lauch') + ' - Android', player: 'android' });
                }
                menuItems.push({ title: Lampa.Lang.translate('player_lauch') + ' - Lampa', player: 'lampa' });

                if (obj.file) {
                    menuItems.push({ title: Lampa.Lang.translate('copy_link'), copylink: true });
                }

                Lampa.Select.show({
                    title: Lampa.Lang.translate('title_action'),
                    items: menuItems,
                    onBack: function() {
                        Lampa.Controller.toggle('content');
                    },
                    onSelect: function(selected) {
                        if (selected.clearmark) {
                            Lampa.Arrays.remove(obj.viewed, obj.hash_file);
                            Lampa.Storage.set('online_view', obj.viewed);
                            obj.item.find('.torrent-item__viewed').remove();
                        }
                        if (selected.clearmark_all) {
                            contextItems.forEach(function(cItem) {
                                Lampa.Arrays.remove(cItem.viewed, cItem.hash_file);
                                Lampa.Storage.set('online_view', cItem.viewed);
                                cItem.item.find('.torrent-item__viewed').remove();
                            });
                        }
                        if (selected.mark) {
                            if (obj.viewed.indexOf(obj.hash_file) === -1) {
                                obj.viewed.push(obj.hash_file);
                                obj.item.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_star', {}, true) + '</div>');
                                Lampa.Storage.set('online_view', obj.viewed);
                            }
                        }
                        if (selected.timeclear) {
                            obj.view.percent = 0;
                            obj.view.time = 0;
                            obj.view.duration = 0;
                            Lampa.Timeline.update(obj.view);
                        }
                        if (selected.timeclear_all) {
                            contextItems.forEach(function(cItem) {
                                cItem.view.percent = 0;
                                cItem.view.time = 0;
                                cItem.view.duration = 0;
                                Lampa.Timeline.update(cItem.view);
                            });
                        }
                        Lampa.Controller.toggle('content');

                        if (selected.player) {
                            Lampa.Player.runas(selected.player);
                            obj.item.trigger('hover:enter', { runas: selected.player });
                        }
                        if (selected.copylink && obj.file) {
                            obj.file(function(res) {
                                var linkToCopy = (res && res.file) || '';
                                if (linkToCopy) {
                                    Lampa.Utils.copyTextToClipboard(linkToCopy, function() {
                                        Lampa.Noty.show(Lampa.Lang.translate('copy_secuses'));
                                    }, function() {
                                        Lampa.Noty.show(Lampa.Lang.translate('copy_error'));
                                    });
                                }
                            });
                        }
                    }
                });
            });
        };

        this.empty = function(message) {
            var emptyTpl = Lampa.Template.get('list_empty');
            if (message) emptyTpl.find('.empty__descr').text(message);
            scroll.append(emptyTpl);
            this.loading(false);
        };

        this.emptyForQuery = function(q) {
            this.empty(Lampa.Lang.translate('online_mod_query_start') + ' (' + q + ') ' + Lampa.Lang.translate('online_mod_query_end'));
        };

        this.getLastEpisode = function(items) {
            var maxEp = 0;
            items.forEach(function(i) {
                if (typeof i.episode !== 'undefined') maxEp = Math.max(maxEp, parseInt(i.episode));
            });
            return maxEp;
        };

        this.start = function(firstTime) {
            if (Lampa.Activity.active().activity !== this.activity) return;
            if (firstTime) {
                var viewedEls = scroll.render().find('.selector.online').find('.torrent-item__viewed').parent().last();
                if (activity.movie.number_of_seasons && viewedEls.length) {
                    lastFocusedElement = viewedEls.eq(0)[0];
                } else {
                    lastFocusedElement = scroll.render().find('.selector').eq(0)[0];
                }
            }

            Lampa.Background.immediately(Lampa.Utils.cardImgBackground(activity.movie));
            Lampa.Controller.add('content', {
                toggle: function() {
                    Lampa.Controller.collectionSet(scroll.render(), explorer.render());
                    Lampa.Controller.collectionFocus(lastFocusedElement || false, scroll.render());
                },
                up: function() {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function() {
                    Navigator.move('down');
                },
                right: function() {
                    if (Navigator.canmove('right')) Navigator.move('right');
                    else filter.show(Lampa.Lang.translate('title_filter'), 'filter');
                },
                left: function() {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                back: this.back
            });

            if (this.inActivity()) Lampa.Controller.toggle('content');
        };

        this.render = function() {
            return explorer.render();
        };

        this.back = function() {
            Lampa.Activity.backward();
        };

        this.pause = function() {};
        this.stop = function() {};

        this.destroy = function() {
            req.clear();
            explorer.destroy();
            scroll.destroy();
            sources.forEach(function(s) { s.source.destroy(); });
        };
    }

    // Initialize Translations
    function initTranslations() {
        if (!Lampa.Lang) {
            var dict = {};
            Lampa.Lang = {
                add: function(d) { dict = d; },
                translate: function(k) { return dict[k] ? dict[k]['ru'] : k; }
            };
        }

        Lampa.Lang.add({
            online_mod_watch: {
                ru: 'Смотреть онлайн',
                uk: 'Дивитися онлайн',
                be: 'Глядзець анлайн',
                en: 'Watch online',
                zh: '在线观看'
            },
            online_mod_nolink: {
                ru: 'Не удалось извлечь ссылку',
                uk: 'Неможливо отримати посилання',
                be: 'Не ўдалося атрымаць спасылку',
                en: 'Failed to fetch link',
                zh: '获取链接失败'
            },
            online_mod_blockedlink: {
                ru: 'К сожалению, это видео не доступно в вашем регионе',
                uk: 'На жаль, це відео не доступне у вашому регіоні',
                be: 'Нажаль, гэта відэа не даступна ў вашым рэгіёне',
                en: 'Sorry, this video is not available in your region',
                zh: '抱歉，您所在的地区无法观看该视频'
            },
            online_mod_blockedlink_copyright: {
                ru: 'К сожалению, это видео не доступно по запросу правообладателей',
                uk: 'На жаль, це відео не доступне за запитом правовласників',
                be: 'Нажаль, гэта відэа не даступна па запыце праваўладальнікаў',
                en: 'Sorry, this video is not available due to copyright holder request',
                zh: '抱歉，由于版权所有者的要求，该视频无法播放。'
            },
            online_mod_balanser: {
                ru: 'Балансер',
                uk: 'Балансер',
                be: 'Балансер',
                en: 'Balancer',
                zh: '平衡器'
            },
            online_mod_clearmark_all: {
                ru: 'Снять отметку у всех',
                uk: 'Зняти позначку у всіх',
                be: 'Зняць адзнаку ва ўсіх',
                en: 'Uncheck all',
                zh: '取消所有'
            },
            online_mod_timeclear_all: {
                ru: 'Сбросить тайм-код у всех',
                uk: 'Скинути тайм-код у всіх',
                be: 'Скінуць тайм-код ва ўсіх',
                en: 'Reset timecode for all',
                zh: '为所有人重置时间码'
            },
            online_mod_query_start: {
                ru: 'По запросу',
                uk: 'На запит',
                be: 'Па запыце',
                en: 'On request',
                zh: '根据要求'
            },
            online_mod_query_end: {
                ru: 'нет результатов',
                uk: 'немає результатів',
                be: 'няма вынікаў',
                en: 'no results',
                zh: '没有结果'
            },
            online_mod_title: {
                ru: 'Онлайн (Rezka)',
                uk: 'Онлайн (Rezka)',
                be: 'Анлайн (Rezka)',
                en: 'Online (Rezka)',
                zh: '在线 (Rezka)'
            },
            online_mod_title_full: {
                ru: 'HDrezka Mod',
                uk: 'HDrezka Mod',
                be: 'HDrezka Мод',
                en: 'HDrezka Mod',
                zh: 'HDrezka 模块'
            },
            online_mod_use_stream_proxy: {
                ru: 'Проксировать видеопоток (Укр)',
                uk: 'Проксирувати відеопотік (Укр)',
                be: 'Праксіраваць відэаструмень (Укр)',
                en: 'Proxy video stream (Ukr)',
                zh: '代理视频流 （乌克兰）'
            },
            online_mod_proxy_find_ip: {
                ru: 'Передавать свой IP прокси',
                uk: 'Передавати свій IP проксі',
                be: 'Перадаваць свой IP проксі',
                en: 'Send your IP to proxy',
                zh: '将您的 IP 发送给代理'
            },
            online_mod_proxy_other: {
                ru: 'Использовать альтернативный прокси',
                uk: 'Використовувати альтернативний проксі',
                be: 'Выкарыстоўваць альтэрнатыўны проксі',
                en: 'Use an alternative proxy',
                zh: '使用备用代理'
            },
            online_mod_proxy_other_url: {
                ru: 'Альтернативный прокси',
                uk: 'Альтернативний проксі',
                be: 'Альтэрнатыўны проксі',
                en: 'Alternative proxy',
                zh: '备用代理'
            },
            online_mod_prefer_http: {
                ru: 'Предпочитать поток по HTTP',
                uk: 'Віддавати перевагу потіку по HTTP',
                be: 'Аддаваць перавагу патоку па HTTP',
                en: 'Prefer stream over HTTP',
                zh: '优先于 HTTP 流式传输'
            },
            online_mod_prefer_mp4: {
                ru: 'Предпочитать поток MP4',
                uk: 'Віддавати перевагу потіку MP4',
                be: 'Аддаваць перавагу патоку MP4',
                en: 'Prefer MP4 stream',
                zh: '更喜欢 MP4 流'
            },
            online_mod_full_episode_title: {
                ru: 'Полный формат названия серии',
                uk: 'Повний формат назви серії',
                be: 'Поўны фармат назвы серыі',
                en: 'Full episode title format',
                zh: '完整剧集标题格式'
            },
            online_mod_rezka2_mirror: {
                ru: 'Зеркало для HDrezka',
                uk: 'Дзеркало для HDrezka',
                be: 'Люстэрка для HDrezka',
                en: 'Mirror for HDrezka',
                zh: 'HDrezka的镜子'
            },
            online_mod_proxy_rezka2_mirror: {
                ru: 'Проксировать зеркало HDrezka',
                uk: 'Проксирувати дзеркало HDrezka',
                be: 'Праксіраваць люстэрка HDrezka',
                en: 'Proxy HDrezka mirror',
                zh: '代理HDrezka镜子'
            },
            online_mod_proxy_rezka2: {
                ru: 'Проксировать HDrezka',
                uk: 'Проксирувати HDrezka',
                be: 'Праксіраваць HDrezka',
                en: 'Proxy HDrezka',
                zh: '代理HDrezka'
            },
            online_mod_rezka2_name: {
                ru: 'Логин или email для HDrezka',
                uk: 'Логін чи email для HDrezka',
                be: 'Лагін ці email для HDrezka',
                en: 'Login or email for HDrezka',
                zh: 'HDrezka的登录名或电子邮件'
            },
            online_mod_rezka2_password: {
                ru: 'Пароль для HDrezka',
                uk: 'Пароль для HDrezka',
                be: 'Пароль для HDrezka',
                en: 'Password for HDrezka',
                zh: 'HDrezka的密码'
            },
            online_mod_rezka2_login: {
                ru: 'Войти в HDrezka',
                uk: 'Увійти до HDrezka',
                be: 'Увайсці ў HDrezka',
                en: 'Log in to HDrezka',
                zh: '登录HDrezka'
            },
            online_mod_rezka2_logout: {
                ru: 'Выйти из HDrezka',
                uk: 'Вийти з HDrezka',
                be: 'Выйсці з HDrezka',
                en: 'Log out of HDrezka',
                zh: '注销HDrezka'
            },
            online_mod_rezka2_cookie: {
                ru: 'Куки для HDrezka',
                uk: 'Кукі для HDrezka',
                be: 'Кукі для HDrezka',
                en: 'Cookie for HDrezka',
                zh: 'HDrezka 的 Cookie'
            },
            online_mod_rezka2_fill_cookie: {
                ru: 'Заполнить куки для HDrezka (Авто)',
                uk: 'Заповнити кукі для HDrezka (Авто)',
                be: 'Запоўніць кукі для HDrezka (Аўта)',
                en: 'Fill cookie for HDrezka (Auto)',
                zh: '为HDrezka填充Cookie（自动）'
            },
            online_mod_rezka2_fix_stream: {
                ru: 'Фикс видеопотока для HDrezka',
                uk: 'Фікс відеопотоку для HDrezka',
                be: 'Фікс відэаструменю для HDrezka',
                en: 'Fix video stream for HDrezka',
                zh: '修复 HDrezka 的视频流'
            },
            online_mod_rezka2_prx_ukr: {
                ru: 'Прокси-сервер для HDrezka (Укр)',
                uk: 'Проксі-сервер для HDrezka (Укр)',
                be: 'Проксі-сервер для HDrezka (Укр)',
                en: 'Proxy server for HDrezka (Ukr)',
                zh: 'HDrezka 的代理服务器 （乌克兰）'
            },
            online_mod_authorization_required: {
                ru: 'Требуется авторизация',
                uk: 'Потрібна авторизація',
                be: 'Патрабуецца аўтарызацыя',
                en: 'Authorization required',
                zh: '需要授权'
            },
            online_mod_unsupported_mirror: {
                ru: 'Неподдерживаемое зеркало',
                uk: 'Непідтримуване дзеркало',
                be: 'Непадтрымоўванае люстэрка',
                en: 'Unsupported mirror',
                zh: '不支持的镜子'
            },
            online_mod_seasons_count: {
                ru: 'Сезонов',
                uk: 'Сезонів',
                be: 'Сезонаў',
                en: 'Seasons',
                zh: '季'
            },
            online_mod_episodes_count: {
                ru: 'Эпизодов',
                uk: 'Епізодів',
                be: 'Эпізодаў',
                en: 'Episodes',
                zh: '集'
            }
        });
    }

    // Templates
    function initTemplates() {
        Lampa.Template.add('online_mod', '<div class="online selector">\x0a        <div class="online__body">\x0a            <div style="position: absolute;left: 0;top: -0.3em;width: 2.4em;height: 2.4em">\x0a                <svg style="height: 2.4em; width: 2.4em;" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">\x0a                    <circle cx="64" cy="64" r="56" stroke="white" stroke-width="16"/>\x0a                    <path d="M90.5 64.3827L50 87.7654L50 41L90.5 64.3827Z" fill="white"/>\x0a                </svg>\x0a            </div>\x0a            <div class="online__title" style="padding-left: 2.1em;">{title}</div>\x0a            <div class="online__quality" style="padding-left: 3.4em;">{quality}{info}</div>\x0a        </div>\x0a    </div>');

        Lampa.Template.add('online_mod_folder', '<div class="online selector">\x0a        <div class="online__body">\x0a            <div style="position: absolute;left: 0;top: -0.3em;width: 2.4em;height: 2.4em">\x0a                <svg style="height: 2.4em; width: 2.4em;" viewBox="0 0 128 112" fill="none" xmlns="http://www.w3.org/2000/svg">\x0a                    <rect y="20" width="128" height="92" rx="13" fill="white"/>\x0a                    <path d="M29.9963 8H98.0037C96.0446 3.3021 91.4079 0 86 0H42C36.5921 0 31.9555 3.3021 29.9963 8Z" fill="white" fill-opacity="0.23"/>\x0a                    <rect x="11" y="8" width="106" height="76" rx="13" fill="white" fill-opacity="0.51"/>\x0a                </svg>\x0a            </div>\x0a            <div class="online__title" style="padding-left: 2.1em;">{title}</div>\x0a            <div class="online__quality" style="padding-left: 3.4em;">{quality}{info}</div>\x0a        </div>\x0a    </div>');
    }

    // Launch action
    function launchComponent(movie) {
        if (isStarting) return;
        isStarting = true;
        setMyIp('');

        function proceed() {
            isStarting = false;
            initTemplates();
            Lampa.Component.add('online_mod', OnlineModComponent);
            Lampa.Activity.push({
                url: '',
                title: Lampa.Lang.translate('online_mod_title'),
                component: 'online_mod',
                search: movie.title,
                search_one: movie.title,
                search_two: movie.original_title,
                movie: movie,
                page: 1
            });
        }

        if (Lampa.Storage.field('online_mod_proxy_find_ip') === true) {
            checkMyIp(requestInstance, proceed);
        } else {
            proceed();
        }
    }

    // Settings registration (ONLY HDrezka)
    function initSettings() {
        var html = '<div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_proxy_rezka2" data-type="toggle">\x0a' +
            '       <div class="settings-param__name">#{online_mod_proxy_rezka2}</div>\x0a' +
            '       <div class="settings-param__value"></div>\x0a' +
            '   </div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_proxy_rezka2_mirror" data-type="toggle">\x0a' +
            '       <div class="settings-param__name">#{online_mod_proxy_rezka2_mirror}</div>\x0a' +
            '       <div class="settings-param__value"></div>\x0a' +
            '   </div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_rezka2_mirror" data-type="input" placeholder="#{settings_cub_not_specified}">\x0a' +
            '       <div class="settings-param__name">#{online_mod_rezka2_mirror}</div>\x0a' +
            '       <div class="settings-param__value"></div>\x0a' +
            '   </div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_rezka2_name" data-type="input" placeholder="#{settings_cub_not_specified}">\x0a' +
            '       <div class="settings-param__name">#{online_mod_rezka2_name}</div>\x0a' +
            '       <div class="settings-param__value"></div>\x0a' +
            '   </div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_rezka2_password" data-type="input" data-string="true" placeholder="#{settings_cub_not_specified}">\x0a' +
            '       <div class="settings-param__name">#{online_mod_rezka2_password}</div>\x0a' +
            '       <div class="settings-param__value"></div>\x0a' +
            '   </div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_rezka2_login" data-static="true">\x0a' +
            '       <div class="settings-param__name">#{online_mod_rezka2_login}</div>\x0a' +
            '       <div class="settings-param__status"></div>\x0a' +
            '   </div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_rezka2_logout" data-static="true">\x0a' +
            '       <div class="settings-param__name">#{online_mod_rezka2_logout}</div>\x0a' +
            '       <div class="settings-param__status"></div>\x0a' +
            '   </div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_rezka2_cookie" data-type="input" data-string="true" placeholder="#{settings_cub_not_specified}">\x0a' +
            '       <div class="settings-param__name">#{online_mod_rezka2_cookie}</div>\x0a' +
            '       <div class="settings-param__value"></div>\x0a' +
            '   </div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_rezka2_fill_cookie" data-static="true">\x0a' +
            '       <div class="settings-param__name">#{online_mod_rezka2_fill_cookie}</div>\x0a' +
            '       <div class="settings-param__status"></div>\x0a' +
            '   </div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_rezka2_fix_stream" data-type="toggle">\x0a' +
            '       <div class="settings-param__name">#{online_mod_rezka2_fix_stream}</div>\x0a' +
            '       <div class="settings-param__value"></div>\x0a' +
            '   </div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_rezka2_prx_ukr" data-type="select">\x0a' +
            '       <div class="settings-param__name">#{online_mod_rezka2_prx_ukr}</div>\x0a' +
            '       <div class="settings-param__value"></div>\x0a' +
            '   </div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_use_stream_proxy" data-type="toggle">\x0a' +
            '       <div class="settings-param__name">#{online_mod_use_stream_proxy}</div>\x0a' +
            '       <div class="settings-param__value"></div>\x0a' +
            '   </div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_prefer_http" data-type="toggle">\x0a' +
            '       <div class="settings-param__name">#{online_mod_prefer_http}</div>\x0a' +
            '       <div class="settings-param__value"></div>\x0a' +
            '   </div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_prefer_mp4" data-type="toggle">\x0a' +
            '       <div class="settings-param__name">#{online_mod_prefer_mp4}</div>\x0a' +
            '       <div class="settings-param__value"></div>\x0a' +
            '   </div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_full_episode_title" data-type="toggle">\x0a' +
            '       <div class="settings-param__name">#{online_mod_full_episode_title}</div>\x0a' +
            '       <div class="settings-param__value"></div>\x0a' +
            '   </div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_proxy_find_ip" data-type="toggle">\x0a' +
            '       <div class="settings-param__name">#{online_mod_proxy_find_ip}</div>\x0a' +
            '       <div class="settings-param__value"></div>\x0a' +
            '   </div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_proxy_other" data-type="toggle">\x0a' +
            '       <div class="settings-param__name">#{online_mod_proxy_other}</div>\x0a' +
            '       <div class="settings-param__value"></div>\x0a' +
            '   </div>\x0a' +
            '   <div class="settings-param selector" data-name="online_mod_proxy_other_url" data-type="input" placeholder="#{settings_cub_not_specified}">\x0a' +
            '       <div class="settings-param__name">#{online_mod_proxy_other_url}</div>\x0a' +
            '       <div class="settings-param__value"></div>\x0a' +
            '   </div>\x0a' +
            '</div>';

        Lampa.Template.add('settings_online_mod', html);

        function appendFolder() {
            if (Lampa.Settings.main && Lampa.Settings.main() && !Lampa.Settings.main().render().find('[data-component="online_mod"]').length) {
                var folder = $(Lampa.Lang.translate('<div class="settings-folder selector" data-component="online_mod">\x0a' +
                    '   <div class="settings-folder__icon">\x0a' +
                    '       <svg height="260" viewBox="0 0 244 260" fill="none" xmlns="http://www.w3.org/2000/svg">\x0a' +
                    '           <path d="M242,88v170H10V88h41l-38,38h37.1l38-38h38.4l-38,38h38.4l38-38h38.3l-38,38H204L242,88L242,88z M228.9,2l8,37.7l0,0 L191.2,10L228.9,2z M160.6,56l-45.8-29.7l38-8.1l45.8,29.7L160.6,56z M84.5,72.1L38.8,42.4l38-8.1l45.8,29.7L84.5,72.1z M10,88 L2,50.2L47.8,80L10,88z" fill="white"/>\x0a' +
                    '       </svg>\x0a' +
                    '   </div>\x0a' +
                    '   <div class="settings-folder__name">#{online_mod_title_full}</div>\x0a' +
                    '</div>'));
                Lampa.Settings.main().render().find('[data-component="more"]').after(folder);
                Lampa.Settings.main().update();
            }
        }

        if (window.appready) appendFolder();
        else Lampa.Listener.follow('app', function(e) { if (e.type === 'ready') appendFolder(); });

        Lampa.Settings.listener.follow('open', function(e) {
            if (e.name === 'online_mod') {
                var loginBtn = e.body.find('[data-name="online_mod_rezka2_login"]');
                var logoutBtn = e.body.find('[data-name="online_mod_rezka2_logout"]');
                var fillCookieBtn = e.body.find('[data-name="online_mod_rezka2_fill_cookie"]');
                var cookieField = e.body.find('[data-name="online_mod_rezka2_cookie"]');

                // If cookie is already present, mark login status active (green)
                var currentCookie = (Lampa.Storage.get('online_mod_rezka2_cookie', '') + '').trim();
                if (currentCookie) {
                    $('.settings-param__status', loginBtn).removeClass('error wait').addClass('active');
                    Lampa.Storage.set('online_mod_rezka2_status', 'true');
                }

                // Rezka Login
                loginBtn.unbind('hover:enter').on('hover:enter', function() {
                    var statusEl = $('.settings-param__status', loginBtn).removeClass('active error wait').addClass('wait');
                    rezkaLogin(function() {
                        statusEl.removeClass('active error wait').addClass('active');
                    }, function() {
                        statusEl.removeClass('active error wait').addClass('error');
                    });
                });

                // Rezka Logout
                logoutBtn.unbind('hover:enter').on('hover:enter', function() {
                    var statusEl = $('.settings-param__status', logoutBtn).removeClass('active error wait').addClass('wait');
                    rezkaLogout(function() {
                        statusEl.removeClass('active error wait').addClass('active');
                        $('.settings-param__status', loginBtn).removeClass('active wait').addClass('error');
                    }, function() {
                        statusEl.removeClass('active error wait').addClass('error');
                    });
                });

                // Rezka Fill Cookie (AUTOFILL)
                fillCookieBtn.unbind('hover:enter').on('hover:enter', function() {
                    var statusEl = $('.settings-param__status', fillCookieBtn).removeClass('active error wait').addClass('wait');
                    rezkaFillCookie(function() {
                        statusEl.removeClass('active error wait').addClass('active');
                        $('.settings-param__status', loginBtn).removeClass('error wait').addClass('active');
                        Lampa.Params.update(e.body.find('[data-name="online_mod_rezka2_cookie"]'), [], e.body);
                    }, function() {
                        statusEl.removeClass('active error wait').addClass('error');
                        Lampa.Params.update(e.body.find('[data-name="online_mod_rezka2_cookie"]'), [], e.body);
                    });
                });
            }
        });
    }

    // Default parameters initialization
    function initParams() {
        Lampa.Params.trigger('online_mod_proxy_rezka2', false);
        Lampa.Params.trigger('online_mod_proxy_rezka2_mirror', false);
        Lampa.Params.trigger('online_mod_use_stream_proxy', false);
        Lampa.Params.trigger('online_mod_rezka2_fix_stream', false);
        Lampa.Params.trigger('online_mod_proxy_find_ip', false);
        Lampa.Params.trigger('online_mod_proxy_other', false);
        Lampa.Params.trigger('online_mod_prefer_http', window.location.protocol !== 'https:');
        Lampa.Params.trigger('online_mod_prefer_mp4', true);
        Lampa.Params.trigger('online_mod_full_episode_title', false);

        Lampa.Params.select('online_mod_rezka2_mirror', '', '');
        Lampa.Params.select('online_mod_rezka2_name', '', '');
        Lampa.Params.select('online_mod_rezka2_password', '', '');
        Lampa.Params.select('online_mod_rezka2_cookie', '', '');
        Lampa.Params.select('online_mod_proxy_other_url', '', '');
        Lampa.Params.select('online_mod_rezka2_prx_ukr', {
            'prx.ukrtelcdn.net': 'Основной',
            'prx-cogent.ukrtelcdn.net': 'Резервный 1',
            'prx2-cogent.ukrtelcdn.net': 'Резервный 2',
            'prx3-cogent.ukrtelcdn.net': 'prx3-cogent.ukrtelcdn.net',
            'prx4-cogent.ukrtelcdn.net': 'prx4-cogent.ukrtelcdn.net',
            'prx-ams.ukrtelcdn.net': 'prx-ams.ukrtelcdn.net',
            'prx2-ams.ukrtelcdn.net': 'prx2-ams.ukrtelcdn.net'
        }, 'prx.ukrtelcdn.net');
    }

    // Card hook: adds "Онлайн" button to movie/tv card
    function initCardHook() {
        Lampa.Component.add('online_mod', OnlineModComponent);
        initTemplates();

        var cardBtnHtml = '<div class="full-start__button selector view--online_mod" data-subtitle="online_mod ' + pluginVersion + '">\x0a' +
            '   <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 244 260">\x0a' +
            '       <path d="M242,88v170H10V88h41l-38,38h37.1l38-38h38.4l-38,38h38.4l38-38h38.3l-38,38H204L242,88L242,88z M228.9,2l8,37.7l0,0 L191.2,10L228.9,2z M160.6,56l-45.8-29.7l38-8.1l45.8,29.7L160.6,56z M84.5,72.1L38.8,42.4l38-8.1l45.8,29.7L84.5,72.1z M10,88 L2,50.2L47.8,80L10,88z" fill="currentColor"/>\x0a' +
            '   </svg>\x0a' +
            '   <span>#{online_mod_title}</span>\x0a' +
            '</div>';

        Lampa.Listener.follow('full', function(e) {
            if (e.type === 'complite') {
                var btn = $(Lampa.Lang.translate(cardBtnHtml));
                btn.on('hover:enter', function() {
                    launchComponent(e.data.movie);
                });
                e.object.activity.render().find('.view--torrent').after(btn);
            }
        });
    }

    // Main entry point
    function startPlugin() {
        initTranslations();
        initParams();
        initCardHook();
        initSettings();
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') startPlugin();
        });
    }
})();
