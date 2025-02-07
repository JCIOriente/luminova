import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@luminova/ui';
import { MemberRepository } from '../repositories/memberRepository';
import { Member } from '../types/member';
import { MemberForm } from './MemberForm';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@luminova/ui';

export function AddMemberDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const addMemberMutation = useMutation({
    mutationFn: (member: Omit<Member, 'id'>) =>
      MemberRepository.addMember(member),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      setIsOpen(false);
    },
    onError: (error) => {
      console.log(error);
    },
  });

  const handleSubmit = (values: Omit<Member, 'id'>) => {
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
