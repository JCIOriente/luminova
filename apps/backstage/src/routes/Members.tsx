import { useState } from 'react';
import { MemberForm, FormValues } from '../components/MemberForm';
import { MemberTable } from '../components/MemberTable';
import { addMember, listMembers } from '../libs/members';
import { Label } from '@radix-ui/react-label';
import { Spinner } from '@luminova/ui';

export default function Members() {
  const [isLoading, setIsloading] = useState(false);

  const handleSubmit = async (values: FormValues) => {
    setIsloading(true);

    try {
      await addMember(values);
      alert('Member added successfully!');
    } catch (error) {
      alert('Error adding member');
      console.log(error);
    } finally {
      setIsloading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl fond-bold underline">Backstage</h1>
      <MemberForm onSubmit={handleSubmit} />
      {isLoading && <Label>Saving...</Label>}
      <Spinner />
      <MemberTable listMembers={listMembers} />
    </div>
  );
}
