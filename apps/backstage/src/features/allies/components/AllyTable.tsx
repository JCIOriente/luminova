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
import { EmptyTableRow } from '../../../components/EmptyTableRow'; // Adjust path as needed
import { LoadingTableRow } from '../../../components/LoadingTableRow'; // Adjust path as needed
import { useDeleteAlly } from '../hooks/useDeleteAlly';
import type { Ally } from '../types/ally';
import { EditAllyDialog } from './EditAllyDialog';

type Props = {
  allies: Ally[];
  isLoading: boolean;
};

export function AllyTable({ allies, isLoading }: Props) {
  const deleteAllyMutation = useDeleteAlly();

  const handleDelete = (id: string) => {
    deleteAllyMutation.mutate(id, {
      onSuccess: () => {
        toast({
          title: 'Success',
          description: 'Ally deleted successfully',
        });
      },
      onError: (error) => {
        toast({
          title: 'Error',
          description: `Failed to delete ally: ${error.message}`,
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <Table className="border">
      <TableHeader className="bg-gray-100">
        <TableRow>
          <TableHead>Company Name</TableHead>
          <TableHead>Person in Charge</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && <LoadingTableRow colSpan={5} />}

        {!isLoading && allies.length === 0 && (
          <EmptyTableRow
            colSpan={5}
            text="There are no allies to show at this time."
          />
        )}

        {!isLoading &&
          allies.length > 0 &&
          allies.map((ally) => (
            <TableRow key={ally.id} className="hover:bg-gray-50">
              <TableCell>{ally.companyName}</TableCell>
              <TableCell>{ally.personInCharge}</TableCell>
              <TableCell>{ally.phone}</TableCell>
              <TableCell>{ally.email}</TableCell>
              <TableCell className="flex items-center gap-2">
                <EditAllyDialog ally={ally} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(ally.id)}
                  disabled={deleteAllyMutation.isPending}
                >
                  <Trash className="h-4 w-4 text-red-500" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}