import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  toast,
} from '@luminova/ui';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useUpdatePointRule } from '../hooks/useUpdatePointRule';
import type { PointRule, PointRuleInput } from '../types/pointRule';
import { PointRuleForm } from './PointRuleForm';

type Props = {
  pointRule: PointRule;
};

export function UpdatePointRuleDialog({ pointRule }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const updateEventMutation = useUpdatePointRule();

  const handleSubmit = (values: PointRuleInput) => {
    updateEventMutation.mutate(
      {
        id: pointRule.id,
        ...values,
      },
      {
        onSuccess: () => {
          toast({
            title: 'Success',
            description: 'Point Rule updated successfully',
          });
          setIsOpen(false);
        },
        onError: () => {
          toast({
            title: 'Error',
            description: 'Failed to update a point rule',
            variant: 'destructive',
          });
        },
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Point Rule</DialogTitle>
        </DialogHeader>
        <PointRuleForm
          onSubmit={handleSubmit}
          isLoading={updateEventMutation.isPending}
          initialValues={pointRule}
        />
      </DialogContent>
    </Dialog>
  );
}
