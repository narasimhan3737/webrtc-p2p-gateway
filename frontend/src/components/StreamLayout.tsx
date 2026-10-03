import type { Camera } from '../types';
import { WebRTCPlayer } from './WebRTCPlayer';

type Props = {
  cameras: Camera[];
  gridSize: number;
};

export function StreamLayout({ cameras, gridSize }: Props) {
  const size = Math.max(1, Math.min(4, gridSize));
  const slots = size * size;
  const tiles = Array.from({ length: slots }, (_, i) => cameras[i] ?? null);

  return (
    <div
      className="stream-grid"
      style={{
        gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`,
      }}
    >
      {tiles.map((cam, i) =>
        cam ? (
          <WebRTCPlayer key={cam.id} camera={cam} />
        ) : (
          <div key={`empty-${i}`} className="stream-tile empty">
            <span>No Stream</span>
          </div>
        ),
      )}
    </div>
  );
}
