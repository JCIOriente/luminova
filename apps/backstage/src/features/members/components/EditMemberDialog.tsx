import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  toast,
} from '@luminova/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { MemberRepository } from '../repositories/memberRepository';
import type { Member } from '../types/member';
import { MemberForm } from './MemberForm';

type EditMemberDialogProps = {
  member: Member;
};

export function EditMemberDialog({ member }: EditMemberDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const updateMemberMutation = useMutation({
    mutationFn: (updateMember: Partial<Member>) =>
      MemberRepository.updateMember(member.id, updateMember),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      toast({
        title: 'Success',
        description: 'Member updated successfully',
      });
      setIsOpen(false);
    },
    onError: (error) => {
      console.log(error);
      toast({
        title: 'Error',
        description: 'Failed to update member',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (values: Omit<Member, 'id'>) => {
    updateMemberMutation.mutate(values);
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
