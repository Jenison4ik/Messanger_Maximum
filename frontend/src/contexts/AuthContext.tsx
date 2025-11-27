import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import Cookies from "js-cookie";
import { useNavigate } from "react-router";
import type { User } from "@/types";
import { getUsers } from "@/services/api";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  setToken: (token: string | null) => void;
  logout: () => void;
  currentUser: User | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(
    Cookies.get("token") || null
  );
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const navigate = useNavigate();

  const loadCurrentUser = useCallback(async () => {
    try {
      const users = await getUsers();
      // Предполагаем, что текущий пользователь - это первый в списке или делаем отдельный эндпоинт
      // Для простоты берем первого пользователя (в реальности нужен эндпоинт /users/me)
      if (users.length > 0) {
        setCurrentUser(users[0]);
      }
    } catch (error) {
      console.error("Ошибка загрузки текущего пользователя:", error);
    }
  }, []);

  useEffect(() => {
    const savedToken = Cookies.get("token");
    if (savedToken) {
      setTokenState(savedToken);
      loadCurrentUser();
    }
  }, [loadCurrentUser]);

  const setToken = (newToken: string | null) => {
    if (newToken) {
      Cookies.set("token", newToken);
      setTokenState(newToken);
      loadCurrentUser();
    } else {
      Cookies.remove("token");
      setTokenState(null);
      setCurrentUser(null);
    }
  };

  const logout = () => {
    setToken(null);
    navigate("/");
  };

  return (
    <AuthContext.Provider
      value={{
        user: currentUser,
        currentUser,
        isAuthenticated: !!token,
        token,
        setToken,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
