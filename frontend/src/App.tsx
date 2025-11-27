import "./App.css";
import { LoginForm } from "./components/login-form";
import { useAuth } from "./contexts/AuthContext";
import { Navigate } from "react-router";

function App() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/messenger" replace />;
  }

  return <LoginForm />;
}

export default App;
