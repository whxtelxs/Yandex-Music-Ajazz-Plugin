const yandexMusic = require('./utils/yandex-music');

async function testConnection() {
    console.log('[testConnection] Проверка соединения с Яндекс Музыкой');

    try {
        const isConnected = await yandexMusic.checkConnection();

        if (isConnected) {
            console.log('[testConnection] Соединение установлено');

            console.log('[testConnection] Переключение воспроизведения');
            const playbackResult = await yandexMusic.togglePlayback();

            if (playbackResult) {
                console.log('[testConnection] Воспроизведение переключено');
            } else {
                console.log('[testConnection] Не удалось переключить воспроизведение');
            }
        } else {
            console.log('[testConnection] Соединение не установлено');
            console.log('[testConnection] Запустите Яндекс Музыку с --remote-debugging-port=9222');
        }
    } catch (error) {
        console.error('[testConnection] Ошибка:', error);
    }
}

testConnection().catch(console.error);
