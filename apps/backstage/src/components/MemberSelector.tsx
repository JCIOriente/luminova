import React, { useState } from 'react';
import { Input } from '@luminova/ui';
import { Badge } from '@luminova/ui';
import { usePaginatedMembers } from '../features/members';

type MemberSelectorProps = {
  value: string[]; // selected ids
  onChange: (value: string[]) => void;
  placeholder?: string;
  pageSize?: number;
};

const MemberSelector = ({
  value,
  onChange,
  placeholder = 'Search for members',
  pageSize = 10,
}: MemberSelectorProps) => {
  const [inputValue, setInputValue] = useState('');
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    usePaginatedMembers(pageSize);

  const members = data?.pages.flatMap((page) => page.members) || [];
  const filteredMembers =
    inputValue === ''
      ? members
      : members.filter((member) =>
          member.name.toLowerCase().includes(inputValue.toLowerCase()),
        );

  const selectedMembers = members.filter((member) => value.includes(member.id));

  const handleSelect = (memberId: string) => {
    if (!value.includes(memberId)) {
      onChange([...value, memberId]);
    }
    setInputValue('');
  };

  const handleRemove = (memberId: string) => {
    onChange(value.filter((id) => id !== memberId));
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (
      scrollHeight - scrollTop === clientHeight &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  };

  return (
    <div className="space-y-2">
      {/* Input for searching members */}
      <Input
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        className="w-full"
      />

      {/* Selected members as badges */}
      <div className="flex flex-wrap gap-2">
        {selectedMembers.map((member) => (
          <Badge key={member.id} variant="secondary">
            {member.name}
            <button
              type="button"
              onClick={() => handleRemove(member.id)}
              className="ml-2 text-xs font-medium hover:text-red-500"
            >
              ✖
            </button>
          </Badge>
        ))}
      </div>

      {/* Dropdown list of filtered members */}
      {inputValue && (
        <div
          className="bg-background max-h-60 overflow-y-auto rounded-md border p-2 shadow-sm"
          onScroll={handleScroll}
        >
          {filteredMembers.length > 0 ? (
            filteredMembers.map((member) => (
              <div
                key={member.id}
                className="hover:bg-muted cursor-pointer rounded-md p-2"
                onClick={() => handleSelect(member.id)}
              >
                {member.name}
              </div>
            ))
          ) : (
            <div className="text-muted-foreground p-2">No results found.</div>
          )}
        </div>
      )}
    </div>
  );
};

export { MemberSelector };
