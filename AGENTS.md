# AGENTS.md — Verstak Browser Extension

## Назначение

Расширение браузера для Верстака. Позволяет отправлять страницы, выделенный текст, ссылки и скриншоты в Verstak.

## Правила

- Расширение не знает внутреннюю структуру notes/files/activity.
- Отправляет события в local receiver, обработка — через official.browser-inbox.
- Работает offline: складывает в pending queue.
- Поддерживает domain bindings (привязка доменов к делам).

## Состав

```
verstak-browser-extension/
  AGENTS.md
  firefox/
    manifest.json
    background.js
    content.js
    popup/
  chromium/
    manifest.json
    background.js
    content.js
    popup/
  shared/
    api.js
    capture.js
    queue.js
    domain-bindings.js
  package.json
  README.md
```

## Возможности

- Page capture — отправка полной страницы
- Selected text capture — отправка выделенного текста
- Link sending — отправка ссылки
- Pending queue — если desktop offline
- Domain bindings — привязка к делу
