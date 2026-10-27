(function () {
'use strict';

```
if (window.immichTestLoaded) return;
window.immichTestLoaded = true;

function init() {
    console.log('[Immich TEST] init');

    Lampa.SettingsApi.addComponent({
        component: 'immich_test',
        name: 'Immich TEST',
        icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/></svg>'
    });

    Lampa.Noty.show('Immich TEST: плагин выполнен');
}

if (window.appready) {
    init();
} else {
    Lampa.Listener.follow('app', function (event) {
        if (event.type === 'ready') init();
    });
}
```

})();
