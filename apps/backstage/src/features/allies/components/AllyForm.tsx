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
} from '@luminova/ui'; // Assuming @luminova/ui is your UI library
import { useForm } from 'react-hook-form';
import type { AllyInput } from '../types/ally';
import { AllyInputSchema } from '../types/ally';

type AllyFormProps = {
  onSubmit: (values: AllyInput) => void;
  isLoading: boolean;
  initialValues?: AllyInput;
};

export function AllyForm({
  onSubmit,
  isLoading,
  initialValues,
}: AllyFormProps) {
  const form = useForm<AllyInput>({
    resolver: zodResolver(AllyInputSchema),
    defaultValues: initialValues || {
      companyName: '',
      personInCharge: '',
      phone: '',
      email: '',
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="companyName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Company Name</FormLabel>
              <FormControl>
                <Input placeholder="Luminova Inc." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="personInCharge"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Person in Charge</FormLabel>
              <FormControl>
                <Input placeholder="Jane Doe" {...field} />
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
                <Input placeholder="+1 555-123-4567" {...field} />
              </FormControl>
              <FormMessage />
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
                <Input placeholder="contact@luminova.com" {...field} />
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
              : 'Add Ally'}
        </Button>
      </form>
    </Form>
  );
}