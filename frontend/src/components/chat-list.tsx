import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Chat } from "@/types";
import { wsService } from "@/services/websocket";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface ChatListProps {
  onSelectChat: (chat: Chat) => void;
  selectedChatId?: number;
}

export function ChatList({ onSelectChat, selectedChatId }: ChatListProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Подписываемся на обновления списка чатов ПЕРЕД отправкой запроса
    const unsubscribe = wsService.onChatList((receivedChats: Chat[]) => {
      console.log("ChatList: получен список чатов:", receivedChats);
      setChats(receivedChats);
      setLoading(false);
    });

    // Запрашиваем список чатов через WebSocket
    const requestChats = () => {
      if (wsService.isConnected()) {
        console.log("ChatList: запрашиваем список чатов");
        wsService.requestChatList(50, 0);
      } else {
        console.log("ChatList: WebSocket не подключен, ждем...");
        // Если WebSocket еще не подключен, ждем подключения
        const checkConnection = setInterval(() => {
          if (wsService.isConnected()) {
            console.log(
              "ChatList: WebSocket подключен, запрашиваем список чатов"
            );
            wsService.requestChatList(50, 0);
            clearInterval(checkConnection);
          }
        }, 100);

        // Очищаем интервал через 5 секунд
        setTimeout(() => {
          clearInterval(checkConnection);
          if (!wsService.isConnected()) {
            console.error("ChatList: WebSocket не подключился за 5 секунд");
            setLoading(false);
          }
        }, 5000);
      }
    };

    // Небольшая задержка, чтобы убедиться, что подписка установлена
    const timeoutId = setTimeout(() => {
      requestChats();
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  const getChatTitle = (chat: Chat) => {
    // В реальном приложении нужно определить, какой пользователь - это мы
    return (
      chat.user1_name ||
      chat.user1_username ||
      chat.user2_name ||
      chat.user2_username ||
      "Неизвестный"
    );
  };

  const getChatAvatar = (chat: Chat) => {
    const name = getChatTitle(chat);
    return name.charAt(0).toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Загрузка чатов...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">Чаты</h2>
      </div>
      <ScrollArea className="flex-1">
        <div className="divide-y">
          {chats.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              У вас пока нет чатов
            </div>
          ) : (
            chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat)}
                className={cn(
                  "w-full p-4 hover:bg-accent transition-colors text-left",
                  selectedChatId === chat.id && "bg-accent"
                )}
              >
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>{getChatAvatar(chat)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {getChatTitle(chat)}
                    </div>
                    {chat.last_message_text && (
                      <div className="text-sm text-muted-foreground truncate">
                        {chat.last_message_text}
                      </div>
                    )}
                    {chat.last_message_time && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(chat.last_message_time), {
                          addSuffix: true,
                          locale: ru,
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
