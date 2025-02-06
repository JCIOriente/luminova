import React from 'react';
import { LoaderCircle } from 'lucide-react';

import { cn } from '@luminova/utils';

const Spinner = React.forwardRef<SVGElement, React.HTMLAttributes<SVGElement>>(
  ({ className, ...props }) => (
    <div className="w-full">
      <LoaderCircle className={cn('animate-spin', className)} {...props} />
    </div>
  )
);

export { Spinner };
