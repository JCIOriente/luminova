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
import { useAddAlly } from '../hooks/useAddAlly';
import type { AllyInput } from '../types/ally';
import { AllyForm } from './AllyForm';

export function AddAllyDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const addAllyMutation = useAddAlly();

  const handleSubmit = (values: AllyInput) => {
    addAllyMutation.mutate(values, {
      onSuccess: () => {
        toast({
          title: 'Success',
          description: 'Ally added successfully',
        });
        setIsOpen(false);
      },
      onError: (error) => {
        toast({
          title: 'Error',
          description: `Failed to add ally: ${error.message}`,
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>Add Ally</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Ally</DialogTitle>
        </DialogHeader>
        <AllyForm
          onSubmit={handleSubmit}
          isLoading={addAllyMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}