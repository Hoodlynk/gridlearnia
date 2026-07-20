import { parentPort, workerData } from 'worker_threads';
import { solve } from './solver';
import { Problem } from './types';

/**
 * Worker entrypoint for the solver. The solve is CPU-bound and can run for
 * seconds; running it here keeps the Fastify event loop free. The engine is
 * pure and takes a plain {@link Problem} (its `Set`/`Map` fields survive the
 * structured clone of `workerData`), so nothing else needs to move.
 */
if (parentPort) {
  const solution = solve(workerData as Problem);
  parentPort.postMessage(solution);
}
