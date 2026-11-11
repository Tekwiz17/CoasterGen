/** Four-connected pixels of the displayed color, keeping separate islands separate. */
export function connectedArea(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  boundaries: Uint8ClampedArray = data,
) {
  const start = Math.floor(y) * width + Math.floor(x);
  if (x < 0 || y < 0 || x >= width || y >= height || data[start * 4 + 3] < 128)
    return [];
  const seen = new Uint8Array(width * height),
    queue = new Uint32Array(width * height);
  let head = 0,
    tail = 0;
  const add = (i: number) => {
    if (seen[i]) return;
    seen[i] = 1;
    if (data[i * 4 + 3] < 128 || boundaries[i * 4 + 3] < 128) return;
    let error = 0;
    for (let c = 0; c < 3; c++)
      error += (data[i * 4 + c] - data[start * 4 + c]) ** 2;
    if (error > 32 ** 2) return;
    let originalError = 0;
    for (let c = 0; c < 3; c++)
      originalError += (boundaries[i * 4 + c] - boundaries[start * 4 + c]) ** 2;
    if (originalError > 32 ** 2) return;
    queue[tail++] = i;
  };
  add(start);
  while (head < tail) {
    const i = queue[head++],
      col = i % width;
    if (col) add(i - 1);
    if (col + 1 < width) add(i + 1);
    if (i >= width) add(i - width);
    if (i + width < width * height) add(i + width);
  }
  return queue.subarray(0, tail);
}
