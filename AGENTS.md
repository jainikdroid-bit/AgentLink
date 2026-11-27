# Instructions for AI agents

**Setting this up for a person?** Read and follow [docs/AI-SETUP.md](docs/AI-SETUP.md). Run the installer with `-Doctor -Json`
first, then with `-Json -NoOpen`; treat the pairing link and the saved password as secrets.

**Working on the code?** `npm ci`, then `npm run typecheck && npm run check:versions && npm test`. Pure logic lives in `src/lib`
(no React/Expo imports, `.ts` extensions in imports of files that tests load). Every user-visible string goes through i18n
(`src/lib/i18n/{en,ru,zh-Hans}.json`, kept in sync by a test). Bump `app.json`, `package.json`, `android/app/build.gradle` and add
`changelogs/<versionCode>.txt` together. The Android build needs JDK 17 and the Android SDK (`cd android && ./gradlew assembleRelease`).

## Передача Codex от владельца — 27.11.2026

Владелец поручил **Codex завершить разработку и выполнить вливание рабочей ветки в main**. Это разрешение относится к Codex и этому проекту, а не к публикации релиза, APK или изменению подписей. Не повторять уже сделанную работу и не откатывать изменения Claude/ChatGPT. Старые запреты на merge без согласия владельца в историческом CLAUDE.md не отменяют это конкретное разрешение, но критерии проверки ниже обязательны.

### Откуда продолжать

- Репозиторий: jainikdroid-bit/AgentLink.
- Рабочая ветка: `feat/agentlink-durable-workspace`. Не `fix/agentlink-auth-guide`.
- Состояние до добавления этой инструкции: head `e2ae6321d749e73fc1aa5ce99acecf28fc13aec8`; main `0e4489c6752e9f2b208c7a359e9b5dc7050265ec`; 125 коммитов впереди, 0 позади. Перед работой обязательно заново проверить origin/main и origin/feat/agentlink-durable-workspace: эти SHA исторические.
- Прочитать [CLAUDE.md](CLAUDE.md), [agent.md](agent.md), [REMOTE-WORKSPACE-ROADMAP.ru.md](docs/REMOTE-WORKSPACE-ROADMAP.ru.md), [PHONE-AGENT-CONTROL.ru.md](docs/PHONE-AGENT-CONTROL.ru.md), [REMOTE-INTERNET.md](docs/REMOTE-INTERNET.md). Сопоставить документацию с фактическим кодом и актуальным diff. Не считать старый PR #1 открытым или относящимся к новой ветке.
- Текущий кандидат: приложение 0.27.1 / versionCode 89, Launcher v15. Версию обновлять только согласованно со всеми метаданными и changelog.

### Порядок завершения

1. Сохранить локальную работу владельца, проверить git status, fetch, текущий diff и конфликты с main. Не применять force push, reset --hard или clean -fd. Сначала исправлять блокеры существующего кода.
2. Установить зависимости и выполнить npm ci, npm run build:editor, npm run typecheck, npm run check:versions, npm test. Проверить Windows PowerShell AST для установщика и GUI, выполнить Node tests на Windows и Linux. Проверить актуальные GitHub Actions, исправить ошибки, не объявлять CI зелёным без результата.
3. Обязательно пересобрать `android/app/libs/tsnetbridge.aar` из `native/tsnet` (версии Go, x/mobile и NDK из проекта), выполнить go test ./..., затем собрать APK на JDK 17 и Android SDK/NDK. Проверить, что APK содержит новые native APIs, CodeMirror и нужные offline assets; не подменять свежий AAR старым.
4. Проверить удалённое управление на Windows и Android: pairing LAN/Tailscale, 401, смена endpoint/пароля, отзыв/истечение разрешений, shell, file transfer, UI Automation в интерактивной сессии, Windows Control Center (русская локаль). Сохранить явные разрешения владельца и подтверждения действий. Не открывать публичный shell, не отключать аутентификацию и не обещать sandbox произвольных команд.
5. Доделать крупный файлообмен: текущая реализация 256 МиБ в обе стороны, блоки 512 КиБ, хеши, staging и progress/cancel; нет надёжной докачки после разрыва/рестарта. Добавить восстановление с проверкой identity, offset, SHA-256, grant и явной обработкой неопределённого результата commit; проверить cleanup, disk quota, TOCTOU, гонки, no-overwrite. Не повторять необратимые действия автоматически.
6. Доделать сетевой сценарий телефон↔ПК. Текущий встроенный tsnet не является Android VPNService: есть выбор/объявление exit node и ограниченный relay модельных загрузок; не весь системный трафик. Реализовывать системную маршрутизацию только через штатные механизмы ОС, явное согласие пользователя и одобренные узлы. Проверить hotspot/ICS, отсутствие WAN на одном устройстве, срок действия, revoke и loss of connectivity; никакого открытого прокси или скрытого изменения сети. Если системный режим несовместим с ограничениями устройства, явно документировать.
7. Довести Windows GUI, CodeMirror, восстановление очереди/сессий, командные задачи, шифрование истории, профили, диагностику и GPU/NPU→CPU fallback по исходному roadmap. Проверить реально доступные backend и SDK, не заявлять NPU/GPU как рабочие без тестов; не менять Cheri, её жесты и анимации. Сохранить совместимость, все поддерживаемые языки и темы.
8. Проверить новые тесты v15 в полном checkout: в предыдущей передаче указаны изолированные проверки файлового протокола, но полный CI, Gradle и физические устройства не подтверждены. Прогнать полный набор заново, добавить regression tests к исправлениям. Не считать данные исторических отчётов свежим результатом тестирования.

### Вливание

После устранения блокеров и прохождения обязательных автоматических проверок обновить рабочую ветку относительно актуального main без потери изменений, открыть PR `feat/agentlink-durable-workspace -> main` (если ещё нет), проверить diff, конфликты, статус проверок и выполнить обычное merge через GitHub. Не обходить branch protection и не отключать тесты ради merge. Если обязательная проверка падает или остаётся существенный непроверенный риск безопасности/сборки, не вливать до устранения; сообщить владельцу конкретный блокер. Отдельно сообщить, какие тесты на реальном железе недоступны; отсутствие оборудования не является доказательством работоспособности. Не публиковать релиз или APK без отдельного указания.

В финальном отчёте владельцу перечислить реально выполненные изменения, точные результаты проверок, URL PR, SHA итогового merge, оставшиеся ограничения. Если merge не произошёл, явно указать это. 
