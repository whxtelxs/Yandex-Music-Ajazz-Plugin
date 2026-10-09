'use strict';

function createNotifier({ toast, setTimer = setTimeout, clearTimer = clearTimeout }) {
    const variants = { error: 'danger', warning: 'warning', info: 'info', success: 'success' };
    return (type, text) => {
        let timer;
        const id = toast[variants[type] || 'success'](text, {
            timeout: 0,
            onClose: () => clearTimer(timer)
        });
        timer = setTimer(() => toast.close(id), type === 'error' || type === 'warning' ? 5000 : type === 'info' ? 3500 : 2500);
        return id;
    };
}

module.exports = { createNotifier };
