import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MemberRepository } from '../repositories/memberRepository';
import type { Member } from '../types/member';

export const useUpdateMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...updatedData }: Partial<Member> & { id: string }) =>
      MemberRepository.updateMember(id, updatedData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });
};
