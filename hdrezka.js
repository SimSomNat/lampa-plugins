// @lampa-desc: Rezka Only Wrapper - отключает все источники кроме HDRezka
(function () {
    'use strict';

    console.log('[Rezka Only Wrapper] Initializing...');

    // Перехватываем регистрацию компонентов
    const originalComponentAdd = Lampa.Component.add;
    Lampa.Component.add = function (name, component) {
        // Регистрируем только rezka2 (HDRezka)
        if (name === 'rezka2' || name === 'online_mod') {
            originalComponentAdd.call(this, name, component);
            console.log('[Rezka Only Wrapper] Registered component:', name);
        } else {
            console.log('[Rezka Only Wrapper] Blocked component:', name);
        }
    };

    // Перехватываем регистрацию плагинов
    const originalPluginsPush = Lampa.Manifest.plugins.push;
    Lampa.Manifest.plugins.push = function (plugin) {
        // Оставляем только HDRezka
        if (plugin.component === 'rezka2' || 
            plugin.name === 'HDRezka' || 
            plugin.name === 'Онлайн MOD') {
            originalPluginsPush.call(this, plugin);
            console.log('[Rezka Only Wrapper] Registered plugin:', plugin.name);
        } else {
            console.log('[Rezka Only Wrapper] Blocked plugin:', plugin.name);
        }
    };

    // После загрузки оригинального плагина, скрываем лишние настройки
    Lampa.Settings.listener.follow('open', function (e) {
        if (e.name === 'online_mod' || e.name === 'more') {
            setTimeout(function () {
                // Скрываем настройки всех источников кроме HDRezka
                const sourcesToHide = [
                    'filmix', 'kodik', 'collaps', 'alloha', 'lumex',
                    'fanserials', 'kinobase', 'redheadsound', 'videoseed',
                    'vibix', 'anilibria', 'animelib', 'zetflix', 'cdnmovies', 'videodb'
                ];

                sourcesToHide.forEach(function (source) {
                    const elements = e.body.find('[data-name*="' + source + '"]');
                    elements.closest('.settings-param').hide();
                    elements.closest('.settings-folder').hide();
                });

                // Оставляем только настройки rezka2
                console.log('[Rezka Only Wrapper] Settings filtered');
            }, 100);
        }
    });

    console.log('[Rezka Only Wrapper] Wrapper loaded successfully');

})();
