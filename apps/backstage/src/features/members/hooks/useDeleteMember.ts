import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MemberRepository } from '../repositories/memberRepository';

export const useDeleteMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => MemberRepository.deleteMember(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });
};
