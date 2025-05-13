import { Button } from '@luminova/ui';
import { AddAllyDialog, AllyTable, useAllies } from '../features/allies'; // Ensure path is correct

export default function Allies() {
  const { data: allies, isLoading, isError, error } = useAllies();

  if (isError) {
    return (
      <div className="bg-red-50 p-4 text-red-700">
        Error fetching allies: {error?.message}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Allies</h1>
        <AddAllyDialog />
      </div>
      <AllyTable allies={allies || []} isLoading={isLoading} />
      {/* You can add pagination controls here if you implement usePaginatedAllies */}
    </div>
  );
}