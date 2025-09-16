/// <reference path="../utils/common.js" />
/// <reference path="../utils/action.js" />

const $local = true, $back = false;

function initUI() {
    const connectionStatus = $('#connectionStatus');
    const checkConnectionBtn = $('#checkConnectionBtn');
    const togglePlaybackBtn = $('#togglePlaybackBtn');
    const prevTrackBtn = $('#prevTrackBtn');
    const nextTrackBtn = $('#nextTrackBtn');
    const likeTrackBtn = $('#likeTrackBtn');
    const dislikeTrackBtn = $('#dislikeTrackBtn');
    const toggleMuteBtn = $('#toggleMuteBtn');
    
    if (!connectionStatus || !checkConnectionBtn) {
        console.error('Не удалось найти элементы DOM для статуса соединения');
        return;
    }
    
    sendValueToPlugin({ command: 'checkConnection' });
    
    checkConnectionBtn.addEventListener('click', () => {
        connectionStatus.textContent = 'Проверка...';
        connectionStatus.className = 'badge bg-warning';
        sendValueToPlugin({ command: 'checkConnection' });
    });
    
    if (togglePlaybackBtn) {
        togglePlaybackBtn.addEventListener('click', () => {
            sendValueToPlugin({ command: 'togglePlayback' });
        });
    }
    
    if (prevTrackBtn) {
        prevTrackBtn.addEventListener('click', () => {
            sendValueToPlugin({ command: 'previousTrack' });
        });
    }
    
    if (nextTrackBtn) {
        nextTrackBtn.addEventListener('click', () => {
            sendValueToPlugin({ command: 'nextTrack' });
        });
    }
    
    if (likeTrackBtn) {
        likeTrackBtn.addEventListener('click', () => {
            sendValueToPlugin({ command: 'likeTrack' });
        });
    }
    
    if (dislikeTrackBtn) {
        dislikeTrackBtn.addEventListener('click', () => {
            sendValueToPlugin({ command: 'dislikeTrack' });
        });
    }
    
    if (toggleMuteBtn) {
        toggleMuteBtn.addEventListener('click', () => {
            sendValueToPlugin({ command: 'toggleMute' });
        });
    }
    
    console.log('Элементы DOM:', {
        connectionStatus,
        checkConnectionBtn,
        togglePlaybackBtn,
        prevTrackBtn,
        nextTrackBtn,
        likeTrackBtn,
        dislikeTrackBtn,
        toggleMuteBtn
    });
}

const $propEvent = {
    didReceiveGlobalSettings({ settings }) {
    },
    didReceiveSettings(data) {
    },
    sendToPropertyInspector(data) {
        console.log('Получены данные от плагина:', data);
        
        const connectionStatus = $('#connectionStatus');
        if (!connectionStatus) {
            console.error('Не удалось найти элемент статуса соединения');
            return;
        }
        
        if (data.command === 'connectionStatus') {
            if (data.status === 'connected') {
                connectionStatus.textContent = 'Подключено';
                connectionStatus.className = 'badge bg-success';
            } else {
                connectionStatus.textContent = 'Не подключено';
                connectionStatus.className = 'badge bg-danger';
            }
        }
    }
};

document.addEventListener('DOMContentLoaded', initUI);