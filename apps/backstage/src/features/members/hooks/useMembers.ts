import { useQuery } from '@tanstack/react-query';
import { MemberRepository } from '../repositories/memberRepository';

export const useMembers = () => {
  const pageSize = 100;

  return useQuery({
    queryKey: ['members', 'all'],
    queryFn: () => MemberRepository.getMembers(pageSize, null),
  });
};
