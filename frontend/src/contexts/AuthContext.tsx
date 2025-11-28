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
import { getMyData } from "@/services/api";

interface AuthContextType {
  user: User | null;
  currentUser: User | null;
  isAuthenticated: boolean;

  token: string | null;
  id: string | null;

  setToken: (token: string | null) => void;
  setId: (id: string | null) => void;

  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(
    Cookies.get("token") || null
  );
  const [id, setIdState] = useState<string | null>(Cookies.get("id") || null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const navigate = useNavigate();

  const loadCurrentUser = useCallback(async () => {
    try {
      const id = await getMyData();
      if (id) {
        setCurrentUser({ id: parseInt(id), username: id, name: "", email: "" });
      }
    } catch (error) {
      console.error("Ошибка загрузки текущего пользователя:", error);
    }
  }, []);

  useEffect(() => {
    const savedToken = Cookies.get("token");
    const savedId = Cookies.get("id");

    if (savedToken) {
      setTokenState(savedToken);
      if (savedId) setIdState(savedId);
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

  const setId = (newId: string | null) => {
    if (newId) {
      Cookies.set("id", newId);
      setIdState(newId);
    } else {
      Cookies.remove("id");
      setIdState(null);
    }
  };

  const logout = () => {
    setToken(null);
    setId(null);
    navigate("/");
  };

  return (
    <AuthContext.Provider
      value={{
        user: currentUser,
        currentUser,
        isAuthenticated: !!token,

        token,
        id,

        setToken,
        setId,

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
