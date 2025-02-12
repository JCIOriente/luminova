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
  multiple?: boolean; // Enable multi-selection
};

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = 'Search...',
  isLoading = false,
  multiple = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');

  const selectedValues = Array.isArray(value) ? value : [value];
  const filteredOptions =
    inputValue === ''
      ? options
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
      onValueChange(selectedValue); // Single selection
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
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
      <PopoverContent className="w-full p-4">
        <Command>
          <CommandInput
            placeholder={placeholder}
            value={inputValue}
            onValueChange={setInputValue}
            className="h-9"
          />
          <CommandEmpty>
            {isLoading ? 'Loading...' : 'No results found.'}
          </CommandEmpty>
          <CommandGroup>
            <CommandList>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  onSelect={() => {
                    handleSelect(option.value);
                    setInputValue(''); // Clear the input after selection
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selectedValues.includes(option.value)
                        ? 'opacity-100'
                        : 'opacity-0',
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandList>
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
