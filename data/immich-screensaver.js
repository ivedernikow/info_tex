```javascript
(function () {
    'use strict';

    if (window.immichScreensaverLoaded) return;
    window.immichScreensaverLoaded = true;

    var PREFIX = 'immich_ss_';
    var DEFAULTS = {
        url: 'http://192.168.1.52:2283',
        key: '',
        auto: true,
        delay: 180,
        interval: 5,
        zoom: 5
    };

    var active = false;
    var timer = null;
    var idleTimer = null;
    var overlay = null;
    var image = null;
    var currentObjectUrl = null;
    var queue = [];
    var loading = false;
    var seen = {};

    function get(name) {
        try {
            var value = Lampa.Storage.get(PREFIX + name);
            return value == null ? DEFAULTS[name] : value;
        } catch (e) {
            return DEFAULTS[name];
        }
    }

    function setting(name, value) {
        try {
            Lampa.Storage.set(PREFIX + name, value);
        } catch (e) {}
    }

    function baseUrl() {
        return String(get('url') || '').trim().replace(/\/+$/, '');
    }

    function apiKey() {
        return String(get('key') || '').trim();
    }

    function message(text) {
        try {
            Lampa.Noty.show(text);
        } catch (e) {
            console.log('[Immich Screensaver]', text);
        }
    }

    function playing() {
        var video = document.querySelector('video');
        if (video && !video.paused && !video.ended) return true;

        var selectors = [
            '.player-video',
            '.player__body',
            '.player-panel',
            '.player-layer'
        ];

        return selectors.some(function (selector) {
            var el = document.querySelector(selector);
            return !!(el && el.offsetWidth && el.offsetHeight);
        });
    }

    function request(url, options) {
        return fetch(url, options).then(function (response) {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            return response;
        });
    }

    function randomPhotos() {
        if (!baseUrl()) {
            return Promise.reject(new Error('Укажите адрес Immich'));
        }

        if (!apiKey()) {
            return Promise.reject(new Error('Укажите API-ключ Immich'));
        }

        return request(baseUrl() + '/api/search/random', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                size: 12,
                type: 'IMAGE'
            })
        }).then(function (response) {
            return response.json();
        }).then(function (assets) {
            if (!Array.isArray(assets)) {
                throw new Error('Неожиданный ответ Immich');
            }

            return assets.filter(function (asset) {
                return asset.id && (!asset.type || asset.type === 'IMAGE');
            });
        });
    }

    function loadPhoto(asset) {
        var url = baseUrl() + '/api/assets/' +
            encodeURIComponent(asset.id) + '/thumbnail?size=preview';

        return request(url, {
            headers: { 'x-api-key': apiKey() }
        }).then(function (response) {
            return response.blob();
        }).then(function (blob) {
            if (!blob.type || blob.type.indexOf('image/') !== 0) {
                throw new Error('Immich вернул не изображение');
            }

            return {
                url: URL.createObjectURL(blob),
                name: asset.originalFileName || ''
            };
        });
    }

    function fillQueue() {
        if (loading) return Promise.resolve();
        loading = true;

        return randomPhotos().then(function (assets) {
            var fresh = assets.filter(function (asset) {
                return !seen[asset.id];
            });

            if (!fresh.length) {
                seen = {};
                fresh = assets;
            }

            fresh.forEach(function (asset) {
                seen[asset.id] = true;
            });

            return Promise.all(fresh.slice(0, 5).map(function (asset) {
                return loadPhoto(asset).catch(function (error) {
                    console.warn('[Immich Screensaver]', error);
                    return null;
                });
            }));
        }).then(function (photos) {
            photos.forEach(function (photo) {
                if (photo) queue.push(photo);
            });

            if (!queue.length) {
                throw new Error('Не удалось загрузить фотографии');
            }
        }).finally(function () {
            loading = false;
        });
    }

    function styles() {
        if (document.getElementById('immich-ss-css')) return;

        var style = document.createElement('style');
        style.id = 'immich-ss-css';
        style.textContent =
            '#immich-ss{position:fixed;inset:0;background:#000;' +
            'z-index:2147483647;overflow:hidden;opacity:0;' +
            'transition:opacity .5s ease;cursor:none}' +
            '#immich-ss.visible{opacity:1}' +
            '#immich-ss img{position:absolute;width:100%;height:100%;' +
            'object-fit:contain;opacity:0;transition:opacity .8s ease;' +
            'transform:scale(1)}' +
            '#immich-ss img.visible{opacity:1}' +
            '#immich-ss img.zoom{animation:immich-zoom var(--ss-time,5s) ' +
            'linear forwards}' +
            '@keyframes immich-zoom{from{transform:scale(1)}' +
            'to{transform:scale(var(--ss-zoom,1.05))}}' +
            '#immich-ss-name{position:absolute;bottom:25px;left:30px;' +
            'color:white;font:20px sans-serif;text-shadow:0 2px 5px black}';

        document.head.appendChild(style);
    }

    function display(photo) {
        if (!active || !image) return;

        var oldUrl = currentObjectUrl;
        currentObjectUrl = photo.url;

        image.className = '';
        image.src = photo.url;

        image.onload = function () {
            if (!active) return;

            image.className = 'visible zoom';

            var name = document.getElementById('immich-ss-name');
            if (name) name.textContent = photo.name;

            if (oldUrl && oldUrl !== currentObjectUrl) {
                URL.revokeObjectURL(oldUrl);
            }
        };
    }

    function nextPhoto() {
        if (!active) return;

        if (!queue.length) {
            fillQueue().then(function () {
                if (active) nextPhoto();
            }).catch(function (error) {
                message('Immich Screensaver: ' + error.message);
                stop();
            });
            return;
        }

        display(queue.shift());

        if (queue.length < 3 && !loading) {
            fillQueue().catch(function (error) {
                console.warn('[Immich Screensaver]', error);
            });
        }

        var seconds = parseInt(get('interval'), 10);
        if (!seconds || seconds < 2) seconds = 5;

        timer = setTimeout(nextPhoto, seconds * 1000);
    }

    function start() {
        if (active) return;

        if (playing()) {
            message('Скринсейвер недоступен во время просмотра видео');
            return;
        }

        if (!baseUrl() || !apiKey()) {
            message('Укажите адрес Immich и API-ключ в настройках Lampa');
            return;
        }

        clearTimeout(idleTimer);
        active = true;
        queue = [];
        seen = {};

        styles();

        overlay = document.createElement('div');
        overlay.id = 'immich-ss';
        overlay.innerHTML =
            '<img alt="Immich photo"><div id="immich-ss-name"></div>';

        document.body.appendChild(overlay);
        image = overlay.querySelector('img');

        var zoom = parseInt(get('zoom'), 10);
        if (!isFinite(zoom)) zoom = 5;
        zoom = Math.max(0, Math.min(15, zoom));

        var interval = parseInt(get('interval'), 10);
        if (!interval || interval < 2) interval = 5;

        image.style.setProperty('--ss-zoom', String(1 + zoom / 100));
        image.style.setProperty('--ss-time', interval + 's');

        requestAnimationFrame(function () {
            if (overlay) overlay.classList.add('visible');
        });

        fillQueue().then(function () {
            if (active) nextPhoto();
        }).catch(function (error) {
            message(
                'Immich: ' + error.message +
                '. Проверьте адрес, ключ, HTTPS и CORS.'
            );
            stop();
        });
    }

    function stop() {
        if (!active) return;

        active = false;
        clearTimeout(timer);
        timer = null;

        queue.forEach(function (photo) {
            URL.revokeObjectURL(photo.url);
        });
        queue = [];

        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
        }

        if (overlay) overlay.remove();

        overlay = null;
        image = null;

        armIdle();
    }

    function armIdle() {
        clearTimeout(idleTimer);

        if (active || String(get('auto')) === 'false' || !get('auto')) {
            return;
        }

        if (playing()) return;

        var delay = parseInt(get('delay'), 10);
        if (!delay || delay < 1) delay = 180;

        idleTimer = setTimeout(function () {
            if (!active && !playing()) start();
        }, delay * 1000);
    }

    function keyHandler(event) {
        if (active) {
            event.preventDefault();
            event.stopPropagation();

            if (event.stopImmediatePropagation) {
                event.stopImmediatePropagation();
            }

            stop();
            return;
        }

        armIdle();
    }

    function addInput(name, title, description, defaultValue) {
        Lampa.SettingsApi.addParam({
            component: 'more',
            param: {
                name: PREFIX + name,
                type: 'input',
                'default': defaultValue
            },
            field: {
                name: title,
                description: description
            }
        });
    }

    function addSettings() {
        if (!Lampa.SettingsApi) return;

        addInput(
            'url',
            'Immich: адрес сервера',
            'Например: http://192.168.1.52:2283',
            DEFAULTS.url
        );

        addInput(
            'key',
            'Immich: API-ключ',
            'Ключ хранится в настройках Lampa на этом устройстве.',
            ''
        );

        addInput(
            'delay',
            'Скринсейвер: задержка автозапуска (сек.)',
            'По умолчанию 180 секунд.',
            '180'
        );

        addInput(
            'interval',
            'Скринсейвер: время показа фото (сек.)',
            'По умолчанию 5 секунд.',
            '5'
        );

        addInput(
            'zoom',
            'Скринсейвер: увеличение (%)',
            'По умолчанию 5%.',
            '5'
        );

        Lampa.SettingsApi.addParam({
            component: 'more',
            param: {
                name: PREFIX + 'auto',
                type: 'trigger',
                'default': true
            },
            field: {
                name: 'Immich: автоматический запуск',
                description: 'Включить запуск после бездействия.'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'more',
            param: { name: PREFIX + 'start', type: 'button' },
            field: {
                name: 'Запустить Immich Screensaver',
                description: 'Запустить показ фотографий вручную.'
            },
            onRender: function (item) {
                item.on('hover:enter', start);
            }
        });
    }

    function init() {
        addSettings();

        document.addEventListener('keydown', keyHandler, true);

        document.addEventListener('pointerdown', function () {
            if (!active) armIdle();
        }, true);

        document.addEventListener('touchstart', function () {
            if (!active) armIdle();
        }, true);

        document.addEventListener('mousemove', function () {
            if (!active) armIdle();
        }, true);

        if (window.MutationObserver) {
            var observer = new MutationObserver(function () {
                if (!active) armIdle();
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        armIdle();

        console.log('[Immich Screensaver] loaded');
    }

    function boot() {
        if (typeof Lampa === 'undefined') {
            setTimeout(boot, 250);
            return;
        }

        if (Lampa.Storage && Lampa.SettingsApi) {
            init();
            return;
        }

        if (Lampa.Listener && Lampa.Listener.follow) {
            var initialized = false;

            Lampa.Listener.follow('app', function (event) {
                if (event.type === 'ready' && !initialized) {
                    initialized = true;
                    init();
                }
            });
        } else {
            setTimeout(boot, 250);
        }
    }

    boot();
})();
```
