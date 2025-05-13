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
import type { MemberInput } from '../types/member';
import { MemberForm } from './MemberForm';
import { useAddMember } from '../hooks/useAddMember';

export function AddMemberDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const addMemberMutation = useAddMember();

  const handleSubmit = (values: MemberInput) => {
    addMemberMutation.mutate(values, {
      onSuccess: () => {
        toast({
          title: 'Success',
          description: 'Member added successfully',
        });
        setIsOpen(false);
      },
      onError: (error) => {
        toast({
          title: 'Error',
          description: `Failed to add member: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>Add Member</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Member</DialogTitle>
        </DialogHeader>
        <MemberForm
          onSubmit={handleSubmit}
          isLoading={addMemberMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
