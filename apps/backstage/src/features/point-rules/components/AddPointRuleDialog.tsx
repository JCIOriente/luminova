import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  toast,
} from '@luminova/ui';
import { useState } from 'react';
import { useAddPointRule } from '../hooks/useAddPointRule';
import type { PointRuleInput } from '../types/pointRule';
import { PointRuleForm } from './PointRuleForm';

export function AddPointRuleDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const addEventMutation = useAddPointRule();

  const handleSubmit = (values: PointRuleInput) => {
    addEventMutation.mutate(values, {
      onSuccess: () => {
        toast({
          title: 'Success',
          description: 'Point Rule added successfully',
        });
        setIsOpen(false);
      },
      onError: () => {
        toast({
          title: 'Error',
          description: 'Failed to add a point rule',
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>Add Point Rule</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Point Rule</DialogTitle>
        </DialogHeader>
        <PointRuleForm
          onSubmit={handleSubmit}
          isLoading={addEventMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
