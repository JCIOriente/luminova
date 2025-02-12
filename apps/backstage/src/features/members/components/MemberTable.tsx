import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@luminova/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash } from 'lucide-react';
import { MemberRepository } from '../repositories/memberRepository';
import type { Member } from '../types/member';
import { EditMemberDialog } from './EditMemberDialog';
import { LoadingTableRow } from '../../../components/LoadingTableRow';
import { EmptyTableRow } from '../../../components/EmptyTableRow';

type Props = {
  members: Member[];
  isLoading: boolean;
};

export function MemberTable({ members, isLoading }: Props) {
  const queryClient = useQueryClient();
  const deleteMemberMutation = useMutation({
    mutationFn: (id: string) => MemberRepository.deleteMember(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      toast({
        title: 'Success',
        description: 'Member deleted successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete member',
        variant: 'destructive',
      });
    },
  });

  const handleDelete = (id: string) => {
    deleteMemberMutation.mutate(id);
  };

  return (
    <Table className="border">
      <TableHeader className="bg-gray-100">
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Points</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && <LoadingTableRow colSpan={6} />}

        {!isLoading && members.length === 0 && (
          <EmptyTableRow
            colSpan={6}
            text="There are no members to show at this time"
          />
        )}

        {!isLoading &&
          members.length > 0 &&
          members.map((member) => (
            <TableRow key={member.id} className="hover:bg-gray-50">
              <TableCell>{member.name}</TableCell>
              <TableCell>{member.email}</TableCell>
              <TableCell>{member.phone}</TableCell>
              <TableCell>{member.role}</TableCell>
              <TableCell>{member.totalPoints}</TableCell>
              <TableCell>
                <EditMemberDialog member={member} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(member.id)}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}
