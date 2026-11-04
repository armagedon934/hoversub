import { RECIPES, recipeFileName } from '../src/code/workshop/recipes';
import { sandboxLevel } from '../src/code/run/levels';
import { UnityWorld } from '../src/code/run/unity';
for (const r of RECIPES.filter((x) => x.kind === 'unity')) {
  const w = new UnityWorld(sandboxLevel(r.code, recipeFileName(r)));
  const p = await w.load(r.code);
  if (p) { console.log(r.id, 'LOAD', p[0].message); continue; }
  const res = w.simulate(3, [{ until: 1, keys: ['ArrowRight'] }, { until: 1.5, keys: [' '] }, { until: 3, keys: ['ArrowLeft'] }]);
  console.log(r.id.padEnd(18), res.status, (res.message ?? '').slice(0, 150));
}
