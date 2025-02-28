import {
  AddPointRuleDialog,
  PointRuleTable,
  usePointRules,
} from '../features/point-rules';

export default function PointRules() {
  const { data: pointRules = [], isLoading, isError, error } = usePointRules();

  if (isError) {
    return (
      <div className="bg-red-50">
        Error fetching point rules: {error?.message}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 items-center justify-between">
        <h1 className="text-3xl font-bold">Point Rules</h1>
        <AddPointRuleDialog />
      </div>

      <PointRuleTable pointRules={pointRules} isLoading={isLoading} />
    </div>
  );
}
