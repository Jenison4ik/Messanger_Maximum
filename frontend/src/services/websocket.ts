import Cookies from "js-cookie";
import type { WebSocketMessage, Message, Chat, User } from "@/types";

type MessageHandler = (message: Message) => void;
type ChatListHandler = (chats: Chat[]) => void;
type UserLookupHandler = (user: User | null) => void;
type UserSearchHandler = (users: User[]) => void;
type HistoryHandler = (messages: Message[]) => void;
type ErrorHandler = (error: string) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageHandlers: MessageHandler[] = [];
  private chatListHandlers: ChatListHandler[] = [];
  private userLookupHandlers: UserLookupHandler[] = [];
  private userSearchHandlers: UserSearchHandler[] = [];
  private historyHandlers: HistoryHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const token = Cookies.get("token");
      if (!token) {
        reject(new Error("Токен не найден"));
        return;
      }

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      // Браузер не позволяет установить заголовки для WebSocket
      // Поэтому передаем токен через query параметр
      const wsUrl = `${protocol}//${
        window.location.host
      }/api/ws/chat?token=${encodeURIComponent(token)}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("WebSocket connected");
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          console.log("WebSocket: получено сырое сообщение:", event.data);
          const data = JSON.parse(event.data);
          console.log("WebSocket: распарсено сообщение:", data);
          this.handleMessage(data);
        } catch (error) {
          console.error("Ошибка парсинга сообщения:", error, event.data);
        }
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        // Не отклоняем промис при ошибке, так как onclose тоже вызовется
      };

      this.ws.onclose = (event) => {
        console.log("WebSocket closed", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        this.ws = null;
        // Переподключаемся только если это не было нормальное закрытие
        if (event.code !== 1000) {
          this.attemptReconnect();
        }
      };
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(
          `Попытка переподключения ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
        );
        this.connect().catch(console.error);
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  private handleMessage(rawData: any) {
    // Логируем все входящие сообщения для отладки
    console.log("WebSocket message received:", rawData);

    // Обрабатываем ошибки от бэкенда
    if (rawData.type === "error") {
      const errorMsg = rawData.message || rawData.error || "Неизвестная ошибка";
      console.error("WebSocket error:", errorMsg);
      this.errorHandlers.forEach((handler) => handler(errorMsg));
      return;
    }

    if (rawData.type === "message") {
      // Формат: {type: "message", chat_id, message_id, from, text, time, ...}
      const message: Message = {
        id: rawData.message_id || 0,
        chat_id: rawData.chat_id || 0,
        sender_id: rawData.from || 0,
        text: rawData.text || "",
        time: rawData.time || new Date().toISOString(),
        sender_username: rawData.username || rawData.from_username,
      };
      this.messageHandlers.forEach((handler) => handler(message));
      return;
    }

    if (rawData.type === "chat_list") {
      // Формат: {type: "chat_list", chats: [...], ...}
      console.log(
        "WebSocket: обрабатываем chat_list, handlers:",
        this.chatListHandlers.length
      );
      const chats: Chat[] = (rawData.chats || []).map((chat: any) => ({
        id: chat.chat_id,
        user1_id: 0,
        user2_id: chat.peer_id,
        user2_username: chat.peer_username,
        user2_name: chat.peer_name,
        last_message_time: chat.last_time,
        last_message_text: chat.last_text,
      }));
      console.log("WebSocket: преобразовано чатов:", chats.length);
      this.chatListHandlers.forEach((handler) => {
        console.log("WebSocket: вызываем handler для chat_list");
        handler(chats);
      });
      return;
    }

    if (rawData.type === "history") {
      // Формат: {type: "history", mode: "with_user" | "by_chat", messages: [...], chat_id: ...}
      const messages: Message[] = (rawData.messages || []).map((msg: any) => ({
        id: msg.id,
        chat_id: msg.chat_id || rawData.chat_id || 0,
        sender_id: msg.sender_id,
        text: msg.text,
        time: msg.time,
        sender_username: msg.sender_username,
        sender_name: msg.sender_name,
      }));
      this.historyHandlers.forEach((handler) => handler(messages));
      return;
    }

    if (rawData.type === "user_lookup") {
      // Формат: {type: "user_lookup", user: {...}}
      const user: User | null = rawData.user || null;
      this.userLookupHandlers.forEach((handler) => handler(user));
      return;
    }

    if (rawData.type === "user_search") {
      // Формат: {type: "user_search", results: [...]}
      const users: User[] = rawData.results || [];
      this.userSearchHandlers.forEach((handler) => handler(users));
      return;
    }

    // Обработка delivery сообщений (подтверждение отправки)
    if (rawData.type === "delivery") {
      console.log("Message delivered:", rawData);
      // Преобразуем delivery в сообщение для обновления списка
      const message: Message = {
        id: rawData.message_id || 0,
        chat_id: rawData.chat_id || 0,
        // Если сервер присылает поле `from`, используем его, иначе берём id из cookie
        sender_id: rawData.from || parseInt(Cookies.get("id") || "0"),
        text: rawData.text || "",
        time: rawData.time || new Date().toISOString(),
      };
      // Отправляем как обычное сообщение для обновления UI
      this.messageHandlers.forEach((handler) => handler(message));
      return;
    }

    // Обработка welcome сообщений
    if (rawData.type === "welcome") {
      console.log("WebSocket welcome:", rawData);
      return;
    }

    // Если тип не распознан, логируем предупреждение
    console.warn("Unknown WebSocket message type:", rawData);
  }

  send(message: WebSocketMessage) {
    console.log(
      "ws.send called, ws readyState:",
      this.ws?.readyState,
      "message:",
      message
    );
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const messageStr = JSON.stringify(message);
      console.log("WebSocket sending:", message, "as string:", messageStr);
      try {
        this.ws.send(messageStr);
        console.log("WebSocket: сообщение отправлено успешно");
      } catch (error) {
        console.error("WebSocket: ошибка отправки:", error);
      }
    } else {
      console.error("WebSocket не подключен, состояние:", this.ws?.readyState);
    }
  }

  sendMessage(recipientUsername: string, text: string) {
    console.log("sendMessage called", {
      recipientUsername,
      text,
      wsState: this.ws?.readyState,
    });
    this.send({
      type: "message",
      recipient_username: recipientUsername,
      text,
    });
  }

  requestHistoryWithUser(peerUsername: string, count = 50, beforeId?: number) {
    this.send({
      type: "history_with_user",
      peer_username: peerUsername,
      count,
      before_id: beforeId,
    });
  }

  requestHistoryByChat(chatId: number, count = 50, beforeId?: number) {
    this.send({
      type: "history_by_chat",
      chat_id: chatId,
      count,
      before_id: beforeId,
    });
  }

  requestChatList(count = 50, offset = 0) {
    const message: WebSocketMessage = {
      type: "list_chats",
      count,
      offset,
    };
    console.log("requestChatList: отправляем сообщение", message);
    this.send(message);
  }

  lookupUser(username: string) {
    this.send({
      type: "user_lookup",
      username,
    });
  }

  searchUsers(name: string, count = 10) {
    this.send({
      type: "user_search",
      name,
      count,
    });
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  onChatList(handler: ChatListHandler) {
    this.chatListHandlers.push(handler);
    return () => {
      this.chatListHandlers = this.chatListHandlers.filter(
        (h) => h !== handler
      );
    };
  }

  onUserLookup(handler: UserLookupHandler) {
    this.userLookupHandlers.push(handler);
    return () => {
      this.userLookupHandlers = this.userLookupHandlers.filter(
        (h) => h !== handler
      );
    };
  }

  onUserSearch(handler: UserSearchHandler) {
    this.userSearchHandlers.push(handler);
    return () => {
      this.userSearchHandlers = this.userSearchHandlers.filter(
        (h) => h !== handler
      );
    };
  }

  onHistory(handler: HistoryHandler) {
    this.historyHandlers.push(handler);
    return () => {
      this.historyHandlers = this.historyHandlers.filter((h) => h !== handler);
    };
  }

  onError(handler: ErrorHandler) {
    this.errorHandlers.push(handler);
    return () => {
      this.errorHandlers = this.errorHandlers.filter((h) => h !== handler);
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // Публичный метод для проверки состояния подключения
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WebSocketService();
