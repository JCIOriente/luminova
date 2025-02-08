import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@luminova/ui';
import { Trash } from 'lucide-react';
import { Member } from '../types/member';
import { EditMemberDialog } from './EditMemberDialog';

type Props = {
  members: Member[];
  onDelete: (id?: string) => void;
};

export function MemberTable({ members, onDelete }: Props) {
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
                onClick={() => onDelete(member.id)}
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
