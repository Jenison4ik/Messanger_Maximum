import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { createBrowserRouter, RouterProvider, Outlet } from "react-router";
import { SignupForm } from "./components/signup-form.tsx";
import { MessengerPage } from "./pages/messenger.tsx";
import { ProtectedRoute } from "./components/protected-route.tsx";
import { AuthProvider } from "./contexts/AuthContext.tsx";

const RootLayout = () => {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
};

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: "/",
        element: <App />,
      },
      {
        path: "/signup",
        element: <SignupForm />,
      },
      {
        path: "/messenger",
        element: (
          <ProtectedRoute>
            <MessengerPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
