(function (root, factory) {
  'use strict';

  var api = factory();
  root.VerstakBrowserI18n = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PREFERENCES = { system: true, en: true, ru: true };

  function normalizePreference(value) {
    value = String(value || '').trim().toLowerCase();
    return PREFERENCES[value] ? value : 'system';
  }

  function resolveLocale(preference, systemLocale) {
    preference = normalizePreference(preference);
    if (preference === 'en' || preference === 'ru') return preference;
    systemLocale = String(systemLocale || '').trim().toLowerCase();
    return systemLocale === 'ru' || systemLocale.indexOf('ru-') === 0 ? 'ru' : 'en';
  }

  function interpolate(message, params) {
    if (!params) return message;
    return message.replace(/\{([A-Za-z0-9_.-]+)\}/g, function (placeholder, name) {
      return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder;
    });
  }

  function loadCatalogs(loadJSON) {
    return Promise.all([loadJSON('en'), loadJSON('ru')]).then(function (catalogs) {
      return { en: catalogs[0] || {}, ru: catalogs[1] || {} };
    });
  }

  function createTranslator(catalogs, locale) {
    catalogs = catalogs || {};
    locale = locale === 'ru' ? 'ru' : 'en';
    return function translate(key, params, fallback) {
      var message = catalogs[locale] && catalogs[locale][key];
      if (message == null && catalogs.en) message = catalogs.en[key];
      if (message == null) message = fallback == null ? key : fallback;
      return interpolate(String(message), params);
    };
  }

  return {
    normalizePreference: normalizePreference,
    resolveLocale: resolveLocale,
    loadCatalogs: loadCatalogs,
    createTranslator: createTranslator
  };
});
