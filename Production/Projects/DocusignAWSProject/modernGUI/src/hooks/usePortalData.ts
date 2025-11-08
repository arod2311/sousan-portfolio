import { useQuery } from '@tanstack/react-query';
import { fetchPortalSnapshot } from '../lib/mockData';

export function usePortalData() {
  return useQuery({
    queryKey: ['portal-snapshot'],
    queryFn: fetchPortalSnapshot,
    staleTime: 1000 * 30
  });
}

