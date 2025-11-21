// @lampa-desc: Cardify — стартовая карточка в TV-режиме: большая обложка (исправленная версия)
(function () {
    'use strict';

    function init() {
        // Проверка на TV режим. Если нужно и на мобильных, уберите эту проверку.
        if (!Lampa.Platform.get('tv')) {
            console.log('[Cardify] skip: not TV');
            return;
        }

        /* ========= 1) CSS ========= */
        // Добавляем стили. Обратите внимание: мы используем .full-start, так как перезаписываем стандартный шаблон.
        Lampa.Template.add('cardify_css', `
        <style>
        .full-start.cardify{position:relative; width: 100%;}
        .cardify .full-start__body{height:80vh; display: flex;}
        .cardify .full-start__right{display:flex; align-items:flex-end; width: 100%; padding-left: 2em;}
        .cardify__left{flex-grow:1; display: flex; flex-direction: column; justify-content: center;}
        .cardify__right{display:flex; align-items:center; flex-shrink:0; margin-left: 2em;}
        .cardify__details{display:flex; margin-bottom: 1em;}
        
        /* Реакции и рейтинги */
        .cardify .full-start__reactions{margin:0; margin-right:-2.8em; position: relative;}
        .cardify .full-start__reactions:not(.focus){margin:0}
        .cardify .full-start__reactions:not(.focus) > div:not(:first-child){display:none}
        .cardify .full-start__rate-line{display: flex; gap: 1em; margin-left: 1em;}
        
        /* Обложка (Backdrop) внутри карточки */
        .full-start.cardify .cardify__background{
            position:absolute; top:0; left:0; right:0; height:55vh;
            z-index:0; pointer-events:none;
            background-position:center top; background-repeat:no-repeat; background-size:cover;
            border-radius: 0 0 1em 1em;
        }
        .full-start.cardify .cardify__background::after{
            content:""; position:absolute; inset:0; pointer-events:none;
            background:
                linear-gradient(to bottom, rgba(0,0,0,.4), rgba(0,0,0,0) 60%, #000 100%),
                linear-gradient(to top,    rgba(0,0,0,.8), rgba(0,0,0,0) 50%);
        }
        
        /* Контент поверх фона */
        .full-start.cardify .full-start__body,
        .full-start.cardify .full-start__title,
        .full-start.cardify .full-start__buttons,
        .full-start.cardify .cardify__right { position:relative; z-index:2; }

        .full-start__title { font-size: 3.5em; font-weight: bold; margin-bottom: 0.3em; line-height: 1.1; }
        
        /* Скрываем стандартный постер слева, так как у нас Cardify стиль */
        .full-start.cardify .full-start__img { display: none !important; }
        .full-start.cardify .full-start__poster { display: none !important; }
        
        /* Корректировка кнопок */
        .full-start__buttons { margin-top: 1.5em; }
        </style>
        `);
        
        $('body').append(Lampa.Template.render('cardify_css', {}, true));

        /* ========= 2) Шаблон (Перезаписываем full_start) ========= */
        // Мы используем стандартное имя 'full_start', чтобы Lampa подхватила его автоматически.
        // Структура сохранена из вашего файла, но классы приведены к стандарту BEM Lampa (full-start).
        Lampa.Template.add('full_start', `
        <div class="full-start cardify">
            <div class="cardify__background"></div>
            <div class="full-start__body">
                <!-- Левая часть с контентом -->
                <div class="cardify__left">
                    <div class="full-start__head"></div>
                    <div class="full-start__title">{title}</div>
                    <div class="cardify__details"><div class="full-start__details"></div></div>
                    
                    <div class="full-start__buttons">
                        <div class="full-start__button selector button--play">
                            <svg width="28" height="29" viewBox="0 0 28 29" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="14.5" r="13" stroke="currentColor" stroke-width="2.7"/><path d="M18.0739 13.634C18.7406 14.0189 18.7406 14.9811 18.0739 15.366L11.751 19.0166C11.0843 19.4015 10.251 18.9204 10.251 18.1506L10.251 10.8494C10.251 10.0796 11.0843 9.5985 11.751 9.9834L18.0739 13.634Z" fill="currentColor"/></svg>
                            <span>#{title_watch}</span>
                        </div>
                        <div class="full-start__button selector button--book">
                            <svg width="21" height="32" viewBox="0 0 21 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 1.5H19C19.2761 1.5 19.5 1.72386 19.5 2V27.9618C19.5 28.3756 19.0261 28.6103 18.697 28.3595L12.6212 23.7303C11.3682 22.7757 9.63183 22.7757 8.37885 23.7303L2.30302 28.3595C1.9739 28.6103 1.5 28.3756 1.5 27.9618V2C1.5 1.72386 1.72386 1.5 2 1.5Z" stroke="currentColor" stroke-width="2.5"/></svg>
                            <span>#{settings_input_links}</span>
                        </div>
                        <div class="full-start__button selector button--reaction">
                            <svg width="38" height="34" viewBox="0 0 38 34" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M37.208 10.9742C37.1364 10.8013 37.0314 10.6441 36.899 10.5117C36.7666 10.3794 36.6095 10.2744 36.4365 10.2028L12.0658 0.108375C11.7166 -0.0361828 11.3242 -0.0361227 10.9749 0.108542C10.6257 0.253206 10.3482 0.530634 10.2034 0.879836L0.108666 25.2507C0.0369593 25.4236 3.37953e-05 25.609 2.3187e-08 25.7962C-3.37489e-05 25.9834 0.0368249 26.1688 0.108469 26.3418C0.180114 26.5147 0.28514 26.6719 0.417545 26.8042C0.54995 26.9366 0.707139 27.0416 0.880127 27.1131L17.2452 33.8917C17.5945 34.0361 17.9869 34.0361 18.3362 33.8917L29.6574 29.2017C29.8304 29.1301 29.9875 29.0251 30.1199 28.8928C30.2523 28.7604 30.3573 28.6032 30.4289 28.4303L37.2078 12.065C37.2795 11.8921 37.3164 11.7068 37.3164 11.5196C37.3165 11.3325 37.2796 11.1471 37.208 10.9742ZM20.425 29.9407L21.8784 26.4316L25.3873 27.885L20.425 29.9407ZM28.3407 26.0222L21.6524 23.252C21.3031 23.1075 20.9107 23.1076 20.5615 23.2523C20.2123 23.3969 19.9348 23.6743 19.79 24.0235L17.0194 30.7123L3.28783 25.0247L12.2918 3.28773L34.0286 12.2912L28.3407 26.0222Z" fill="currentColor"/></svg>
                            <span>#{title_reactions}</span>
                        </div>
                    </div>
                </div>

                <!-- Правая часть (Реакции, рейтинги) -->
                <div class="cardify__right">
                    <div class="full-start__reactions selector"><div>#{reactions_none}</div></div>
                    <div class="full-start__rate-line">
                        <div class="full-start__rate rate--tmdb"><div>{rating}</div><div class="source--name">TMDB</div></div>
                        <div class="full-start__rate rate--imdb hide"><div></div><div>IMDB</div></div>
                        <div class="full-start__rate rate--kp hide"><div></div><div>KP</div></div>
                    </div>
                </div>
            </div>
            
            <!-- Контейнер для дополнительных кнопок (трейлеры и т.д.), скрыт но нужен для JS логики -->
            <div class="hide buttons--container"></div>
        </div>
        `);

        /* ========= 3) Логика заполнения ========= */
        // Слушаем событие создания полной карточки
        Lampa.Listener.follow('full', function (e) {
            // Событие 'complite' (историческая опечатка в Lampa) означает, что карточка отрендерилась
            if (e.type === 'complite') {
                // Получаем данные о фильме из объекта активности
                var activity = e.object.activity;
                
                // Определяем картинку (фанарт или постер, если фанарта нет)
                var image_path = activity.background_image || activity.img;
                
                if (image_path) {
                    // Превращаем путь в полный URL используя Lampa API
                    var src = Lampa.Utils.img(image_path); 
                    
                    // Ищем наш div фона внутри отрендеренного элемента и ставим стиль
                    // e.object.render() возвращает jQuery объект всей страницы 'full'
                    e.object.render().find('.cardify__background').css('background-image', 'url("' + src + '")');
                }
            }
        });
    }

    if (window.app) init();
    else Lampa.activity.follow('appready', function (e) {
        if (e.type === 'ready') init();
    });
})();
