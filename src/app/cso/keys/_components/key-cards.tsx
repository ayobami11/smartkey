import { KeyCard, type Key } from '@/app/cso/keys/_components/key-card';

type Props = {
  keys: Key[];
  onMarkLost: (key: { id: string; code: string }) => void;
};

export const KeyCards = ({ keys, onMarkLost }: Props) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {keys.map((keyItem) => (
      <KeyCard key={keyItem.id} keyItem={keyItem} onMarkLost={onMarkLost} />
    ))}
  </div>
);
