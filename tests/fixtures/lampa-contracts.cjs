// Verbatim excerpts from yumata/lampa-source @ 71733ed81f4b13ac1ed1b3328cbbaa7e01afdbd2.
// src/utils/reguest.js: native/clear; src/interaction/player.js: Playlist select listener.
// Wrapper parameters supply dependencies; only trailing whitespace is normalized.
exports.NativeRequest = function (native, Arrays, listener) {
    var _calls = [];
    this.native = function(url, complite, error, post_data, params){
        var add_params = {};

        if(params){
            add_params = params;
        }

        var reguest = {
            url: url,
            complite: complite,
            error: error
        }

        _calls.push(reguest)

        var data = {
            url: url,

            post_data: post_data,

            complite: function(data){
                if(_calls.indexOf(reguest) !== -1 && reguest.complite) reguest.complite(data);
            },
            error: function(data){
                if(_calls.indexOf(reguest) !== -1 && reguest.error) reguest.error(data);
            },

            end: function(){
                listener.send('end')
            }
        }

        Arrays.extend(data, add_params, true);

        native(data)
    }

    /**
     * Очистить все запросы
     */
    this.clear = function(){
        _calls = [];
    }


};
exports.installPlaylist = function (Playlist, Video, Info, document, destroyPlayer, play) {
    let wait_for_loading_url = false;
    function destroy(keepPip) { wait_for_loading_url = false; destroyPlayer(keepPip); }
    Playlist.listener.follow('select',(e)=>{
        let type = typeof e.item.url
        let call = ()=>{
            let params = Video.saveParams()
            let keepPip = document.pictureInPictureElement === Video.video() && typeof e.item.url == 'string' && !Video.verifyTube(e.item.url)

            // Нужно текущий плейлист сохранить, чтобы после destroy в плеере остался правильный плейлист
            let playlist = Playlist.get()

            if(keepPip) Video.pause()

            destroy(keepPip)

            // Помечаем как продолжение воспроизведения
            e.item.continue_play = true

            play(e.item)

            Video.setParams(params)

            Playlist.set(playlist)

            if(e.item.callback) e.item.callback()
        }

        if(type == 'string') call()
        else if(type == 'function' && !wait_for_loading_url){
            Info.loading()

            wait_for_loading_url = true

            e.item.url(call)
        }
    })

    return () => wait_for_loading_url;
};
