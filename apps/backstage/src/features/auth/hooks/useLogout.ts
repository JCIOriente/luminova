import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AuthService } from "../services/authService";

export const useLogout = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => AuthService.logout(),
    onSuccess: () => {
      queryClient.setQueryData(["auth"], null);
    },
  });
};
