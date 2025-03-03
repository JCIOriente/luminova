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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
      type: 'Program',
      points: 0,
      description: '',
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
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select the type of event" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Program">Program</SelectItem>
                  <SelectItem value="Project">Project</SelectItem>
                  <SelectItem value="Activity">Activity</SelectItem>
                  <SelectItem value="Gala">Gala</SelectItem>
                </SelectContent>
              </Select>
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
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select member's role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Director">Director</SelectItem>
                  <SelectItem value="CoDirector">CoDirector</SelectItem>
                  <SelectItem value="Collaborator">Collaborator</SelectItem>
                  <SelectItem value="Participant">Participant</SelectItem>
                </SelectContent>
              </Select>
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
                <Input placeholder="Points" {...field} />
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
