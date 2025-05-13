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
import { Trash } from 'lucide-react';
import type { Member } from '../types/member';
import { EditMemberDialog } from './EditMemberDialog';
import { LoadingTableRow } from '../../../components/LoadingTableRow';
import { EmptyTableRow } from '../../../components/EmptyTableRow';
import { useDeleteMember } from '../hooks/useDeleteMember';

type Props = {
  members: Member[];
  isLoading: boolean;
};

export function MemberTable({ members, isLoading }: Props) {
  const deleteMemberMutation = useDeleteMember();

  const handleDelete = (id: string) => {
    deleteMemberMutation.mutate(id, {
      onSuccess: () => {
        toast({
          title: 'Success',
          description: 'Member deleted successfully',
        });
      },
      onError: (error) => {
        toast({
          title: 'Error',
          description: `Failed to delete member: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: 'destructive',
        });
      },
    });
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
