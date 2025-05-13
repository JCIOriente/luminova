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
import type { Member } from '../types/member';
import { MemberForm } from './MemberForm';
import { useUpdateMember } from '../hooks/useUpdateMember';

interface EditMemberDialogProps {
  member: Member;
}

export function EditMemberDialog({ member }: EditMemberDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const updateMemberMutation = useUpdateMember();

  const handleSubmit = (values: Omit<Member, 'id'>) => {
    updateMemberMutation.mutate(
      { ...values, id: member.id },
      {
        onSuccess: () => {
          toast({
            title: 'Success',
            description: 'Member updated successfully',
          });
          setIsOpen(false);
        },
        onError: (error) => {
          toast({
            title: 'Error',
            description: `Failed to update member: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
          <DialogTitle>Edit Member</DialogTitle>
        </DialogHeader>
        <MemberForm
          onSubmit={handleSubmit}
          isLoading={updateMemberMutation.isPending}
          initialValues={member} // Pass initial values for editing
        />
      </DialogContent>
    </Dialog>
  );
}
