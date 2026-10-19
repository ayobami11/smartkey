import { KeyCard, type Key } from '@/app/cso/keys/_components/key-card';

type Props = {
  keys: Key[];
  /** Copies free per key id, from get_key_occupancy(). */
  availableByKey?: ReadonlyMap<string, number>;
  onMarkLost: (key: { id: string; code: string }) => void;
};

export const KeyCards = ({ keys, availableByKey, onMarkLost }: Props) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {keys.map((keyItem) => (
      <KeyCard
        key={keyItem.id}
        keyItem={keyItem}
        available={availableByKey?.get(keyItem.id) ?? null}
        onMarkLost={onMarkLost}
      />
    ))}
  </div>
);
