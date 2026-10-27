(function () {
    'use strict';

    var tmdb = {
        name: 'TMDB My Proxy',
        version: '1.0.1',
        description: 'Проксирование постеров и API сайта TMDB',
        path_image: 'tmdb-img.rootu.top/',
        path_api: 'tmdb-api.rootu.top/3/'
    };

    Lampa.TMDB.image = function (url) {
        var base = Lampa.Utils.protocol() + 'image.tmdb.org/' + url;
        return 'http://' + (Lampa.Storage.field('proxy_tmdb') ? tmdb.path_image + url : base).replace(/\/\//g, '/');
    };

    Lampa.TMDB.api = function (url) {
        var base = Lampa.Utils.protocol() + 'api.themoviedb.org/3/' + url;
        return 'http://' + (Lampa.Storage.field('proxy_tmdb') ? tmdb.path_api + url : base).replace(/\/\//g, '/');
    };

    Lampa.Settings.listener.follow('open', function (e) {
        if (e.name == 'tmdb') {
            e.body.find('[data-parent="proxy"]').remove();
        }
    });

})();
