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
import { PointRuleInput, PointRuleInputSchema } from '../types/pointRule';

type Props = {
  onSubmit: (values: PointRuleInput) => void;
  isLoading: boolean;
  initialValues?: PointRuleInput;
};

export function PointRuleForm({ onSubmit, isLoading, initialValues }: Props) {
  const form = useForm({
    resolver: zodResolver(PointRuleInputSchema),
    defaultValues: initialValues || {
      description: '',
      points: '',
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input placeholder="Enter description" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="points"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Points</FormLabel>
              <FormControl>
                <Input placeholder="Enter points" {...field} />
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
              : 'Add Point Rule'}
        </Button>
      </form>
    </Form>
  );
}
