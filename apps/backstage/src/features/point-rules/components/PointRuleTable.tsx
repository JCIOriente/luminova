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
import { EmptyTableRow } from '../../../components/EmptyTableRow';
import { LoadingTableRow } from '../../../components/LoadingTableRow';
import { useDeletePointRule } from '../hooks/useDeletePointRule';
import type { PointRule } from '../types/pointRule';
import { UpdatePointRuleDialog } from './UpdatePointRuleDialog';

type Props = {
  pointRules: PointRule[];
  isLoading: boolean;
};

export function PointRuleTable({ pointRules, isLoading }: Props) {
  const deletePointsTableMutation = useDeletePointRule();

  const handleDelete = (id: string) => {
    deletePointsTableMutation.mutate(id, {
      onSuccess: () => {
        toast({
          title: 'Success',
          description: 'Point rule deleted successfully',
        });
      },
      onError: () => {
        toast({
          title: 'Error',
          description: 'Failed to delete a point rule',
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <Table className="border">
      <TableHeader className="bg-gray-100">
        <TableRow>
          <TableHead>Description</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Points</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && <LoadingTableRow colSpan={7} />}

        {!isLoading && pointRules.length === 0 && (
          <EmptyTableRow
            colSpan={3}
            text="There are no events to show at this time"
          />
        )}

        {!isLoading &&
          pointRules.length > 0 &&
          pointRules.map((pointRule) => (
            <TableRow key={pointRule.id} className="hover:bg-gray-50">
              <TableCell>{pointRule.description}</TableCell>
              <TableCell>{pointRule.type}</TableCell>
              <TableCell>{pointRule.role}</TableCell>
              <TableCell>{pointRule.points}</TableCell>
              <TableCell className="flex items-center gap-2">
                <UpdatePointRuleDialog pointRule={pointRule} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(pointRule.id)}
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
