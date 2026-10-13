import { byDetail } from '@/lib/http/rpc-errors';

/**
 * FORBIDDEN copy shared by nominate_collector and remove_collector. Both raise
 * FORBIDDEN for two different situations: an Administration key touched by
 * anyone but the CSO, and a faculty key outside the Dean's own faculty. The
 * routes used to answer "Key not in your department" for both, which told a
 * Dean on an Administration key the wrong reason.
 */
export const collectorForbidden = byDetail(
  [
    [
      /^only the CSO can (authorise|remove) collectors for administrative keys$/,
      'Only the CSO can manage collectors for Administration keys',
    ],
  ],
  'Key not in your department'
);
