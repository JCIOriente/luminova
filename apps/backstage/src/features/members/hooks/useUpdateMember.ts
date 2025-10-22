import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MemberRepository } from '../repositories/memberRepository';
import type { Member, MemberInput } from '../types/member';

type UpdateMemberPayload = Partial<
  MemberInput & Pick<Member, 'totalPoints' | 'active'>
> & { id: string };

export const useUpdateMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...updatedData }: UpdateMemberPayload) =>
      MemberRepository.updateMember(id, updatedData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });
};
