import { TableRow, TableCell } from '@luminova/ui';

interface EmptyTableRowProps {
  colSpan: number;
  text: string;
}

export const EmptyTableRow = ({ colSpan, text }: EmptyTableRowProps) => {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center text-gray-500">
        {text}
      </TableCell>
    </TableRow>
  );
};
