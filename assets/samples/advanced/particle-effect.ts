import { AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';

export interface ParticlePositionPoint {
  /** Seconds relative to the particle effect in-point. */
  timeSec: number;
  /** Particle-package coordinate expected by the selected emitter. */
  x: number;
  y: number;
}

export interface ParticleEffectOptions {
  packageRef: AssetPackageRef;
  inPointUs: number;
  durationUs: number;
  partitionIndex?: number;
  rateGain?: number;
  particleSizeGain?: number;
  initialPosition?: NvsPointF;
  positionCurve?: ParticlePositionPoint[];
}

export async function addParticleEffect(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  options: ParticleEffectOptions,
): Promise<{ effect: NvsTimelineVideoFx; emitterNames: string[]; remove(): Promise<void> }> {
  if (options.inPointUs < 0 || options.durationUs <= 0 || options.inPointUs >= timeline.getDuration()) {
    throw new Error('Particle effect range must start inside the timeline and have positive duration.');
  }
  if ((options.rateGain ?? 1) < 0 || (options.particleSizeGain ?? 1) < 0) {
    throw new Error('Particle rate and size gains cannot be negative.');
  }
  const partitionIndex = options.partitionIndex ?? 0;
  if (!Number.isInteger(partitionIndex) || partitionIndex < 0) {
    throw new Error('Particle partition index must be a non-negative integer.');
  }
  const curve = [...(options.positionCurve ?? [])].sort((left, right) => left.timeSec - right.timeSec);
  const durationSec = options.durationUs / 1_000_000;
  if (curve.some((point) => point.timeSec < 0 || point.timeSec > durationSec)) {
    throw new Error('Particle position-curve times must be effect-local seconds inside its duration.');
  }

  requireReadyAssetPackage(context, options.packageRef, 'particle video-effect package');
  const manager = context.getAssetPackageManager();
  if (!manager.isParticleFX(options.packageRef.id)) {
    throw new Error('The Ready video-effect package is not identified as a particle effect.');
  }
  const description = manager.getVideoFxAssetPackageDescription(options.packageRef.id);
  if (!description) throw new Error('The particle package has no parseable effect description.');
  const parser = new NvsAssetPackageParticleDescParser(description);
  const emitterNames = parser.getParticlePartitionEmitter(partitionIndex);
  if (emitterNames.length === 0) {
    throw new Error(`The particle package has no emitters in partition ${partitionIndex}.`);
  }

  await context.streamingEngineReadyForTimelineModification();
  const effect = timeline.addPackagedTimelineVideoFx(
    options.inPointUs,
    options.durationUs,
    options.packageRef.id,
  );
  if (!effect) throw new Error('The SDK could not add the particle effect.');
  try {
    const particle = effect.getParticleSystemContext();
    for (const emitterName of emitterNames) {
      particle.setEmitterEnabled(emitterName, true);
      if (options.rateGain !== undefined) particle.setEmitterRateGain(emitterName, options.rateGain);
      if (options.particleSizeGain !== undefined) {
        particle.setEmitterParticleSizeGain(emitterName, options.particleSizeGain);
      }
      if (options.initialPosition) {
        particle.setEmitterPosition(emitterName, options.initialPosition.x, options.initialPosition.y);
      }
      for (const point of curve) {
        particle.appendPositionToEmitterPositionCurve(emitterName, point.timeSec, point.x, point.y);
      }
    }
  } catch (error) {
    timeline.removeTimelineVideoFx(effect);
    throw error;
  }

  return {
    effect,
    emitterNames,
    async remove() {
      await context.streamingEngineReadyForTimelineModification();
      timeline.removeTimelineVideoFx(effect);
    },
  };
}
