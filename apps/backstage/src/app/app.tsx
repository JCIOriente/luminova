import { useState } from 'react';
import { MemberForm } from '../components/MemberForm';
import { addMember } from '../libs/members';
import { Label } from '@radix-ui/react-label';

export function App() {
  const [isLoading, setIsloading] = useState(false);

  const handleSubmit = async (values: any) => {
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
    </div>
  );
}

export default App;
