/**
 * Banks a customer can connect under PSD2 (account information), with the
 * Finnish forms the texts need. Shared by the app (picker, logos) and the server.
 */
export type OtherBankInfo = { id: string; name: string; inessive: string; kind: 'bank' | 'neobank' };

export const OTHER_BANKS: OtherBankInfo[] = [
  { id: 'op', name: 'OP', inessive: 'OP:ssa', kind: 'bank' },
  { id: 'nordea', name: 'Nordea', inessive: 'Nordeassa', kind: 'bank' },
  { id: 'danske', name: 'Danske Bank', inessive: 'Danske Bankissa', kind: 'bank' },
  { id: 'revolut', name: 'Revolut', inessive: 'Revolutissa', kind: 'neobank' },
  { id: 'handelsbanken', name: 'Handelsbanken', inessive: 'Handelsbankenissa', kind: 'bank' },
  { id: 'aktia', name: 'Aktia', inessive: 'Aktiassa', kind: 'bank' },
  { id: 'saastopankki', name: 'Säästöpankki', inessive: 'Säästöpankissa', kind: 'bank' },
  { id: 'pop', name: 'POP Pankki', inessive: 'POP Pankissa', kind: 'bank' },
  { id: 'omasp', name: 'Oma Säästöpankki', inessive: 'Oma Säästöpankissa', kind: 'bank' },
  { id: 'alandsbanken', name: 'Ålandsbanken', inessive: 'Ålandsbankenissa', kind: 'bank' },
];

export const bankById = (id: string | undefined | null): OtherBankInfo | undefined => OTHER_BANKS.find((b) => b.id === id);
