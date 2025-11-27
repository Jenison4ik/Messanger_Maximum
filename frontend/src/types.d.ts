export interface User {
  id: number;
  username: string;
  name: string;
  email: string;
}

export interface Message {
  id: number;
  chat_id: number;
  sender_id: number;
  text: string;
  time: string;
  sender_username?: string;
  sender_name?: string;
}

export interface Chat {
  id: number;
  user1_id: number;
  user2_id: number;
  user1_username?: string;
  user2_username?: string;
  user1_name?: string;
  user2_name?: string;
  last_message_time?: string;
  last_message_text?: string;
}

export interface WebSocketMessage {
  type?:
    | "message"
    | "history_with_user"
    | "history_by_chat"
    | "list_chats"
    | "user_lookup"
    | "user_search";
  recipient_username?: string;
  peer_username?: string;
  chat_id?: number;
  text?: string;
  username?: string;
  name?: string;
  count?: number;
  offset?: number;
  before_id?: number;
}

export interface WebSocketResponse {
  type:
    | "message"
    | "history_with_user"
    | "history_by_chat"
    | "list_chats"
    | "user_lookup"
    | "user_search"
    | "error";
  data?: Message | Message[] | Chat | Chat[] | User | User[] | null;
  error?: string;
}
