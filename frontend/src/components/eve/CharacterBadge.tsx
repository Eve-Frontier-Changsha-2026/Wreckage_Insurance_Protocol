import { useEveCharacter } from '../../hooks/useEveCharacter';

export function CharacterBadge({
  characterObjectId,
}: {
  characterObjectId?: string;
}) {
  const { data: character, isLoading } = useEveCharacter(characterObjectId);

  if (!characterObjectId) return null;
  if (isLoading)
    return <span className="text-gray-400 text-sm">Loading...</span>;
  if (!character)
    return <span className="text-gray-500 text-sm">Unknown Character</span>;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-900/30 border border-indigo-700 rounded-full">
      <div className="w-2 h-2 rounded-full bg-green-400" />
      <span className="text-sm font-medium text-indigo-200">
        {character.name}
      </span>
    </div>
  );
}
