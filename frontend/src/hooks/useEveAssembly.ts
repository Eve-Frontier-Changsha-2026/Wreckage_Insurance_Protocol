import { useQuery } from '@tanstack/react-query';
import { getAssemblyWithOwner, transformToAssembly } from '@evefrontier/dapp-kit';

export function useEveAssembly(assemblyObjectId: string | undefined) {
  return useQuery({
    queryKey: ['eve-assembly', assemblyObjectId],
    queryFn: async () => {
      if (!assemblyObjectId) return null;
      const { moveObject, character } =
        await getAssemblyWithOwner(assemblyObjectId);
      if (!moveObject) return null;
      const assembly = await transformToAssembly(assemblyObjectId, moveObject, {
        character,
      });
      return { assembly, character };
    },
    enabled: !!assemblyObjectId,
  });
}
