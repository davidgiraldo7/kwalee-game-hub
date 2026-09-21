(function (global) {
    'use strict';

    const registry = Object.create(null);

    function register(name, factory) {
        if (!name || typeof factory !== 'function') return;
        registry[name] = factory;
    }

    function has(name) {
        return !!registry[name];
    }

    function getActiveName() {
        const raw = global.SOFT_3D_TEMPLATE_PRESET;
        return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    }

    function createActive(options) {
        const name = getActiveName();
        if (!name) return null;
        const factory = registry[name];
        if (!factory) return null;
        return factory(options || {});
    }

    function list() {
        return Object.keys(registry).sort();
    }

    global.Soft3DTemplateBridge = {
        register,
        has,
        list,
        createActive,
        getActiveName
    };
})(typeof window !== 'undefined' ? window : globalThis);
