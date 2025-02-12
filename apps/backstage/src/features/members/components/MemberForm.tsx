import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@luminova/ui';
import { useForm } from 'react-hook-form';
import type { MemberInput } from '../types/member';
import { MemberInputSchema } from '../types/member';

type MemberFormProps = {
  onSubmit: (values: MemberInput) => void;
  isLoading: boolean;
  initialValues?: MemberInput;
};

function sanitizeProfilePictureValue(initialValues?: MemberInput) {
  if (!initialValues) {
    return;
  }

  if (
    typeof initialValues.profilePicture === 'string' &&
    initialValues.profilePicture === ''
  ) {
    delete initialValues.profilePicture;
  }
}

export function MemberForm({
  onSubmit,
  isLoading,
  initialValues,
}: MemberFormProps) {
  sanitizeProfilePictureValue(initialValues);

  const form = useForm<MemberInput>({
    resolver: zodResolver(MemberInputSchema),
    defaultValues: initialValues || {
      name: '',
      email: '',
      phone: '',
      role: '',
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="John Doe" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="john@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input placeholder="+1234567890" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <FormControl>
                <Input placeholder="Member" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="profilePicture"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Profile Picture</FormLabel>
              <FormControl>
                <Input
                  type="file"
                  onChange={(e) => field.onChange(e.target.files?.[0] || null)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading
            ? 'Saving...'
            : initialValues
              ? 'Save Changes'
              : 'Add member'}
        </Button>
      </form>
    </Form>
  );
}
