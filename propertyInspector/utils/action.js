let $websocket, $uuid, $action, $context, $settings, $lang, $FileID = '';

WebSocket.prototype.setGlobalSettings = function(payload) {
    this.send(JSON.stringify({
        event: "setGlobalSettings",
        context: $uuid, payload
    }));
}

WebSocket.prototype.getGlobalSettings = function() {
    this.send(JSON.stringify({
        event: "getGlobalSettings",
        context: $uuid,
    }));
}

WebSocket.prototype.sendToPlugin = function (payload) {
    this.send(JSON.stringify({
        event: "sendToPlugin",
        action: $action,
        context: $uuid,
        payload
    }));
};

function sendValueToPlugin(payload) {
    if ($websocket && $websocket.readyState === 1) {
        $websocket.sendToPlugin(payload);
    } else {
        console.error('WebSocket не готов для отправки данных');
    }
}

WebSocket.prototype.setTitle = function (str, row = 0, num = 6) {
    console.log(str);
    let newStr = '';
    if (row) {
        let nowRow = 1, strArr = str.split('');
        strArr.forEach((item, index) => {
            if (nowRow < row && index >= nowRow * num) { nowRow++; newStr += '\n'; }
            if (nowRow <= row && index < nowRow * num) { newStr += item; }
        });
        if (strArr.length > row * num) { newStr = newStr.substring(0, newStr.length - 1); newStr += '..'; }
    }
    this.send(JSON.stringify({
        event: "setTitle",
        context: $context,
        payload: {
            target: 0,
            title: newStr || str
        }
    }));
}

WebSocket.prototype.setState = function (state) {
    this.send(JSON.stringify({
        event: "setState",
        context: $context,
        payload: { state }
    }));
};

WebSocket.prototype.setImage = function (url) {
    let image = new Image();
    image.src = url;
    image.onload = () => {
        let canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        let ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        this.send(JSON.stringify({
            event: "setImage",
            context: $context,
            payload: {
                target: 0,
                image: canvas.toDataURL("image/png")
            }
        }));
    };
};

WebSocket.prototype.openUrl = function (url) {
    this.send(JSON.stringify({
        event: "openUrl",
        payload: { url }
    }));
};

function debounce(func, delay) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

WebSocket.prototype.saveData = debounce(function (payload) {
    this.send(JSON.stringify({
        event: "setSettings",
        context: $uuid,
        payload
    }));
}, 300);

const connectSocket = connectElgatoStreamDeckSocket;
async function connectElgatoStreamDeckSocket(port, uuid, event, app, info) {
    info = JSON.parse(info);
    $uuid = uuid; $action = info.action; 
    $context = info.context;
    $websocket = new WebSocket('ws://127.0.0.1:' + port);
    $websocket.onopen = () => $websocket.send(JSON.stringify({ event, uuid }));

    $websocket.onmessage = e => {
        let data = JSON.parse(e.data);
        if (data.event === 'didReceiveSettings') {
            $settings = new Proxy(data.payload.settings, {
                get(target, property) {
                    return target[property];
                },
                set(target, property, value) {
                    target[property] = value;
                    $websocket.saveData(data.payload.settings);
                }
            });
            if (!$back) {
                const mainElement = document.querySelector('.sdpi-wrapper');
                if (mainElement) {
                    mainElement.style.display = 'block';
                }
            }
        }
        if ($propEvent && typeof $propEvent[data.event] === 'function') {
            $propEvent[data.event](data.payload);
        }
    };

    if (!$local) return;
    $lang = await new Promise(resolve => {
        const req = new XMLHttpRequest();
        req.open('GET', `../../${JSON.parse(app).application.language}.json`);
        req.send();
        req.onreadystatechange = () => {
            if (req.readyState === 4) {
                resolve(JSON.parse(req.responseText).Localization);
            }
        };
    });

    const mainElement = document.querySelector('.sdpi-wrapper');
    if (mainElement) {
        const walker = document.createTreeWalker(mainElement, NodeFilter.SHOW_TEXT, (e) => {
            return e.data.trim() && NodeFilter.FILTER_ACCEPT;
        });
        while (walker.nextNode()) {
            console.log(walker.currentNode.data);
            if ($lang && $lang[walker.currentNode.data]) {
                walker.currentNode.data = $lang[walker.currentNode.data];
            }
        }
    }
    
    const translate = item => {
        if (item.placeholder?.trim() && $lang && $lang[item.placeholder]) {
            console.log(item.placeholder);
            item.placeholder = $lang[item.placeholder];
        }
    };
    document.querySelectorAll('input').forEach(translate);
    document.querySelectorAll('textarea').forEach(translate);
}

document.querySelectorAll('input[type="file"]').forEach(item => item.addEventListener('click', () => $FileID = item.id));
const onFilePickerReturn = (url) => {
    const fileInput = document.getElementById($FileID);
    if (fileInput && typeof url === 'string') {
        try {
            const parsedUrl = JSON.parse(url);
            console.log('Выбран файл:', parsedUrl);
        } catch (e) {
            console.error('Ошибка при обработке URL файла:', e);
        }
    }
};