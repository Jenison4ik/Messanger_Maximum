import { useState, useEffect } from "react";
import { ChatList } from "@/components/chat-list";
import { ChatWindow } from "@/components/chat-window";
import { UserSearch } from "@/components/user-search";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { wsService } from "@/services/websocket";
import type { Chat, User } from "@/types";

export function MessengerPage() {
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const { logout, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      // Подключаемся к WebSocket
      wsService.connect().catch((error) => {
        console.error("Ошибка подключения WebSocket:", error);
      });

      // Обработка ошибок WebSocket
      const errorUnsubscribe = wsService.onError((error) => {
        console.error("WebSocket error:", error);
      });

      // Обновляем список чатов при получении обновлений через WebSocket
      const chatListUnsubscribe = wsService.onChatList((chats: Chat[]) => {
        // Можно обновлять список чатов в реальном времени
        console.log("Обновление списка чатов:", chats);
      });

      return () => {
        errorUnsubscribe();
        chatListUnsubscribe();
        wsService.disconnect();
      };
    }
  }, [isAuthenticated]);

  const handleSelectChat = (chat: Chat) => {
    setSelectedChat(chat);
  };

  const handleSelectUser = async (user: User) => {
    // Создаем временный чат для нового пользователя
    // В реальном приложении нужно создать чат через API или найти существующий
    const newChat: Chat = {
      id: 0, // Временный ID
      user1_id: 0,
      user2_id: user.id,
      user2_username: user.username,
      user2_name: user.name,
    };
    setSelectedChat(newChat);
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-80 border-r flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h1 className="text-xl font-bold">⚡️Maximum⚡️</h1>
          <Button variant="ghost" size="icon" onClick={logout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-2">
          <UserSearch onSelectUser={handleSelectUser} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatList
            onSelectChat={handleSelectChat}
            selectedChatId={selectedChat?.id}
          />
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        <ChatWindow
          chat={selectedChat}
          onChatUpdate={(updatedChat) => setSelectedChat(updatedChat)}
        />
      </div>
    </div>
  );
}
