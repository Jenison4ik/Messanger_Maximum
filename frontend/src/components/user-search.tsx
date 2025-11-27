import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search } from "lucide-react";
import { wsService } from "@/services/websocket";
import type { User } from "@/types";

interface UserSearchProps {
  onSelectUser: (user: User) => void;
}

export function UserSearch({ onSelectUser }: UserSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Подписываемся на результаты поиска пользователей
    const unsubscribeLookup = wsService.onUserLookup((user: User | null) => {
      if (user) {
        setUsers([user]);
      } else {
        setUsers([]);
      }
      setLoading(false);
    });

    const unsubscribeSearch = wsService.onUserSearch((foundUsers: User[]) => {
      setUsers(foundUsers);
      setLoading(false);
    });

    return () => {
      unsubscribeLookup();
      unsubscribeSearch();
    };
  }, []);

  const handleSearch = (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setUsers([]);
      return;
    }

    if (!wsService.isConnected()) {
      console.error("WebSocket не подключен");
      setLoading(false);
      return;
    }

    setLoading(true);

    // Пробуем сначала точный поиск по username
    if (searchQuery.startsWith("@")) {
      const username = searchQuery.slice(1);
      wsService.lookupUser(username);
    } else {
      // Поиск по имени
      wsService.searchUsers(searchQuery, 10);
    }
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query) {
        handleSearch(query);
      } else {
        setUsers([]);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleSelectUser = (user: User) => {
    onSelectUser(user);
    setOpen(false);
    setQuery("");
    setUsers([]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Search className="h-4 w-4 mr-2" />
          Найти пользователя
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Поиск пользователей</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Введите имя или @username"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
          />
          <ScrollArea className="h-[300px]">
            {loading ? (
              <div className="text-center text-muted-foreground py-4">
                Поиск...
              </div>
            ) : users.length === 0 && query ? (
              <div className="text-center text-muted-foreground py-4">
                Пользователи не найдены
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className="w-full p-3 hover:bg-accent rounded-lg transition-colors text-left flex items-center gap-3"
                  >
                    <Avatar>
                      <AvatarFallback>
                        {user.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{user.name}</div>
                      <div className="text-sm text-muted-foreground">
                        @{user.username}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
