import { cn } from '@luminova/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from 'cmdk';
import { Check, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';
import { Button } from './Button';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

type Option = {
  value: string;
  label: string;
};

type ComboboxProps = {
  options: Option[];
  value: string | string[]; // Single value or array for multi-selection
  onValueChange: (value: string | string[]) => void;
  placeholder?: string;
  isLoading?: boolean;
  multiple?: boolean;
  pageSize?: number;
};

export const Combobox = React.forwardRef<HTMLButtonElement, ComboboxProps>(
  (
    {
      options,
      value,
      onValueChange,
      placeholder = 'Search...',
      isLoading = false,
      multiple = false,
      pageSize = 10,
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const [inputValue, setInputValue] = React.useState('');
    const [page, setPage] = React.useState(1);
    const triggerRef = React.useRef<HTMLButtonElement>(null);

    const selectedValues = Array.isArray(value) ? value : [value];
    const filteredOptions =
      inputValue === ''
        ? options.slice(0, page * pageSize)
        : options.filter((option) =>
            option.label.toLowerCase().includes(inputValue.toLowerCase()),
          );

    const handleSelect = (selectedValue: string) => {
      if (multiple) {
        const newValues = selectedValues.includes(selectedValue)
          ? selectedValues.filter((v) => v !== selectedValue) // Deselect if already selected
          : [...selectedValues, selectedValue]; // Add to selection
        onValueChange(newValues);
      } else {
        onValueChange(selectedValue);
        setOpen(false);
      }
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      if (scrollHeight - scrollTop === clientHeight) {
        setPage((prev) => prev + 1); // Load more options
      }
    };

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'w-full justify-between text-left font-normal',
              !selectedValues.length && 'text-muted-foreground',
            )}
            ref={(el) => {
              triggerRef.current = el;
              if (typeof ref === 'function') {
                ref(el);
              } else if (ref) {
                ref.current = el;
              }
            }}
          >
            {multiple
              ? selectedValues.length > 0
                ? `${selectedValues.length} selected`
                : placeholder
              : selectedValues[0]
                ? options.find((option) => option.value === selectedValues[0])
                    ?.label
                : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="overflow-hidden p-0"
          align="start"
          style={{
            width: triggerRef.current?.offsetWidth, // Match the width of the trigger
          }}
        >
          <Command>
            <CommandInput
              placeholder={placeholder}
              value={inputValue}
              onValueChange={setInputValue}
              className="h-9 w-full border-b px-4 focus:border-b focus:outline-none"
            />
            <CommandEmpty>
              {isLoading ? 'Loading...' : 'No results found.'}
            </CommandEmpty>
            <CommandGroup>
              <CommandList className="py-1.5">
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      handleSelect(option.value);
                      setInputValue('');
                    }}
                    className="hover:bg-accent mx-2 flex items-center justify-between rounded-sm px-2 py-1.5 text-sm"
                  >
                    <span>{option.label}</span>
                    <Check
                      className={cn(
                        'h-4 w-4',
                        selectedValues.includes(option.value)
                          ? 'opacity-100'
                          : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandList>
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    );
  },
);

Combobox.displayName = 'Combobox';
