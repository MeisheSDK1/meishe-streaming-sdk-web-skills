import { NestedTimelineClip, addNestedTimelineClip } from '../timeline/nested-timeline';
import {
  TemplatePackageLoadRequest,
  loadTemplatePackageTimeline,
} from './template-package-loading';

export interface NestedTemplateRequest extends TemplatePackageLoadRequest {
  inPointUs: number;
  trimInUs?: number;
  trimOutUs?: number;
}

export async function addTemplatePackageToTrack(
  context: NvsStreamingContext,
  parentTrack: NvsVideoTrack,
  request: NestedTemplateRequest,
): Promise<NestedTimelineClip> {
  const loaded = await loadTemplatePackageTimeline(context, request);
  try {
    return await addNestedTimelineClip(
      context,
      parentTrack,
      loaded.timeline,
      request.inPointUs,
      request.trimInUs ?? 0,
      request.trimOutUs ?? loaded.timeline.getDuration(),
      true,
    );
  } catch (error) {
    await loaded.remove();
    throw error;
  }
}
