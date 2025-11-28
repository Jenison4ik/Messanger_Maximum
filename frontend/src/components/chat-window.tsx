import { useEffect, useState, useRef, useCallback } from "react";
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
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { currentUser } = useAuth();
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollHeightBeforePaginationRef = useRef(0);

  // Коллбэк для прокрутки вниз
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      const viewport = scrollAreaRef.current?.querySelector(
        "[data-radix-scroll-area-viewport]"
      ) as HTMLElement;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }, 50);
  }, []);

  // Коллбэк для загрузки сообщений
  const loadMessages = useCallback(() => {
    if (!chat) return;

    console.log("ChatWindow: загружаем сообщения");
    setLoading(true);

    const doRequest = () => {
      if (wsService.isConnected()) {
        if (chat.id && chat.id > 0) {
          console.log("ChatWindow: запрос по chat_id", chat.id);
          wsService.requestHistoryByChat(chat.id, 50);
        } else {
          const username = chat.user1_username || chat.user2_username;
          if (username) {
            console.log("ChatWindow: запрос по username", username);
            wsService.requestHistoryWithUser(username, 50);
          } else {
            setLoading(false);
          }
        }
      } else {
        const timer = setInterval(() => {
          if (wsService.isConnected()) {
            if (chat.id && chat.id > 0) {
              wsService.requestHistoryByChat(chat.id, 50);
            } else {
              const username = chat.user1_username || chat.user2_username;
              if (username) {
                wsService.requestHistoryWithUser(username, 50);
              }
            }
            clearInterval(timer);
          }
        }, 100);

        setTimeout(() => {
          clearInterval(timer);
          setLoading(false);
        }, 5000);
      }
    };

    doRequest();
  }, [chat]);

  // EFFECT 1: Переключение чата
  useEffect(() => {
    if (chat) {
      console.log("ChatWindow: смена чата");
      setMessages([]);
      setLoading(true);
      setLoadingOlder(false);
      loadMessages();
    } else {
      setMessages([]);
    }
  }, [chat?.id, chat?.user2_id, loadMessages]);

  // EFFECT 1b: Прокрутка в низ при загрузке сообщений
  useEffect(() => {
    if (!loading && messages.length > 0) {
      console.log("ChatWindow: загрузка завершена, прокручиваем в низ");
      scrollToBottom();
    }
  }, [loading, messages.length, scrollToBottom]);

  // EFFECT 1c: Восстановление позиции скролла при пагинации
  useEffect(() => {
    if (!loadingOlder) return;

    // Небольшая задержка для рендеринга новых сообщений
    const timer = setTimeout(() => {
      const viewport = scrollAreaRef.current?.querySelector(
        "[data-radix-scroll-area-viewport]"
      ) as HTMLElement;

      if (viewport && scrollHeightBeforePaginationRef.current > 0) {
        // Вычисляем разницу в высоте
        const scrollContent = viewport.querySelector(
          "[style*='transform']"
        )?.parentElement;
        if (scrollContent) {
          const newHeight = scrollContent.scrollHeight;
          const heightDifference =
            newHeight - scrollHeightBeforePaginationRef.current;

          // Восстанавливаем позицию скролла, добавив разницу в высоте
          viewport.scrollTop += heightDifference;
          console.log(
            "ChatWindow: восстановлена позиция скролла, разница:",
            heightDifference
          );
        }
        scrollHeightBeforePaginationRef.current = 0;
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [loadingOlder]);

  // EFFECT 2: WebSocket подписки
  useEffect(() => {
    if (!chat) return;

    console.log("ChatWindow: устанавливаем WebSocket подписки");

    const unsubscribeMessage = wsService.onMessage((message: Message) => {
      const isCurrentChat =
        message.chat_id === chat.id ||
        (!chat.id &&
          (message.sender_id === chat.user2_id ||
            message.sender_id === chat.user1_id));

      if (isCurrentChat) {
        console.log("ChatWindow: новое сообщение", message.id, message.text);
        setMessages((prev) => {
          const existingIndex = prev.findIndex(
            (m) =>
              m.id === message.id ||
              (m.id > 1000000000000 &&
                Math.abs(
                  new Date(m.time).getTime() - new Date(message.time).getTime()
                ) < 1000 &&
                m.text === message.text)
          );

          let updated: Message[] = prev;
          if (existingIndex >= 0) {
            updated = [...prev];
            updated[existingIndex] = message;
          } else {
            updated = [...prev, message];
          }

          const sorted = updated.sort(
            (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
          );

          if (onChatUpdate && sorted.length > 0) {
            const lastMsg = sorted[sorted.length - 1];
            const updatedChat: Chat = {
              ...chat,
              last_message_text: lastMsg.text,
              last_message_time: lastMsg.time,
            };
            onChatUpdate(updatedChat);
          }

          return sorted;
        });
        scrollToBottom();
      }
    });

    const unsubscribeHistory = wsService.onHistory(
      (historyMessages: Message[]) => {
        if (historyMessages.length === 0) {
          setLoading(false);
          setLoadingOlder(false);
          return;
        }

        const sortedMessages = historyMessages.sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );

        setMessages((prev) => {
          // НАЧАЛЬНАЯ ЗАГРУЗКА
          if (prev.length === 0) {
            console.log(
              "ChatWindow: начальная загрузка",
              sortedMessages.length
            );

            if (
              !chat.id &&
              sortedMessages.length > 0 &&
              sortedMessages[0].chat_id &&
              onChatUpdate
            ) {
              const updatedChat = {
                ...chat,
                id: sortedMessages[0].chat_id,
              };
              onChatUpdate(updatedChat);
            }

            setLoading(false);
            return sortedMessages;
          }

          // ПАГИНАЦИЯ
          console.log(
            "ChatWindow: пагинация - добавляем",
            sortedMessages.length,
            "старых сообщений"
          );

          const oldestCurrentId = prev[0]?.id || 0;
          const newestLoadedId =
            sortedMessages[sortedMessages.length - 1]?.id || 0;

          if (newestLoadedId > 0 && newestLoadedId < oldestCurrentId) {
            // Сохраняем высоту контента ДО добавления новых сообщений
            const viewport = scrollAreaRef.current?.querySelector(
              "[data-radix-scroll-area-viewport]"
            ) as HTMLElement;

            if (viewport) {
              const scrollContent = viewport.querySelector(
                "[style*='transform']"
              )?.parentElement;
              if (scrollContent) {
                scrollHeightBeforePaginationRef.current =
                  scrollContent.scrollHeight;
              }
            }

            const combined = [...sortedMessages, ...prev];
            const uniqueMessages = combined.reduce((acc: Message[], msg) => {
              if (!acc.find((m) => m.id === msg.id)) {
                acc.push(msg);
              }
              return acc;
            }, []);

            setLoadingOlder(false);
            return uniqueMessages.sort(
              (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
            );
          }

          setLoading(false);
          setLoadingOlder(false);
          return sortedMessages;
        });
      }
    );

    return () => {
      console.log("ChatWindow: удаляем WebSocket подписки");
      unsubscribeMessage();
      unsubscribeHistory();
    };
  }, [chat, onChatUpdate, scrollToBottom]);

  // EFFECT 3: Scroll listener для пагинации
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLElement;

    if (!viewport) return;

    const handleScroll = () => {
      // Очищаем предыдущий таймаут
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Если пользователь прокрутил в верх (200px от края)
      if (
        viewport.scrollTop < 200 &&
        !loadingOlder &&
        !loading &&
        messages.length > 0
      ) {
        // Debounce: ждем 300ms после последнего скролла
        scrollTimeoutRef.current = setTimeout(() => {
          console.log(
            "ChatWindow: пользователь в верху, загружаем старые сообщения"
          );
          setLoadingOlder(true);

          const oldestMessage = messages[0];
          if (chat?.id && chat.id > 0) {
            wsService.requestHistoryByChat(chat.id, 30, oldestMessage.id);
          } else {
            const username = chat?.user1_username || chat?.user2_username;
            if (username) {
              wsService.requestHistoryWithUser(username, 30, oldestMessage.id);
            }
          }
        }, 300);
      }
    };

    viewport.addEventListener("scroll", handleScroll);
    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [
    chat?.id,
    chat?.user1_username,
    chat?.user2_username,
    loadingOlder,
    loading,
    messages.length,
    messages,
  ]);

  const handleSend = () => {
    if (!input.trim() || !chat || !currentUser) return;

    const recipientUsername = chat.user1_username || chat.user2_username;
    if (!recipientUsername) return;

    const messageText = input.trim();

    const optimisticMessage: Message = {
      id: Date.now(),
      chat_id: chat.id || 0,
      sender_id: currentUser.id,
      text: messageText,
      time: new Date().toISOString(),
      sender_username: currentUser.username,
    };

    setMessages((prev) => {
      if (prev.some((m) => m.id === optimisticMessage.id)) {
        return prev;
      }
      return [...prev, optimisticMessage].sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
      );
    });
    scrollToBottom();

    setInput("");
    wsService.sendMessage(recipientUsername, messageText);

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
    <div className="flex flex-col h-full w-full">
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
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4 overflow-y-scroll">
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
            <>
              {loadingOlder && (
                <div className="text-center text-muted-foreground text-sm">
                  Загрузка старых сообщений...
                </div>
              )}
              {messages.map((message) => {
                const isOwn = isOwnMessage(message);
                const senderName =
                  message.sender_name ||
                  message.sender_username ||
                  "Неизвестный";
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
                      <div className="wrap-break-word">{message.text}</div>
                      <div
                        className={`text-xs mt-1 ${
                          isOwn ? "text-white/70" : "text-muted-foreground"
                        }`}
                      >
                        {format(new Date(message.time), "HH:mm", {
                          locale: ru,
                        })}
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
              })}
            </>
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
