import React from 'react';
import { cn } from '../lib/utils';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => {
  return (
    <div 
      className={cn(
        "animate-pulse rounded-2xl bg-zinc-200/50 dark:bg-zinc-800/50",
        className
      )} 
    />
  );
};
