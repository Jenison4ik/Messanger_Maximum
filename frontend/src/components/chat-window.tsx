import { useEffect, useState, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import type { Chat, Message } from "@/types";
import { wsService } from "@/services/websocket";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface ChatWindowProps {
  chat: Chat | null;
  onChatUpdate?: (chat: Chat) => void;
}

export function ChatWindow({ chat, onChatUpdate }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { currentUser } = useAuth();

  useEffect(() => {
    if (chat) {
      loadMessages();
    } else {
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat]);

  useEffect(() => {
    // Подписываемся на новые сообщения
    const unsubscribeMessage = wsService.onMessage((message: Message) => {
      if (chat) {
        // Проверяем, относится ли сообщение к текущему чату
        const isCurrentChat =
          message.chat_id === chat.id ||
          (!chat.id &&
            (message.sender_id === chat.user2_id ||
              message.sender_id === chat.user1_id));

        if (isCurrentChat) {
          setMessages((prev) => {
            // Проверяем, нет ли уже такого сообщения (по ID или по временному ID)
            const existingIndex = prev.findIndex(
              (m) =>
                m.id === message.id ||
                (m.id > 1000000000000 && // Временный ID (timestamp)
                  Math.abs(
                    new Date(m.time).getTime() -
                      new Date(message.time).getTime()
                  ) < 1000 &&
                  m.text === message.text)
            );

            if (existingIndex >= 0) {
              // Заменяем временное сообщение на реальное
              const updated = [...prev];
              updated[existingIndex] = message;
              return updated.sort(
                (a, b) =>
                  new Date(a.time).getTime() - new Date(b.time).getTime()
              );
            }

            return [...prev, message].sort(
              (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
            );
          });
          scrollToBottom();
        }
      }
    });

    // Подписываемся на историю сообщений
    const unsubscribeHistory = wsService.onHistory(
      (historyMessages: Message[]) => {
        if (chat) {
          // Обновляем chat_id для нового чата, если он был получен
          const sortedMessages = historyMessages.sort(
            (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
          );

          // Если у чата нет id, но в сообщениях есть chat_id, обновляем чат
          if (
            !chat.id &&
            sortedMessages.length > 0 &&
            sortedMessages[0].chat_id &&
            onChatUpdate
          ) {
            const updatedChat = { ...chat, id: sortedMessages[0].chat_id };
            onChatUpdate(updatedChat);
          }

          setMessages(sortedMessages);
          scrollToBottom();
          setLoading(false);
        }
      }
    );

    return () => {
      unsubscribeMessage();
      unsubscribeHistory();
    };
  }, [chat]);

  const loadMessages = () => {
    if (!chat) return;

    setLoading(true);

    // Запрашиваем историю через WebSocket
    const requestHistory = () => {
      if (wsService.isConnected()) {
        if (chat.id && chat.id > 0) {
          // Запрашиваем историю по chat_id
          wsService.requestHistoryByChat(chat.id, 50);
        } else {
          // Запрашиваем историю по username
          const username = chat.user1_username || chat.user2_username;
          if (username) {
            wsService.requestHistoryWithUser(username, 50);
          } else {
            setLoading(false);
          }
        }
      } else {
        // Если WebSocket еще не подключен, ждем подключения
        const checkConnection = setInterval(() => {
          if (wsService.isConnected()) {
            if (chat.id && chat.id > 0) {
              wsService.requestHistoryByChat(chat.id, 50);
            } else {
              const username = chat.user1_username || chat.user2_username;
              if (username) {
                wsService.requestHistoryWithUser(username, 50);
              }
            }
            clearInterval(checkConnection);
          }
        }, 100);

        // Очищаем интервал через 5 секунд
        setTimeout(() => {
          clearInterval(checkConnection);
          setLoading(false);
        }, 5000);
      }
    };

    requestHistory();
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollAreaRef.current) {
        const scrollContainer = scrollAreaRef.current.querySelector(
          "[data-radix-scroll-area-viewport]"
        );
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      }
    }, 100);
  };

  const handleSend = () => {
    if (!input.trim() || !chat || !currentUser) return;

    const recipientUsername = chat.user1_username || chat.user2_username;
    if (!recipientUsername) return;

    const messageText = input.trim();

    // Оптимистичное обновление - сразу добавляем сообщение в список
    const optimisticMessage: Message = {
      id: Date.now(), // Временный ID
      chat_id: chat.id || 0,
      sender_id: currentUser.id,
      text: messageText,
      time: new Date().toISOString(),
      sender_username: currentUser.username,
    };

    setMessages((prev) => {
      // Проверяем, нет ли уже такого сообщения
      if (prev.some((m) => m.id === optimisticMessage.id)) {
        return prev;
      }
      return [...prev, optimisticMessage].sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
      );
    });
    scrollToBottom();

    // Очищаем поле ввода
    setInput("");

    // Отправляем сообщение через WebSocket
    wsService.sendMessage(recipientUsername, messageText);

    // Обновляем список чатов после отправки сообщения
    // Это обновит последнее сообщение в списке чатов
    setTimeout(() => {
      if (wsService.isConnected()) {
        wsService.requestChatList(50, 0);
      }
    }, 500);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getChatTitle = (chat: Chat) => {
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

  if (!chat) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Выберите чат для начала общения
      </div>
    );
  }

  const isOwnMessage = (message: Message) => {
    return message.sender_id === currentUser?.id;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b flex items-center gap-3">
        <Avatar>
          <AvatarFallback>{getChatAvatar(chat)}</AvatarFallback>
        </Avatar>
        <div>
          <div className="font-semibold">{getChatTitle(chat)}</div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="space-y-4">
          {loading ? (
            <div className="text-center text-muted-foreground">
              Загрузка сообщений...
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground">
              Начните разговор, отправив сообщение
            </div>
          ) : (
            messages.map((message) => {
              const isOwn = isOwnMessage(message);
              const senderName =
                message.sender_name || message.sender_username || "Неизвестный";
              return (
                <div
                  key={message.id}
                  className={`flex ${
                    isOwn ? "justify-end" : "justify-start"
                  } items-end gap-2`}
                >
                  {!isOwn && (
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {senderName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-2 ${
                      isOwn
                        ? "bg-sky-500 text-white rounded-br-none"
                        : "bg-muted rounded-bl-none"
                    }`}
                  >
                    {!isOwn && (
                      <div className="text-xs font-semibold mb-1 text-muted-foreground">
                        {senderName}
                      </div>
                    )}
                    <div className="break-words">{message.text}</div>
                    <div
                      className={`text-xs mt-1 ${
                        isOwn ? "text-white/70" : "text-muted-foreground"
                      }`}
                    >
                      {format(new Date(message.time), "HH:mm", { locale: ru })}
                    </div>
                  </div>
                  {isOwn && (
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-sky-500 text-white">
                        {currentUser?.name?.charAt(0).toUpperCase() ||
                          currentUser?.username?.charAt(0).toUpperCase() ||
                          "Я"}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Введите сообщение..."
            rows={1}
            className="resize-none"
          />
          <Button onClick={handleSend} disabled={!input.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
