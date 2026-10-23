import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent, type ReactNode } from 'react';
import {
  DEFAULT_EDITOR_LAYOUT,
  formatTimelineTimecode,
  getTimelineRulerTicks,
  getTimelineScale,
  planTimelineThumbnailTiles,
  timelinePointerToTimeUs,
  timelineTimeToPercent,
  type TimelineThumbnail,
} from './default-editor-layout';
import './default-editor-ui.css';

export interface DefaultEditorShellProps {
  navigation: ReactNode;
  featurePanel: ReactNode;
  preview: ReactNode;
  inspector: ReactNode;
  timeline: ReactNode;
}

export interface UiMediaAsset {
  id: string;
  name: string;
  durationUs: number;
  thumbnailUrl?: string;
  timelineThumbnails: TimelineThumbnail[];
}

export interface UiTimelineClip {
  id: string;
  assetId: string;
  name: string;
  inPointUs: number;
  outPointUs: number;
  trimInUs: number;
  trimOutUs: number;
}

export interface DefaultEditorUiProps {
  assets: UiMediaAsset[];
  clip: UiTimelineClip | null;
  durationUs: number;
  positionUs: number;
  fps: number;
  playing: boolean;
  busy?: boolean;
  error?: string;
  canvasId?: string;
  selectedClipId?: string | null;
  onImport(): void;
  onAddAsset(assetId: string): void;
  onSeek(timeUs: number): void;
  onTogglePlayback(): void;
  onSelectClip?(clipId: string | null): void;
}

export function DefaultEditorShell(props: DefaultEditorShellProps) {
  return <main className="ms-editor-shell">
    <nav className="ms-editor-nav">{props.navigation}</nav>
    <aside className="ms-editor-features">{props.featurePanel}</aside>
    <section className="ms-editor-preview">{props.preview}</section>
    <aside className="ms-editor-inspector">{props.inspector}</aside>
    <section className="ms-editor-timeline">{props.timeline}</section>
  </main>;
}

