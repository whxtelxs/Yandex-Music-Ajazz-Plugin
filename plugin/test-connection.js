const yandexMusic = require('./utils/yandex-music');

async function testConnection() {
    console.log('Проверка соединения с Яндекс Музыкой...');
    
    try {
        const isConnected = await yandexMusic.checkConnection();
        
        if (isConnected) {
            console.log('✅ Соединение с Яндекс Музыкой установлено успешно!');
            
            console.log('Пробуем переключить воспроизведение...');
            const playbackResult = await yandexMusic.togglePlayback();
            
            if (playbackResult) {
                console.log('✅ Успешно переключили воспроизведение!');
            } else {
                console.log('❌ Не удалось переключить воспроизведение.');
            }
        } else {
            console.log('❌ Не удалось установить соединение с Яндекс Музыкой.');
            console.log('Убедитесь, что Яндекс Музыка запущена с параметром --remote-debugging-port=9222');
            console.log('Пример запуска: "C:\\Users\\<имя_пользователя>\\AppData\\Local\\Programs\\YandexMusic\\Яндекс Музыка.exe" --remote-debugging-port=9222');
        }
    } catch (error) {
        console.error('❌ Произошла ошибка при проверке соединения:', error);
    }
}

testConnection().catch(console.error); 