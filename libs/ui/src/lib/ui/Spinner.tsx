import React from 'react';
import { LoaderCircle } from 'lucide-react';

import { cn } from '@luminova/utils';

const Spinner = React.forwardRef<
  SVGSVGElement,
  React.HTMLAttributes<SVGSVGElement>
>(({ className, ...props }, ref) => (
  <div>
    <LoaderCircle
      ref={ref}
      className={cn('animate-spin', className)}
      {...props}
    />
  </div>
));

export { Spinner };