export function DefaultEditorUi(props: DefaultEditorUiProps) {
  const [zoom, setZoom] = useState(1);
  const [timelineCanvasWidthPx, setTimelineCanvasWidthPx] = useState<number>(DEFAULT_EDITOR_LAYOUT.minimumTimelineCanvasWidthPx);
  const timelineCanvasRef = useRef<HTMLDivElement | null>(null);
  const referenceDurationUsRef = useRef(0);
  if (props.durationUs <= 0) referenceDurationUsRef.current = 0;
  else if (!referenceDurationUsRef.current) referenceDurationUsRef.current = props.durationUs;

  const referenceDurationUs = referenceDurationUsRef.current || props.durationUs || 1;
  const { scaleUs, canvasWidthPercent } = getTimelineScale(props.durationUs, referenceDurationUs, zoom);
  const rulerTicks = getTimelineRulerTicks(scaleUs, referenceDurationUs, zoom);
  const clipAsset = props.clip ? props.assets.find(({ id }) => id === props.clip?.assetId) : undefined;
  const selectedClip = props.clip && (props.selectedClipId === undefined || props.selectedClipId === props.clip.id)
    ? props.clip
    : null;
  const renderedClipWidthPx = props.clip
    ? (props.clip.outPointUs - props.clip.inPointUs) / scaleUs
      * Math.max(1, timelineCanvasWidthPx - DEFAULT_EDITOR_LAYOUT.timelineLabelWidthPx)
    : 0;
  const clipTiles = props.clip && clipAsset
    ? planTimelineThumbnailTiles(
      clipAsset.timelineThumbnails.length
        ? clipAsset.timelineThumbnails
        : clipAsset.thumbnailUrl ? [{ timestampUs: 0, dataUrl: clipAsset.thumbnailUrl }] : [],
      props.clip.trimInUs,
      props.clip.trimOutUs,
      renderedClipWidthPx,
    )
    : [];

  useEffect(() => {
    const canvas = timelineCanvasRef.current;
    if (!canvas) return;
    const update = () => setTimelineCanvasWidthPx(Math.round(canvas.getBoundingClientRect().width));
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    update();
    return () => observer.disconnect();
  }, []);

  const seekFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    props.onSeek(timelinePointerToTimeUs(event.clientX, bounds.left, bounds.width, scaleUs, props.durationUs));
  };
  const beginTimelineSeek = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    props.onSelectClip?.(null);
    seekFromPointer(event);
  };
  const continueTimelineSeek = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || (event.buttons & 1) === 0) return;
    event.preventDefault();
    seekFromPointer(event);
  };
  const endTimelineSeek = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    seekFromPointer(event);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const cancelTimelineSeek = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const changeZoom = (event: ChangeEvent<HTMLInputElement>) => setZoom(Number(event.target.value));

  const featurePanel = <>
    <header className="ms-panel-heading"><strong>素材</strong><span>{props.assets.length} 项</span></header>
    <div className="ms-panel-content">
      <button className="ms-primary-button" type="button" disabled={props.busy} onClick={props.onImport}>＋ 导入本地视频</button>
      {props.error && <p className="ms-error" role="alert">{props.error}</p>}
      <p className="ms-section-caption">本地素材</p>
      <div className="ms-assets">
        {props.assets.map((asset) => <article className="ms-asset-card" key={asset.id}>
          <span className="ms-asset-thumbnail">
            {asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt="" /> : 'VIDEO'}
            <small>{formatTimelineTimecode(asset.durationUs, props.fps)}</small>
          </span>
          <span className="ms-asset-copy"><strong>{asset.name}</strong><small>本地视频</small></span>
          <button type="button" disabled={props.busy} onClick={() => props.onAddAsset(asset.id)} aria-label={`添加 ${asset.name} 到时间线`}>＋</button>
        </article>)}
        {!props.assets.length && <div className="ms-empty"><span>▧</span><strong>暂无素材</strong><small>导入视频后在这里管理</small></div>}
      </div>
    </div>
  </>;

  const preview = <>
    <header className="ms-panel-heading"><strong>预览</strong><span>LiveWindow</span></header>
    <div className="ms-preview-viewport"><div className="ms-preview-stage"><canvas id={props.canvasId ?? 'live-window'} /></div></div>
    <footer className="ms-transport">
      <span><b>{formatTimelineTimecode(props.positionUs, props.fps)}</b><i>/</i>{formatTimelineTimecode(props.durationUs, props.fps)}</span>
      <button type="button" disabled={!props.durationUs || props.busy} onClick={props.onTogglePlayback} aria-label={props.playing ? '暂停' : '播放'}>{props.playing ? 'Ⅱ' : '▶'}</button>
    </footer>
  </>;

  const navigation = <>
    <div className="ms-editor-brand"><span>剪</span><strong>EDITOR</strong></div>
    <div className="ms-editor-nav-item active"><span>▧</span><strong>素材</strong></div>
  </>;

  const inspector = <>
    <header className="ms-panel-heading"><strong>编辑</strong><span>{selectedClip ? '视频片段' : '未选择'}</span></header>
    <div className="ms-inspector-content">
      {selectedClip ? <section className="ms-inspector-card">
        <p>基础属性</p>
        <dl>
          <div><dt>名称</dt><dd>{selectedClip.name}</dd></div>
          <div><dt>入点</dt><dd>{formatTimelineTimecode(selectedClip.inPointUs, props.fps)}</dd></div>
          <div><dt>出点</dt><dd>{formatTimelineTimecode(selectedClip.outPointUs, props.fps)}</dd></div>
          <div><dt>时长</dt><dd>{formatTimelineTimecode(selectedClip.outPointUs - selectedClip.inPointUs, props.fps)}</dd></div>
        </dl>
      </section> : <div className="ms-inspector-empty"><span>◇</span><strong>未选择时间线项目</strong><small>选择片段后在这里查看和编辑属性</small></div>}
    </div>
  </>;

  const timeline = <>
    <header className="ms-timeline-heading">
      <span><strong>时间线</strong><small>1 条视频轨</small></span>
      <label className="ms-timeline-zoom" aria-label="时间线缩放">
        <button type="button" disabled={!props.durationUs || zoom <= DEFAULT_EDITOR_LAYOUT.zoomMin} onClick={() => setZoom((value) => Math.max(DEFAULT_EDITOR_LAYOUT.zoomMin, value - DEFAULT_EDITOR_LAYOUT.zoomStep))}>−</button>
        <input type="range" min={DEFAULT_EDITOR_LAYOUT.zoomMin} max={DEFAULT_EDITOR_LAYOUT.zoomMax} step={DEFAULT_EDITOR_LAYOUT.zoomStep} value={zoom} disabled={!props.durationUs} onChange={changeZoom} />
        <button type="button" disabled={!props.durationUs || zoom >= DEFAULT_EDITOR_LAYOUT.zoomMax} onClick={() => setZoom((value) => Math.min(DEFAULT_EDITOR_LAYOUT.zoomMax, value + DEFAULT_EDITOR_LAYOUT.zoomStep))}>＋</button>
      </label>
    </header>
    <div className="ms-timeline-scroll">
      <div ref={timelineCanvasRef} className="ms-timeline-canvas" style={{ width: `${canvasWidthPercent}%` }}>
        <div className="ms-timeline-ruler" onPointerDown={beginTimelineSeek} onPointerMove={continueTimelineSeek} onPointerUp={endTimelineSeek} onPointerCancel={cancelTimelineSeek}>
          {rulerTicks.map(({ timeUs, major }) => <span key={timeUs} className={major ? 'major' : ''} style={{ left: `${timelineTimeToPercent(timeUs, scaleUs)}%` }}>{major && <em>{formatTimelineTimecode(timeUs, props.fps)}</em>}</span>)}
        </div>
        <div className="ms-track-row">
          <div className="ms-track-label"><strong>V1</strong><small>视频</small></div>
          <div className="ms-track-lane" onPointerDown={beginTimelineSeek} onPointerMove={continueTimelineSeek} onPointerUp={endTimelineSeek} onPointerCancel={cancelTimelineSeek}>
            {props.clip && <div className={`ms-video-clip ${selectedClip ? 'selected' : ''}`} style={{ left: `${timelineTimeToPercent(props.clip.inPointUs, scaleUs)}%`, width: `${timelineTimeToPercent(props.clip.outPointUs - props.clip.inPointUs, scaleUs)}%` }} onPointerDown={(event: PointerEvent<HTMLDivElement>) => { event.stopPropagation(); props.onSelectClip?.(props.clip?.id ?? null); }}>
              {!!clipTiles.length && <span className="ms-clip-thumbnails">{clipTiles.map((tile, index) => <img key={`${index}-${tile.timestampUs}`} src={tile.dataUrl} alt="" />)}</span>}
              <span className="ms-clip-title">{props.clip.name}</span>
            </div>}
          </div>
        </div>
        {!props.clip && <div className="ms-timeline-empty">从左侧素材列表添加片段到时间线</div>}
        {!!props.durationUs && <div className="ms-playhead" style={{ left: `calc(${DEFAULT_EDITOR_LAYOUT.timelineLabelWidthPx}px + (100% - ${DEFAULT_EDITOR_LAYOUT.timelineLabelWidthPx}px) * ${timelineTimeToPercent(props.positionUs, scaleUs) / 100})` }} />}
      </div>
    </div>
  </>;

  return <DefaultEditorShell navigation={navigation} featurePanel={featurePanel} preview={preview} inspector={inspector} timeline={timeline} />;
}
