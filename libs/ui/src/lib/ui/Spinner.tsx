import { LoaderCircle } from 'lucide-react';
import React from 'react';

import { cn } from '@luminova/utils';

const Spinner = React.forwardRef<
  SVGSVGElement,
  React.HTMLAttributes<SVGSVGElement>
>(({ className, ...props }, ref) => (
  <div className="flex w-full items-center justify-center">
    <LoaderCircle
      ref={ref}
      className={cn('animate-spin', className)}
      {...props}
    />
  </div>
));

export { Spinner };
