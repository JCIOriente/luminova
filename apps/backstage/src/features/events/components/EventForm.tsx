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
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectItem,
  SelectContent,
  SelectValue,
  SelectTrigger,
} from '@luminova/ui';
import { useForm } from 'react-hook-form';
import { EventInput, EventInputSchema } from '../types/event';

type Props = {
  onSubmit: (values: EventInput) => void;
  isLoading: boolean;
  initialValues?: EventInput;
};

export function EventForm({ onSubmit, isLoading, initialValues }: Props) {
  const form = useForm({
    resolver: zodResolver(EventInputSchema),
    defaultValues: initialValues || {
      type: 'Program',
      name: '',
      description: '',
      scope: 'Local',
      startDate: Date.now(),
      endDate: Date.now(),
      directorId: '',
      coDirectorIds: [],
      assistantIds: [],
      parentId: '',
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Step 1: Select Event Type */}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Event Type</FormLabel>
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

        {/* Step 2: Basic Details */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter event name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input placeholder="Enter event description" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="scope"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Scope</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="flex flex-row space-x-4"
                >
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="Local" />
                    </FormControl>
                    <FormLabel className="font-normal">Local</FormLabel>
                  </FormItem>

                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="National" />
                    </FormControl>
                    <FormLabel className="font-normal">National</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Step 3: Assign Roles */}
        <FormField
          control={form.control}
          name="directorId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Director</FormLabel>
              <FormControl>
                <Input placeholder="Search for director" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="coDirectorIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Co-Directors</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter co-director IDs (comma-separated)"
                  value={field.value.join(',')}
                  onChange={(e) => field.onChange(e.target.value.split(','))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="assistantIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Assistants/Collaborators</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter assistant IDs (comma-separated)"
                  value={field.value.join(',')}
                  onChange={(e) => field.onChange(e.target.value.split(','))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Step 4: Link to Parent Entity */}
        {form.watch('type') === 'Activity' && (
          <FormField
            control={form.control}
            name="parentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Parent Program/Project</FormLabel>
                <FormControl>
                  <Input placeholder="Enter parent ID" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Step 5: Submit */}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading
            ? 'Saving...'
            : initialValues
              ? 'Save Changes'
              : 'Add Event'}
        </Button>
      </form>
    </Form>
  );
}
