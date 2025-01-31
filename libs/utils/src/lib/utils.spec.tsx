import { cn } from './utils';

describe('Utils', () => {
  it('should merge class names successfully', () => {
    const classes = cn('a', 'b', { c: 'c' });
    expect(classes).toBe('a b c');
  });
});
