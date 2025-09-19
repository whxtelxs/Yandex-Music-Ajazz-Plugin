/// <reference path="../utils/common.js" />
/// <reference path="../utils/action.js" />

const $local = true, $back = false;

let logsWindow = null;
let allLogs = [];

function addLog(message, type = 'info') {
    const logsContainer = $('#logsContainer');
    if (!logsContainer) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const logData = {
        timestamp: timestamp,
        message: message,
        type: type,
        fullTimestamp: new Date().toISOString()
    };
    
    allLogs.push(logData);
    
    if (logsContainer.querySelector('.text-muted')) {
        logsContainer.innerHTML = '';
    }
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> ${message}`;
    
    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
    
    if (logsContainer.children.length > 100) {
        logsContainer.removeChild(logsContainer.firstChild);
    }
    
    if (logsWindow && !logsWindow.closed) {
        updateLogsWindow();
    }
    
    if (allLogs.length > 1000) {
        allLogs = allLogs.slice(-1000);
    }

    console.log(`[${type}] ${message}`);
}

function clearLogs() {
    const logsContainer = $('#logsContainer');
    if (logsContainer) {
        logsContainer.innerHTML = '<div class="text-muted">Логи будут отображаться здесь...</div>';
    }
    allLogs = [];
    if (logsWindow && !logsWindow.closed) {
        updateLogsWindow();
    }
}

function openLogsWindow() {
    if (logsWindow && !logsWindow.closed) {
        logsWindow.focus();
        return;
    }
    
    const windowFeatures = 'width=800,height=600,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';
    logsWindow = window.open('', 'YandexMusicLogs', windowFeatures);
    
    if (logsWindow) {
        logsWindow.document.title = 'Яндекс Музыка - Логи';
        logsWindow.document.head.innerHTML = `
            <meta charset="utf-8">
            <title>Яндекс Музыка - Логи</title>
            <style>
                body {
                    font-family: 'Courier New', monospace;
                    background-color: #1a1a1a;
                    color: #fff;
                    margin: 0;
                    padding: 20px;
                    font-size: 14px;
                }
                .header {
                    position: sticky;
                    top: 0;
                    background-color: #1a1a1a;
                    border-bottom: 2px solid #444;
                    padding-bottom: 10px;
                    margin-bottom: 20px;
                }
                .controls {
                    margin-bottom: 15px;
                }
                .btn {
                    background-color: #444;
                    color: #fff;
                    border: 1px solid #666;
                    padding: 8px 16px;
                    margin-right: 10px;
                    cursor: pointer;
                    border-radius: 4px;
                    font-family: inherit;
                }
                .btn:hover {
                    background-color: #555;
                }
                .log-entry {
                    margin-bottom: 8px;
                    padding: 4px 0;
                    border-bottom: 1px solid #333;
                    word-wrap: break-word;
                }
                .log-timestamp {
                    color: #888;
                    font-size: 12px;
                }
                .log-info { color: #4CAF50; }
                .log-error { color: #f44336; }
                .log-warning { color: #ff9800; }
                .stats {
                    color: #888;
                    font-size: 12px;
                    margin-bottom: 10px;
                }
            </style>
        `;
        
        logsWindow.document.body.innerHTML = `
            <div class="header">
                <h2>Яндекс Музыка - Логи</h2>
                <div class="controls">
                    <button class="btn" onclick="copyAllLogs()">Скопировать все логи</button>
                    <button class="btn" onclick="clearWindowLogs()">Очистить</button>
                    <button class="btn" onclick="window.close()">Закрыть</button>
                </div>
                <div id="stats" class="stats"></div>
            </div>
            <div id="logsContent"></div>
        `;
        
        logsWindow.copyAllLogs = () => {
            copyLogs();
        };
        
        logsWindow.clearWindowLogs = () => {
            clearLogs();
        };
        
        updateLogsWindow();
        
        logsWindow.addEventListener('beforeunload', () => {
            logsWindow = null;
        });
    }
}

function updateLogsWindow() {
    if (!logsWindow || logsWindow.closed) return;
    
    const logsContent = logsWindow.document.getElementById('logsContent');
    const stats = logsWindow.document.getElementById('stats');
    
    if (!logsContent || !stats) return;
    
    const logCounts = {
        info: allLogs.filter(log => log.type === 'info').length,
        error: allLogs.filter(log => log.type === 'error').length,
        warning: allLogs.filter(log => log.type === 'warning').length
    };
    
    stats.innerHTML = `Всего логов: ${allLogs.length} | Информация: ${logCounts.info} | Ошибки: ${logCounts.error} | Предупреждения: ${logCounts.warning}`;
    
    logsContent.innerHTML = allLogs.map(log => 
        `<div class="log-entry log-${log.type}">
            <span class="log-timestamp">[${log.timestamp}]</span> ${log.message}
        </div>`
    ).join('');
    
    logsContent.scrollTop = logsContent.scrollHeight;
}

function copyLogs() {
    const logsText = allLogs.map(log => 
        `[${log.timestamp}] ${log.type.toUpperCase()}: ${log.message}`
    ).join('\n');
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(logsText).then(() => {
            addLog('✅ Логи скопированы в буфер обмена', 'info');
        }).catch(err => {
            addLog('❌ Ошибка копирования: ' + err.message, 'error');
            fallbackCopyTextToClipboard(logsText);
        });
    } else {
        fallbackCopyTextToClipboard(logsText);
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            addLog('✅ Логи скопированы в буфер обмена (fallback)', 'info');
        } else {
            addLog('❌ Не удалось скопировать логи', 'error');
        }
    } catch (err) {
        addLog('❌ Ошибка копирования: ' + err.message, 'error');
    }
    
    document.body.removeChild(textArea);
}

function initUI() {
    console.log('Инициализация UI Property Inspector...');
    
    if (!$websocket || $websocket.readyState !== 1) {
        console.error('WebSocket не готов, состояние:', $websocket ? $websocket.readyState : 'undefined');
        setTimeout(initUI, 500);
        return;
    }
    
    const connectionStatus = document.getElementById('connectionStatus');
    const checkConnectionBtn = document.getElementById('checkConnectionBtn');
    const debugPortInput = document.getElementById('debugPort');
    const savePortBtn = document.getElementById('savePortBtn');
    const portHint = document.getElementById('portHint');
    
    console.log('Элементы DOM:', {
        connectionStatus: !!connectionStatus,
        checkConnectionBtn: !!checkConnectionBtn,
        debugPortInput: !!debugPortInput,
        savePortBtn: !!savePortBtn,
        portHint: !!portHint
    });
    
    if (!connectionStatus || !checkConnectionBtn) {
        console.error('Не удалось найти элементы DOM для статуса соединения');
        return;
    }
    
    console.log('Инициализация Property Inspector...');
    console.log('Проверка соединения с Яндекс Музыкой...');
    
    if ($websocket && $websocket.readyState === 1) {
        $websocket.getGlobalSettings();
        
        $websocket.sendToPlugin({ command: 'checkConnection' });
    }
    
    checkConnectionBtn.addEventListener('click', () => {
        console.log('Нажата кнопка проверки соединения');
        connectionStatus.textContent = 'Проверка...';
        connectionStatus.className = 'badge bg-warning';
        console.log('Запрос проверки соединения...');
        
        if ($websocket && $websocket.readyState === 1) {
            $websocket.sendToPlugin({ command: 'checkConnection' });
        } else {
            console.error('WebSocket не готов для отправки данных');
            connectionStatus.textContent = 'Ошибка соединения';
            connectionStatus.className = 'badge bg-danger';
        }
    });
    
    if (savePortBtn && debugPortInput) {
        savePortBtn.addEventListener('click', () => {
            console.log('Нажата кнопка сохранения порта');
            const port = parseInt(debugPortInput.value);
            if (isNaN(port) || port < 1 || port > 65535) {
                console.error('Некорректный порт:', debugPortInput.value);
                return;
            }
            
            console.log(`Сохранение нового порта: ${port}...`);
            
            const settings = {
                debugPort: port
            };
            
            if ($websocket && $websocket.readyState === 1) {
                $websocket.setGlobalSettings(settings);
                $websocket.sendToPlugin({ command: 'changePort', port: port });
                
                connectionStatus.textContent = 'Переподключение...';
                connectionStatus.className = 'badge bg-warning';
            } else {
                console.error('WebSocket не готов для отправки данных');
            }
        });
    }
}

const $propEvent = {
    didReceiveGlobalSettings({ settings }) {
        console.log('Получены глобальные настройки:', settings);
        
        const debugPortInput = document.getElementById('debugPort');
        const portHint = document.getElementById('portHint');
        
        if (debugPortInput && settings && settings.debugPort) {
            debugPortInput.value = settings.debugPort;
            console.log(`Установлен порт из настроек: ${settings.debugPort}`);
            
            if (portHint) {
                portHint.textContent = `Убедитесь, что Яндекс Музыка запущена с параметром --remote-debugging-port=${settings.debugPort}`;
            }
        }
    },
    didReceiveSettings(data) {
        console.log('Получены настройки:', data);
    },
    sendToPropertyInspector(data) {
        console.log('Получены данные от плагина:', data);
        
        const connectionStatus = document.getElementById('connectionStatus');
        const portHint = document.getElementById('portHint');
        
        if (!connectionStatus) {
            console.error('Не удалось найти элемент статуса соединения');
            return;
        }
        
        if (data.command === 'connectionStatus') {
            if (data.status === 'connected') {
                connectionStatus.textContent = 'Подключено';
                connectionStatus.className = 'badge bg-success';
                console.log('✅ Соединение с Яндекс Музыкой установлено');
            } else {
                connectionStatus.textContent = 'Не подключено';
                connectionStatus.className = 'badge bg-danger';
                console.log('❌ Не удалось подключиться к Яндекс Музыке');
                
                const debugPortInput = document.getElementById('debugPort');
                const port = debugPortInput ? debugPortInput.value : '9222';
                console.log(`Убедитесь, что Яндекс Музыка запущена с параметром --remote-debugging-port=${port}`);
            }
        }
        
        if (data.command === 'portChanged') {
            console.log(`✅ Порт изменен на ${data.port}`);
            
            if (portHint) {
                portHint.textContent = `Убедитесь, что Яндекс Музыка запущена с параметром --remote-debugging-port=${data.port}`;
            }
            
            setTimeout(() => {
                if ($websocket && $websocket.readyState === 1) {
                    $websocket.sendToPlugin({ command: 'checkConnection' });
                }
            }, 1000);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded event fired');
    setTimeout(initUI, 1000);
});