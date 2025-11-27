# Мессенджер ⚡Maximum⚡

Ловит даже на парковке!

## Как запустить проект?

1. Создайте файл `.env` и укажите в нем переменные окружения, шаблон находится в `.env.template`

2. Из корневой директории прописываем:

```bash
docker compose up -d --build
```

## Сборка и запуск бэкенда отдельно (рекомендуется собирать всё вместе)

### Сборка

Из корня прописываем:

```bash
docker build -t messanger-backend backend
```

### Локальная сборка (Windows / MinGW)

Если хотите собирать без Docker, установите MSYS2 с комплектом `mingw-w64` и пакеты `mingw-w64-x86_64-libpqxx`, `mingw-w64-x86_64-postgresql`.  
Далее:

```powershell
cmake -S backend -B backend/build -G "MinGW Makefiles"
mingw32-make -C backend/build
```

Для запуска сервера используйте `backend/build/main.exe`.

### Запуск бэкенда

Из `./backend`:

```bash
docker run --rm -p 18080:18080 messanger-backend
```

## API подсказки

- `POST /users` — регистрация, в ответе приходит JWT.
- `POST /auth/login` — вход по email/паролю.
- `GET /users` — список пользователей (нужен заголовок `Authorization: Bearer <token>`).
- `WS /ws/chat` — WebSocket-канал; сначала отправьте заголовок `Authorization: Bearer <token>`.
  - Отправка сообщения: `{"type":"message","recipient_username":"bob","text":"привет"}` (поле `type` можно опустить — по умолчанию `"message"`).
  - История по username: `{"type":"history_with_user","peer_username":"bob","count":50,"before_id":123}`.
  - История по chat_id: `{"type":"history_by_chat","chat_id":42,"count":50,"before_id":123}`.
  - Список чатов: `{"type":"list_chats","count":50,"offset":0}`.
  - Поиск пользователя по username: `{"type":"user_lookup","username":"bob"}`.
  - Поиск по имени: `{"type":"user_search","name":"Али", "count":10}`.
- `GET /chats` — получить список своих диалогов (`?count=50&offset=0`), сортировка по времени последнего сообщения.
- `GET /chats/with/<username>/messages?count=50&before_id=123` — получить историю диалога с пользователем, также с асимптотикой `O(log M + N)`.
- `GET /chats/<chat_id>/messages?count=50&before_id=123` — быстро получить последние `count` сообщений конкретного чата. Благодаря индексам по `(chat_id, time DESC)` чтение работает с асимптотикой `O(log M + N)`.
- `GET /users/lookup/<username>` — точный поиск пользователя.
- `GET /users/search?name=Али&count=10` — эластичный поиск по `name`.
