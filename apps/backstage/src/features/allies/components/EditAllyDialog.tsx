import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  toast,
} from '@luminova/ui';
import { Pencil } from 'lucide-react'; // Assuming you use lucide-react for icons
import { useState } from 'react';
import { useUpdateAlly } from '../hooks/useUpdateAlly';
import type { Ally, AllyInput } from '../types/ally';
import { AllyForm } from './AllyForm';

type EditAllyDialogProps = {
  ally: Ally; // The ally to be edited
};

export function EditAllyDialog({ ally }: EditAllyDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const updateAllyMutation = useUpdateAlly();

  const handleSubmit = (values: AllyInput) => {
    updateAllyMutation.mutate(
      { id: ally.id, ...values },
      {
        onSuccess: () => {
          toast({
            title: 'Success',
            description: 'Ally updated successfully',
          });
          setIsOpen(false);
        },
        onError: (error) => {
          toast({
            title: 'Error',
            description: `Failed to update ally: ${error.message}`,
            variant: 'destructive',
          });
        },
      },
    );
  };

  // Prepare initial values for the form by excluding the 'id'
  const initialFormValues: AllyInput = {
    companyName: ally.companyName,
    personInCharge: ally.personInCharge,
    phone: ally.phone,
    email: ally.email,
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
          <DialogTitle>Edit Ally</DialogTitle>
        </DialogHeader>
        <AllyForm
          onSubmit={handleSubmit}
          isLoading={updateAllyMutation.isPending}
          initialValues={initialFormValues}
        />
      </DialogContent>
    </Dialog>
  );
}
