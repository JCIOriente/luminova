import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AuthService } from "../services/authService";
import type { AuthUser, LoginCredentials } from "../types/auth";

export const useLogin = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (credentials: LoginCredentials) =>
      AuthService.login(credentials),
    onSuccess: (data: AuthUser) => {
      queryClient.setQueryData(["auth"], data);
      navigate("/"); // Navigate to the dashboard or desired route
    },
  });
};
