import { createContext, useContext, useEffect, useState } from "react";

import {
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
} from "../services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const response = await getCurrentUser();
        setUser(response.user);
      } catch (error) {
        if (error.status !== 401) {
          console.error("Failed to restore auth session:", error);
        }

        setUser(null);
      } finally {
        setIsInitializing(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (credentials) => {
    const response = await loginUser(credentials);
    setUser(response.user);
    return response.user;
  };

  const register = async (payload) => {
    const response = await registerUser(payload);
    setUser(response.user);
    return response.user;
  };

  const logout = async () => {
    try {
      await logoutUser();
    } catch (error) {
      if (error.status !== 401) {
        console.error("Logout request failed:", error);
      }
    } finally {
      setUser(null);
    }
  };

  const refreshUser = async () => {
    const response = await getCurrentUser();
    setUser(response.user);
    return response.user;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isInitializing,
        isAuthenticated: Boolean(user),
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }

  return context;
}
