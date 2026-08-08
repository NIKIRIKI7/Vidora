# Поиск YouTube-видео по критериям (yt_search.ps1)

Скрипт ищет на YouTube свежие англоязычные видео по IT-темам (нейросети, железо, homelab, гики) и отбирает те, что подходят под критерии «небольшой канал с выстрелившим видео»: у канала от 1 000 до 90 000 подписчиков, а у видео просмотров больше, чем подписчиков у автора.

Используется официальный YouTube Data API v3 — без ключа работать не будет.

## Требования

- Windows PowerShell 5.1+ (есть в любой Windows)
- Ключ YouTube Data API v3 (бесплатный, см. ниже)

## Настройка ключа (один раз)

1. Открой https://console.cloud.google.com → создай/выбери проект.
2. **APIs & Services → Library** → найди **YouTube Data API v3** → **Enable**.
3. **Credentials → + Create Credentials → API key** → скопируй ключ.
4. Сохрани его в системе (PowerShell):

```powershell
[Environment]::SetEnvironmentVariable('YOUTUBE_API_KEY','ТВОЙ_КЛЮЧ','User')
```

Открой **новое** окно терминала — только новые процессы увидят переменную. Если ключ не найден, скрипт остановится с понятной ошибкой.

## Запуск

```powershell
powershell -ExecutionPolicy Bypass -File yt_search.ps1
```

По умолчанию: запросы `neural network AI, GPU hardware, artificial intelligence, homelab, PC build, machine learning, tech`, окно поиска — 5 дней назад от сегодня, канал 1 000–50 000 подписчиков, показываются только совпадения (просмотры > подписчики).

### Параметры

| Параметр | По умолчанию | Описание |
|---|---|---|
| `-QueriesCsv` | `neural network AI,GPU hardware,...` | Запросы через запятую |
| `-DaysBack` | `5` | Искать видео не старше N дней |
| `-MinSubs` / `-MaxSubs` | `1000` / `50000` | Полоса подписчиков канала |
| `-AllEntries` | выкл. | Показать все найденные ролики, не только совпавшие (для отладки фильтров) |
| `-OutFile` | пусто | Путь к CSV для сохранения результата |

### Примеры

```powershell
# Только нейросети, неделя назад
powershell -ExecutionPolicy Bypass -File yt_search.ps1 -QueriesCsv "neural network,llm,local ai" -DaysBack 7

# Железо и сборки ПК, строже по каналу (5-30k), сохранить в файл
powershell -ExecutionPolicy Bypass -File yt_search.ps1 -QueriesCsv "GPU,PC build,hardware" -MinSubs 5000 -MaxSubs 30000 -OutFile result.csv

# Посмотреть всё, что вообще нашлось (полезно понять, почему ничего не совпало)
powershell -ExecutionPolicy Bypass -File yt_search.ps1 -AllEntries
```

## Что выводится

Таблица: название, канал, подписчики, просмотры, отношение просмотры/подписчики (`ViewsPerSub` — чем больше, тем вируснее), дата публикации, ссылка `youtu.be/...`.

## Как работает

1. Для каждого запроса делает поиск с фильтрами `publishedAfter` (окно N дней), `relevanceLanguage=en`, `videoDuration=medium/long` (исключает Shorts), сортировками `date` и `relevance`.
2. Дедуплицирует ролики и по каждому запрашивает статистику: просмотры (videos) и подписчиков (channels).
3. Оставляет те, где канал в полосе `MinSubs..MaxSubs` и `views > subs`.

## Ограничения

- **Квота API**: ~10 000 юнитов/день. Один прогон — ~200–400 вызовов (поиск + статистика по ролику). ~25–50 прогонов в день.
- `relevanceLanguage=en` — не строгий фильтр: в выдаче попадаются ролики на хинди, русском и др. Проверяй заголовок глазами.
- Свежие видео (1–2 дня) часто ещё не набрали просмотров — совпадений может быть мало. Увеличивай `-DaysBack` до 7.
- Ключ должен быть ограничен только на YouTube Data API v3 (Credentials → Restrict key), чтобы его не украли.

## Автоматизация

Скрипт отдаёт данные и в CSV (`-OutFile`), поэтому его можно вызывать по расписанию (Планировщик задач Windows, cron) и кормить результаты в другие пайплайны Vidora.
