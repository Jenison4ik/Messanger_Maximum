import Cookies from "js-cookie";
import type { User, Chat, Message } from "@/types";

const API_BASE = "/api";

function getAuthHeaders(): HeadersInit {
  const token = Cookies.get("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function registerUser(
  name: string,
  username: string,
  email: string,
  password: string
): Promise<{ token: string }> {
  const response = await fetch(`${API_BASE}/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, username, email, password }),
  });

  if (!response.ok) {
    let errorMessage = "Ошибка регистрации";
    try {
      const error = await response.json();
      errorMessage = error.error || error.message || errorMessage;
      if (error.duplicate) {
        errorMessage = `Этот ${error.duplicate} уже используется`;
      }
    } catch {
      errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ token: string }> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    let errorMessage = "Ошибка входа";
    try {
      const error = await response.json();
      errorMessage = error.error || error.message || errorMessage;
    } catch {
      if (response.status === 401) {
        errorMessage = "Неверный email или пароль";
      } else {
        errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
      }
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

export async function getUsers(): Promise<User[]> {
  const response = await fetch(`${API_BASE}/users`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Ошибка получения пользователей");
  }

  const data = await response.json();
  return data.users || [];
}

export async function getChats(count = 50, offset = 0): Promise<Chat[]> {
  const response = await fetch(
    `${API_BASE}/chats?count=${count}&offset=${offset}`,
    {
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error("Ошибка получения чатов");
  }

  const data = await response.json();
  // Преобразуем формат ответа бэкенда в формат Chat
  const chats: Chat[] = (data.chats || []).map((chat: any) => ({
    id: chat.chat_id,
    user1_id: 0,
    user2_id: chat.peer_id,
    user2_username: chat.peer_username,
    user2_name: chat.peer_name,
    last_message_time: chat.last_time,
    last_message_text: chat.last_text,
  }));
  return chats;
}

export async function getChatMessages(
  chatId: number,
  count = 50,
  beforeId?: number
): Promise<Message[]> {
  const params = new URLSearchParams({ count: count.toString() });
  if (beforeId) {
    params.append("before_id", beforeId.toString());
  }

  const response = await fetch(
    `${API_BASE}/chats/${chatId}/messages?${params}`,
    {
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error("Ошибка получения сообщений");
  }

  const data = await response.json();
  return data.messages || [];
}

export async function getChatMessagesWithUser(
  username: string,
  count = 50,
  beforeId?: number
): Promise<Message[]> {
  const params = new URLSearchParams({ count: count.toString() });
  if (beforeId) {
    params.append("before_id", beforeId.toString());
  }

  const response = await fetch(
    `${API_BASE}/chats/with/${username}/messages?${params}`,
    {
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error("Ошибка получения сообщений");
  }

  const data = await response.json();
  return data.messages || [];
}

export async function lookupUser(username: string): Promise<User | null> {
  const response = await fetch(`${API_BASE}/users/lookup/${username}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error("Ошибка поиска пользователя");
  }

  return response.json();
}

export async function searchUsers(name: string, count = 10): Promise<User[]> {
  const params = new URLSearchParams({ name, count: count.toString() });
  const response = await fetch(`${API_BASE}/users/search?${params}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Ошибка поиска пользователей");
  }

  const data = await response.json();
  return data.results || [];
}
