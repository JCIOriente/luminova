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
import { useState } from 'react';
import { MemberRepository } from '../repositories/memberRepository';
import type { MemberInput } from '../types/member';
import { MemberForm } from './MemberForm';

export function AddMemberDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const addMemberMutation = useMutation({
    mutationFn: (member: MemberInput) => MemberRepository.addMember(member),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      toast({
        title: 'Success',
        variant: 'default',
        description: 'Member added successfully',
      });
      setIsOpen(false);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to add member',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (values: MemberInput) => {
    addMemberMutation.mutate(values);
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
