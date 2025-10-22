import { useQuery } from '@tanstack/react-query';
import {
  MemberRepository,
  type MembersPage,
} from '../repositories/memberRepository';

export const useMembers = () => {
  const pageSize = 100;

  return useQuery<MembersPage>({
    queryKey: ['members', 'all'],
    queryFn: () => MemberRepository.getMembers(pageSize, null),
  });
};
