function $(selector, isAll = false) {
    if (isAll) {
        return document.querySelectorAll(selector);
    }
    return document.querySelector(selector);
}

$.extend = function(element, methods) {
    if (!element) return null;
    
    if (methods) {
        Object.keys(methods).forEach(key => {
            element[key] = methods[key];
        });
    }
    
    return element;
};

const domMethods = {
    on: function(event, callback) {
        this.addEventListener(event, callback);
        return this;
    },
    attr: function(name, value) {
        if (value !== undefined) {
            this.setAttribute(name, value);
            return this;
        }
        return this.getAttribute(name);
    }
};

if (!String.prototype.fill) {
    String.prototype.fill = function() {
        return this >= 10 ? this : '0' + this;
    };
}

$.debounce = function(fn, delay) {
    let timer = null;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timer);
        timer = setTimeout(() => {
            fn.apply(context, args);
        }, delay);
    };
};

$.throttle = function(fn, delay) {
    let timer = null;
    return function() {
        if (timer) return;
        const context = this;
        const args = arguments;
        timer = setTimeout(() => {
            fn.apply(context, args);
            timer = null;
        }, delay);
    };
};

document.addEventListener('DOMContentLoaded', function() {
    const numInputs = document.querySelectorAll('input[type="num"]');
    numInputs.forEach(item => {
        item.addEventListener('input', function limitNum() {
            if (!item.value || /^\d+$/.test(item.value)) return;
            item.value = item.value.slice(0, -1);
            limitNum(item);
        });
    });
});