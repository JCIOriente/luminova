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
import { Member } from '../types/member';
import { EditMemberDialog } from './EditMemberDialog';

type Props = {
  members: Member[];
};

export function MemberTable({ members }: Props) {
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
        {members.map((member) => (
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
