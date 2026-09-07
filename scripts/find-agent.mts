import { listCategory } from '../src/lib/marketplace';
import { CATEGORIES } from '../src/lib/agents/categories';

for (const { id } of CATEGORIES) {
  for (const l of await listCategory(id, { limit: 16 })) {
    if (/beefy|heyanon/i.test(l.agent.name)) {
      console.log(`${l.agent.name}\n  category=${id} chain=${l.agent.chain_id} token=${l.agent.token_id} attest=${l.attestationCount}`);
    }
  }
}
