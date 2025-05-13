import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MemberRepository } from '../repositories/memberRepository';
import type { MemberInput } from '../types/member';

export const useAddMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (member: MemberInput) => MemberRepository.addMember(member),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });
};
