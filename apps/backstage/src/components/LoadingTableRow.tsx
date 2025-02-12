import { Spinner, TableRow, TableCell } from '@luminova/ui';

export const LoadingTableRow = ({ colSpan }: { colSpan: number }) => {
  return (
    <TableRow>
      <TableCell colSpan={colSpan}>
        <Spinner className="h-8 w-8" />
      </TableCell>
    </TableRow>
  );
};
